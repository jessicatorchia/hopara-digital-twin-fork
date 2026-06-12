import io
from typing import Any

from PIL import Image, ImageFilter

from api.image.image_path import ImagePath
from api.image.image_repository import ImageRepository
from api.image.message_factory import (
    create_image_to_shape_step, create_resize_image_to_resolutions_steps)
from common.angle import angles
from common.client.cache import Cache
from common.client.queue import Queue
from common.path import path_join
from common.process_resource_event import (ResourceStep,
                                           ResourceStepNotification)
from common.resolution import Resolution
from common.resource_path import ResourcePath
from common.resource_result import ResourceResult
from common.version import VersionFactory


class IsometrifyService:
    old_processed_path: str
    current_version: int

    def __init__(
            self,
            repository: ImageRepository,
            queue: Queue,
            version_factory: VersionFactory,
            cache: Cache,
            tenant: str,
            library: str,
            name: str,
            invalidate: bool = True,
    ):
        self.repository = repository
        self.queue = queue
        self.cache = cache
        self.tenant = tenant
        self.library = library
        self.name = name
        self.invalidate = invalidate
        self.new_version = version_factory.create()
        current_version = self.repository.get_latest_version(tenant, library, name)

        self.cwd = ImagePath.get_base_dir(tenant, library, name)

        if not current_version:
            raise FileNotFoundError(f'Image {self.name} not found in library {self.library}')
        self.current_version = current_version

        old_processed_path = self.repository.get_higher_resolution_path(self.cwd, self.current_version)
        if not old_processed_path:
            raise FileNotFoundError(f'Image {self.name} not found in library {self.library}')
        self.old_processed_path = old_processed_path

        self.processed_base_dir = ImagePath.get_base_dir(tenant, library, name)

        self.fake_render_path = 'cache_fake_render.webp'

        self.cache_wf_path = 'cache_wireframe'
        self.cache_wf_files = [f'{self.cache_wf_path}_{a}.webp' for a in angles]

        self.cache_render_files = [f'cache_render_{a}.webp' for a in angles]

        self.processed_fallback_image_file = f'{self.new_version}/{Resolution.default_size()}.webp'
        self.processed_image_files = [f'{self.new_version}/{Resolution.default_size()}_{a}.webp' for a in angles]

        self.new_original_path = ImagePath.get_raw_file_path(self.new_version)
        self.new_original_fallback_file = f'{self.new_original_path}'
        self.new_original_files = [f'{self.new_original_path}_{a}' for a in angles]

        self.model_path = 'cache_model.glb'
        self.hint = "" if name.isdigit() else f"This is a '{name}'."

        self.progress_image_path = ResourcePath.get_progress_image_path()

        self.lower_res = self.repository.get_lower_resolution_path(self.cwd, self.current_version)

        self.invalidation_urls = [ImagePath.get_invalidation_path(tenant, library, name)] if invalidate else []

    def _create_notification(self, value: float) -> ResourceStepNotification:
        return ResourceStepNotification(
            tenant=self.tenant,
            library=self.library,
            name=self.name,
            progress=value,
            event='GENERATE_PROGRESS',
        )

    def _image_to_fake_render_step(self) -> ResourceStep:
        return ResourceStep(
            cwd=self.cwd,
            type='image_to_fake_render',
            data={
                "origin": self.new_original_path,
                "destination": self.fake_render_path,
                "hint": self.hint,
            },
            use_cache=True,
            notification=self._create_notification(0.25),
        )

    def _image_to_model_step(self) -> ResourceStep:
        return ResourceStep(
            cwd=self.cwd,
            type='image_to_model',
            data={
                "origin": self.fake_render_path,
                "destination": self.model_path,
            },
            use_cache=True,
            notification=self._create_notification(0.65),
        )

    def _model_to_image_step(self) -> ResourceStep:
        parallel = ResourceStep(cwd=self.cwd, type='parallel', steps=[])
        parallel_steps = parallel['steps']
        invalidation_urls = self.invalidation_urls + [
            ImagePath.get_shape_list_invalidation_path(self.tenant, self.library)
        ] if self.invalidate else []
        for index, angle in enumerate(angles):
            sequential = ResourceStep(
                cwd=self.cwd,
                type='sequential',
                steps=[]
            )
            sequential_steps = sequential['steps']
            sequential_steps.append(ResourceStep(
                cwd=self.cwd,
                type='model_to_image',
                data={
                    "origin": self.model_path,
                    "destinations": [self.cache_render_files[index]],
                    "angles": [angle],
                    "resolution": "md",
                },
                notification=self._create_notification(0.8),
                use_cache=True,
            ))
            sequential_steps.append(ResourceStep(
                cwd=self.cwd,
                type='copy',
                data={
                    "origin": self.cache_render_files[index],
                    "destinations": [
                        self.new_original_files[index],
                        self.processed_image_files[index]
                    ]
                },
                notification=self._create_notification(1.0),
            ))
            parallel2 = ResourceStep(cwd=self.cwd, type='parallel', steps=[])
            parallel2['steps'].append(create_image_to_shape_step(
                self.cwd,
                self.processed_image_files[index],
                angle,
                invalidation_urls
            ))
            parallel2['steps'] += create_resize_image_to_resolutions_steps(
                self.cwd,
                self.new_original_files[index],
                invalidation_urls,
                list(Resolution.get_compatible(ignore_default=True, max_size=Resolution.default_size())),
                angle,
            )
            sequential_steps.append(parallel2)
            parallel_steps.append(sequential)
        return parallel

    def process(self) -> ResourceResult:
        if self.lower_res:
            buffer: Any = self.repository.storage.get_bytes(self.lower_res)
            bytes = io.BytesIO(buffer)
            bytes.seek(0)
            img = Image.open(bytes)
            gaussian = img.filter(ImageFilter.GaussianBlur(radius=10))
            buffer = io.BytesIO()
            gaussian.save(buffer, 'PNG', optimize=True)
            buffer.seek(0)
            bytes = buffer.read()
            self.repository.storage.upload(bytes, self.progress_image_path, cwd=self.cwd)

        if self.invalidate:
            self.cache.invalidate(self.invalidation_urls)

        model_to_image = self._model_to_image_step()
        root_payload: ResourceStep = {
            'cwd': self.cwd,
            'type': 'sequential',
            'steps': [
                self._image_to_fake_render_step(),
                self._image_to_model_step(),
                model_to_image
            ]
        }
        self.repository.storage.copy(
            self.old_processed_path, path_join(self.cwd, self.new_original_path)
        )
        self.queue.send_message(root_payload)
        return self.repository.get(self.tenant, self.library, self.name, self.new_version, 'json')
