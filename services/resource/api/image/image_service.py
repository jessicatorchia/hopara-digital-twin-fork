import json
from typing import Any, Dict, List, Optional

from api.image.image import ImageRequestFormat
from api.image.image_path import ImagePath
from api.image.image_repository import ImageRepository
from api.image.image_shape_repository import ImageShapeRepository
from api.image.isometrify_service import IsometrifyService
from api.image.message_factory import (
    create_crop_image_step, create_image_to_polygon_messages,
    create_resize_image_to_default_size_message,
    create_resize_image_to_resolutions_steps)
from api.resource.resource_history_repository import ResourceHistoryRepository
from api.resource.resource_process_client import ResourceProcessClient
from common.angle import angles
from common.client.cache import Cache
from common.client.queue import Queue
from common.crop import CropArea
from common.mimetype import discover_mimetype
from common.process_resource_event import ResourceStep
from common.resolution import Resolution, ResolutionType
from common.resource_result import ResourceResult
from common.resource_state import ResourceState
from common.version import VersionFactory

RESOURCE_TYPE = 'image'

allowed_types = [
    'image/jpeg', 'image/png', 'application/pdf', 'image/svg+xml', 'image/svg', 'image/webp',
    'model/gltf+json', 'model/gltf-binary', 'image/heic', 'image/heif'
]


class ImageService:
    def __init__(
            self,
            repository: ImageRepository,
            queue: Queue,
            cache: Cache,
            process_client: ResourceProcessClient,
            history_repository: ResourceHistoryRepository,
            shape_repository: ImageShapeRepository,
    ):
        self.repository = repository
        self.queue = queue
        self.cache = cache
        self.process_client = process_client
        self.shape_repository = shape_repository
        self.history_repository = history_repository
        self.version_factory = VersionFactory()

    @staticmethod
    def _get_invalidation_paths(tenant: str, library: str, name: str) -> list[str]:
        return [
            ImagePath.get_invalidation_path(tenant, library, name),
            ImagePath.get_shape_list_invalidation_path(tenant, library)
        ]

    def _send_post_save_message(self, cwd: str, origin: str, invalidation_urls: List[str]) -> None:
        not_default_resolutions = list(reversed(Resolution.get_compatible(ignore_default=True)))
        messages = create_resize_image_to_resolutions_steps(
            cwd, origin, invalidation_urls, not_default_resolutions
        )
        self.process_client.process_many_async(messages)

    def save(
            self, tenant: str, library: str, name: str, buffer: bytes, invalidate: bool | None = True
    ) -> ResourceResult:
        if not buffer or len(buffer) <= 0: raise ValueError('File content is empty')

        mimetype = discover_mimetype(buffer)
        if mimetype not in allowed_types: raise ValueError(f'Invalid image type: {mimetype}')

        version = self.version_factory.create()
        self.repository.save(tenant, library, name, version, buffer)

        cwd = ImagePath.get_base_dir(tenant, library, name)

        default_resolution = Resolution.default_resolution()
        destination = ImagePath.get_resolution_path(version, default_resolution)
        raw = ImagePath.get_raw_file_path(version)

        invalidation_urls = self._get_invalidation_paths(tenant, library, name) if invalidate else []

        paths = [f'{version}/4096_{a}.webp' for a in angles]

        if mimetype in ['model/gltf+json', 'model/gltf-binary']:
            state = self.process_client.process_sync({
                "cwd": cwd,
                "type": "sequential",
                'steps': [
                    ResourceStep(
                        cwd=cwd,
                        type='model_to_image',
                        data={
                            "origin": raw,
                            "destinations": paths,
                            "angles": angles,
                            "resolution": "md"
                        },
                        invalidation_urls=invalidation_urls,
                    )
                ]
            })
        else:
            state = self.process_client.process_sync({
                "cwd": cwd,
                "type": "sequential",
                'steps': [
                    create_resize_image_to_default_size_message(
                        cwd=cwd,
                        origin=raw,
                        destination=destination,
                        invalidation_urls=invalidation_urls,
                    ),
                    {
                        'cwd': cwd,
                        "type": "parallel",
                        "steps": create_image_to_polygon_messages(cwd, destination, invalidation_urls)
                    }
                ]
            })
            self._send_post_save_message(cwd, raw, invalidation_urls)

        self.repository.clear_cache(tenant, library, name)

        if state == ResourceState.SUCCESS or state == ResourceState.PROCESSING:
            return self.repository.get(tenant, library, name, version, 'json', resolution=default_resolution)
        return ResourceResult.error()

    def crop(
            self, tenant: str, library: str, name: str, left: float, right: float, bottom: float, top: float
    ) -> ResourceResult:
        latest_version = self.repository.get_latest_version(tenant, library, name)
        if not latest_version:
            raise FileNotFoundError(f'Image {name} not found in library {library}')

        cwd = ImagePath.get_base_dir(tenant, library, name)
        new_version = self.version_factory.create()
        original_path = ImagePath.get_raw_file_path(latest_version)
        new_original_path = ImagePath.get_raw_file_path(new_version)
        invalidation_urls = self._get_invalidation_paths(tenant, library, name)

        crop_area = CropArea(top=top, right=right, bottom=bottom, left=left)
        crop_message: ResourceStep = {
            "cwd": cwd,
            "type": "sequential",
            "steps":
                [
                    create_crop_image_step(cwd, original_path, new_original_path, crop_area),
                    {
                        'cwd': cwd,
                        'type': 'parallel',
                        'steps': create_resize_image_to_resolutions_steps(
                            cwd, new_original_path, invalidation_urls,
                            Resolution.get_compatible(ignore_default=True)
                        )
                    }
                ]
        }

        self.process_client.process_sync(crop_message)
        default_destination = ImagePath.get_resolution_path(new_version, Resolution.default_resolution())
        default_size_steps: List[ResourceStep] = [
            create_resize_image_to_default_size_message(
                cwd=cwd,
                origin=new_original_path,
                destination=default_destination,
                invalidation_urls=invalidation_urls,
            ), {
                "cwd": cwd,
                "type": "parallel",
                "steps": create_image_to_polygon_messages(
                    cwd, default_destination, invalidation_urls
                )
            }
        ]

        state = self.process_client.process_sync({
            "cwd": cwd,
            "type": "sequential",
            "steps": default_size_steps
        })
        if state == ResourceState.SUCCESS or state == ResourceState.PROCESSING:
            return self.repository.get(tenant, library, name, new_version, 'json')
        return ResourceResult(state)

    def get(
            self, tenant: str, library: str, name: str, format: ImageRequestFormat,
            resolution: ResolutionType | None, max_size: int | None, fallback: Optional[str] = None,
            angle: Optional[int] = None
    ) -> ResourceResult:
        version = self.repository.get_latest_version(tenant, library, name)
        if version:
            image = self.repository.get(tenant, library, name, version, format, resolution, max_size, angle)
            if image.state != ResourceState.NOT_FOUND: return image
        if fallback:
            version = self.repository.get_latest_version(tenant, library, fallback)
            if version:
                return self.repository.get(tenant, library, fallback, version, format, resolution, max_size, angle)
        return ResourceResult.not_found()

    def history_list(self, tenant: str, library: str, name: str, limit: int | None) -> List[Dict[str, Any]]:
        return self.history_repository.list(tenant, library, name, limit)

    def history_restore(self, tenant: str, library: str, name: str, version: int) -> ResourceResult:
        new_version = self.history_repository.restore(tenant, library, name, version)
        self.cache.invalidate(self._get_invalidation_paths(tenant, library, name))
        if new_version == 0:
            return ResourceResult.success(b'', {})
        return self.repository.get(tenant, library, name, new_version, 'json')

    def undo(self, tenant: str, library: str, name: str, version: int) -> ResourceResult:
        new_version = self.history_repository.undo(tenant, library, name, version)
        self.cache.invalidate(self._get_invalidation_paths(tenant, library, name))
        if new_version == 0:
            return ResourceResult.success(b'', {})
        return self.repository.get(tenant, library, name, new_version, 'json')

    def get_shape(self, tenant: str, library: str, name: str, angle: int | None = None) -> Dict[str, Any | None] | None:
        return self.shape_repository.get_shape(tenant, library, name, angle)

    def shape_box(self, tenant: str, library: str, name: str) -> Dict[str, Any] | None:
        return self.shape_repository.shape_box(tenant, library, name)

    def get_closest_room(self, tenant: str, library: str, name: str, polygon: Any) -> Dict[str, list] | None:
        return self.shape_repository.get_closest_room(tenant, library, name, polygon)

    def history_checkout(
            self, tenant: str, library: str, name: str, version: int, format: ImageRequestFormat,
            resolution: ResolutionType, max_size: int
    ) -> ResourceResult:
        return self.repository.get(tenant, library, name, version, format, resolution, max_size)

    def get_library_shapes(
            self, tenant: str, library: str
    ) -> dict[str, list[dict[str, Any]]]:
        results = self.shape_repository.get_library_shapes(tenant, library)
        shapes: dict[str, list[dict[str, Any]]] = {}
        for result in results:
            result.metadata['shape'] = json.loads(result.metadata['shape'].decode('utf-8'))['polygon']
            shapes.setdefault(result.metadata['name'], []).append(result.metadata)
        return shapes

    def image_to_render(
            self, tenant: str, library: str, name: str, invalidate: bool = True
    ) -> ResourceResult:
        isometrify_service = IsometrifyService(
            self.repository, self.queue, self.version_factory, self.cache, tenant, library, name,
            invalidate=invalidate,
        )
        return isometrify_service.process()
