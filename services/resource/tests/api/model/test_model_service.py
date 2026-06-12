import unittest
from unittest.mock import MagicMock, patch

from api.model.model_path import ModelPath
from api.model.model_service import ModelService
from common.client.storage import Storage
from common.path import path_join
from tests.test_utils import (TEST_ROOT, any_library, any_name,
                              any_new_version, any_tenant)


class TestModelService(unittest.TestCase):
    @staticmethod
    def get_resource():
        file_path = path_join(TEST_ROOT, 'fixtures/sample.glb')
        with open(file_path, 'rb+') as fp:
            return fp.read()

    @staticmethod
    def get_resource_img():
        file_path = path_join(TEST_ROOT, 'fixtures/sample.png')
        with open(file_path, 'rb+') as fp:
            return fp.read()

    def test_save(self):
        sizes = []
        with patch.object(Storage, 'upload', new_callable=MagicMock) as storage:
            storage.side_effect = lambda *args, **kwargs: sizes.append(len(args[0]))
            process_client_mock = MagicMock()
            process_client_mock.process_model.return_value = True

            repository_mock = MagicMock()
            service = ModelService(repository_mock, MagicMock(), process_client_mock, MagicMock())
            service.version_factory = MagicMock()
            service.version_factory.create.return_value = any_new_version
            buffer = self.get_resource()
            res = service.save(any_tenant, any_library, any_name, buffer)
            self.assertEqual(res.version, 12345679)
            self.assertEqual(1, repository_mock.save_original.call_count)
            call = repository_mock.save_original.call_args[0]
            self.assertEqual(call[0], any_tenant)
            self.assertEqual(call[1], any_library)
            self.assertEqual(call[2], any_name)
            self.assertEqual(call[3], any_new_version)
            self.assertEqual(call[4], buffer)

            self.assertEqual(1, process_client_mock.process_sync.call_count)

            cwd = ModelPath.get_base_dir(any_tenant, any_library, any_name)
            process_client_mock.process_sync.assert_called_once_with({
                'cwd': cwd,
                'type': 'sequential',
                'steps': [
                    {
                        'cwd': cwd,
                        'type': 'model_compress',
                        'data': {
                            'origin': f'{any_new_version}/raw',
                            'destination': f'{any_new_version}/model.glb',
                            'compressed_gltf': True,
                            'reset_centroid': True,
                            'extension': '.glb'
                        },
                        'invalidation_urls': [
                            f'/tenant/{any_tenant}/model/{any_name}*',
                            f'/tenant/{any_tenant}/model-library/{any_library}/model/{any_name}*'
                        ],
                        'ready': True,
                        'notification': {
                            'tenant': 'any_tenant',
                            'library': 'any_library',
                            'name': 'any_name',
                            'progress': 1,
                            'event': 'MODEL_PROCESSED'
                        }
                    },
                    {
                        'cwd': cwd,
                        'type': 'model_to_image',
                        'data': {
                            'origin': f'{any_new_version}/model.glb',
                            'destination': f'{any_new_version}/render.webp'
                        },
                        'invalidation_urls': [
                            f'/tenant/{any_tenant}/model/{any_name}*',
                            f'/tenant/{any_tenant}/model-library/{any_library}/model/{any_name}*'
                        ]
                    }
                ]
            })

    def test_save_image(self):
        sizes = []
        with patch.object(Storage, 'upload', new_callable=MagicMock) as storage:
            storage.side_effect = lambda *args, **kwargs: sizes.append(len(args[0]))
            process_client_mock = MagicMock()
            process_client_mock.process_model.return_value = True

            repository_mock = MagicMock()
            service = ModelService(repository_mock, MagicMock(), process_client_mock, MagicMock())
            service.version_factory = MagicMock()
            service.version_factory.create.return_value = any_new_version
            buffer = self.get_resource_img()
            service.save(any_tenant, any_library, any_name, buffer)
            self.assertEqual(1, repository_mock.save_original.call_count)
            call = repository_mock.save_original.call_args[0]
            self.assertEqual(call[0], any_tenant)
            self.assertEqual(call[1], any_library)
            self.assertEqual(call[2], any_name)
            self.assertEqual(call[3], any_new_version)
            self.assertEqual(call[4], buffer)

            self.assertEqual(1, process_client_mock.process_sync.call_count)

            cwd = ModelPath.get_base_dir(any_tenant, any_library, any_name)
            process_client_mock.process_sync.assert_called_once_with(
                {
                    'cwd': cwd,
                    'type': 'sequential',
                    'steps': [
                        {
                            'cwd': cwd,
                            'type': 'copy',
                            'data': {
                                'origin': f'{any_new_version}/raw',
                                'destination': f'{any_new_version}/image_raw',
                            },
                            'invalidation_urls': [
                                '/tenant/any_tenant/model/any_name*',
                                '/tenant/any_tenant/model-library/any_library/model/any_name*'
                            ]
                        },
                        {
                            'cwd': cwd,
                            'type': 'image_remove_text',
                            'data': {
                                'origin': f'{any_new_version}/image_raw',
                                'destination': f'{any_new_version}/no_text.webp',
                            },
                        },
                        {
                            'cwd': cwd,
                            'type': 'image_to_fake_render',
                            'data': {
                                'origin': f'{any_new_version}/no_text.webp',
                                'destination': f'{any_new_version}/fake_render.webp',
                                'model': 'nano_banana'
                            },
                        },
                        {
                            'cwd': cwd,
                            'type': 'image_change_material',
                            'data': {
                                'origin': f'{any_new_version}/fake_render.webp',
                                'destination': f'{any_new_version}/new_texture.webp',
                            },
                        },
                        {
                            'cwd': cwd,
                            'type': 'image_to_model',
                            'data': {
                                'origin': f'{any_new_version}/new_texture.webp',
                                'destination': f'{any_new_version}/raw',
                            }
                        },
                        {
                            'cwd': cwd,
                            'type': 'model_compress',
                            'data': {
                                'origin': f'{any_new_version}/raw',
                                'destination': f'{any_new_version}/model.glb',
                                'compressed_gltf': True,
                                'reset_centroid': True,
                                'extension':'.glb'
                            },
                            'invalidation_urls': [
                                f'/tenant/{any_tenant}/model/{any_name}*',
                                f'/tenant/{any_tenant}/model-library/{any_library}/model/{any_name}*'
                            ],
                            'ready': True,
                            'notification': {
                                'tenant': 'any_tenant',
                                'library': 'any_library',
                                'name': 'any_name',
                                'progress': 1,
                                'event': 'MODEL_PROCESSED'
                            }
                        },
                        {
                            'cwd': cwd,
                            'type': 'model_to_image',
                            'data': {
                                'origin': f'{any_new_version}/model.glb',
                                'destination': f'{any_new_version}/render.webp'
                            },
                            'invalidation_urls': [
                                f'/tenant/{any_tenant}/model/{any_name}*',
                                f'/tenant/{any_tenant}/model-library/{any_library}/model/{any_name}*'
                            ]
                        }
                    ]
                }
            )
