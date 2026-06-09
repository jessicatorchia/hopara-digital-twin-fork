from typing import Any, Dict, List, Optional, cast

from api.image.image import ModelRequestFormat
from api.model.model_path import ModelPath
from api.model.model_repository import ModelRepository
from api.resource.library_repository import LibraryRepository
from api.resource.resource_history_repository import ResourceHistoryRepository
from api.resource.resource_process_client import ResourceProcessClient
from common.mimetype import discover_mimetype
from common.path import path_join
from common.process_resource_event import (ResourceStep,
                                           ResourceStepNotification)
from common.resource_path import ResourcePath
from common.resource_result import ResourceResult
from common.resource_state import ResourceState
from common.version import VersionFactory


class ModelService:
    repository: ModelRepository
    process_client: ResourceProcessClient
    library_repository: LibraryRepository

    _MIME_TO_EXTENSION: Dict[str, str] = {
        'model/gltf-binary': '.glb',
        'model/gltf+json': '.gltf',
        'model/obj': '.obj',
        'application/octet-stream+fbx': '.fbx',
    }

    def __init__(self, repository: ModelRepository, library_repository: LibraryRepository,
                 process_client: ResourceProcessClient, history_repository: ResourceHistoryRepository):
        self.repository = repository
        self.process_client = process_client
        self.library_repository = library_repository
        self.version_factory = VersionFactory()
        self.history_repository = history_repository

    def history_list(self, tenant: str, library: str, name: str, limit: int | None) -> list[dict]:
        return self.history_repository.list(tenant, library, name, limit)

    def history_checkout(
            self, tenant: str, library: str, name: str, version: int, format: ModelRequestFormat
    ) -> ResourceResult:
        return self.repository.get(tenant, library, name, version, format)

    def history_restore(self, tenant: str, library: str, name: str, timestamp: int) -> ResourceResult:
        new_version = self.history_repository.restore(tenant, library, name, timestamp)
        return self.repository.get(tenant, library, name, new_version, 'json')

    def history_undo(self, tenant: str, library: str, name: str, version: int) -> ResourceResult:
        new_version = self.history_repository.undo(tenant, library, name, version)
        return self.repository.get(tenant, library, name, new_version, 'json')

    def save(
            self, tenant: str, library: str, name: str, buffer: bytes, processing_params: Optional[dict] = None,
            bypass_check: bool = False, skip_invalidation: bool = False
    ) -> ResourceResult:

        if len(buffer) <= 0:
            raise ValueError('Original resource buffer is empty')

        if not library:
            raise ValueError('Model must have a library specified')

        cwd = ModelPath.get_base_dir(tenant, library, name)

        new_version = self.version_factory.create() if tenant else None
        self.repository.save_original(tenant, library, name, new_version, buffer)

        invalidation_path = ModelPath.get_invalidation_path(tenant, library, name) if not skip_invalidation else []
        processing_params = processing_params or {}
        # coisas como arrow-axis já tem um centroid que não dever ser modificadas
        if 'axis' in name.lower():
            processing_params['reset-centroid'] = False

        mimetype = discover_mimetype(buffer)

        state = self.process_and_save(
            cwd, new_version, invalidation_path, processing_params, mimetype, tenant, library, name
        )
        if state == ResourceState.SUCCESS:
            return self.repository.get(tenant, library, name, cast(Any, new_version), 'json')
        if state == ResourceState.PROCESSING:
            return ResourceResult.processing()
        return ResourceResult(state, version=new_version)

    def get(
            self, tenant: str, library: str, name: str, format: ModelRequestFormat,
            fallback: Optional[str] = None
    ) -> ResourceResult:
        version = self.repository.get_latest_version(tenant, library, name)
        if version:
            resource = self.repository.get(tenant, library, name, version, format)
            if resource.state != ResourceState.NOT_FOUND: return resource
        if fallback:
            version = self.repository.get_latest_version(tenant, library, fallback)
            if version:
                return self.repository.get(tenant, library, fallback, version, format)
        return self.repository.get_from_template(tenant, name, format)

    @staticmethod
    def _compress_model_payload(
            cwd: str, version: int | None, invalidation_url: List[str], compressed_gltf: bool = True,
            reset_centroid: bool = True, mime_type: str | None = None, tenant: str = '', library: str = '',
            name: str = ''
    ) -> ResourceStep:

        extension = ModelService._MIME_TO_EXTENSION.get(mime_type or '', '.glb')

        steps: list[ResourceStep] = [
            ResourceStep(
                cwd=cwd,
                type='model_compress',
                data={
                    'origin': ModelPath.get_raw_file_path(version),
                    'destination': ResourcePath.get_file_path(version, 'model.glb'),
                    'compressed_gltf': compressed_gltf,
                    'reset_centroid': reset_centroid,
                    'extension': extension,
                },
                invalidation_urls=invalidation_url,
                ready=True,
                notification=ResourceStepNotification(
                    tenant=tenant,
                    library=library,
                    name=name,
                    progress=1,
                    event='MODEL_PROCESSED'
                )
            ),
            ResourceStep(
                cwd=cwd,
                type='model_to_image',
                data={
                    'origin': ResourcePath.get_file_path(version, 'model.glb'),
                    'destination': ResourcePath.get_file_path(version, 'render.webp'),
                },
                invalidation_urls=invalidation_url
            )
        ]

        if mime_type in ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']:
            steps = [
                        ResourceStep(
                            cwd=cwd,
                            type='copy',
                            data={
                                'origin': ModelPath.get_raw_file_path(version),
                                'destination': path_join(version, 'image_raw'),
                            },
                            invalidation_urls=invalidation_url
                        ),
                        ResourceStep(
                            cwd=cwd,
                            type='image_remove_text',
                            data={
                                'origin': path_join(version, 'image_raw'),
                                'destination': path_join(version, 'no_text.webp'),
                            },
                        ),
                        ResourceStep(
                            cwd=cwd,
                            type='image_to_fake_render',
                            data={
                                'origin': path_join(version, 'no_text.webp'),
                                'destination': path_join(version, 'fake_render.webp'),
                                'model': 'nano_banana'
                            },
                        ),
                        ResourceStep(
                            cwd=cwd,
                            type='image_change_material',
                            data={
                                'origin': path_join(version, 'fake_render.webp'),
                                'destination': path_join(version, 'new_texture.webp'),
                            },
                        ),
                        ResourceStep(
                            cwd=cwd,
                            type='image_to_model',
                            data={
                                'origin': path_join(version, 'new_texture.webp'),
                                'destination': ResourcePath.get_raw_file_path(version),
                            },
                        )
                    ] + steps

        return {
            'cwd': cwd,
            'type': 'sequential',
            'steps': steps
        }

    def process_model(
            self, cwd: str, version: int | None, invalidation_url: List[str],
            compressed_gltf: bool = True, reset_centroid: bool = True, mimetype: str | None = None,
            tenant: str = '', library: str = '', name: str = ''
    ) -> ResourceState:
        payload = self._compress_model_payload(
            cwd,
            version,
            invalidation_url,
            compressed_gltf=compressed_gltf,
            reset_centroid=reset_centroid,
            mime_type=mimetype,
            tenant=tenant,
            library=library,
            name=name
        )
        return self.process_client.process_sync(payload)

    def process_and_save(
            self, cwd: str, new_version: int | None, invalidation_path: List[str],
            processing_params: dict, mimetype: str, tenant: str, library: str, name: str
    ) -> ResourceState:
        return self.process_model(
            cwd, new_version, invalidation_path,
            processing_params.get('compressed-gltf', True),
            processing_params.get('reset-centroid', True),
            mimetype,
            tenant, library, name
        )