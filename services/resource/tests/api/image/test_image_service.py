import unittest
from unittest.mock import MagicMock, call

from api.image.image_path import ImagePath
from api.image.image_service import ImageService
from common.path import path_join
from common.resolution import ResolutionType
from common.resource_result import ResourceResult
from common.resource_state import ResourceState
from tests.test_utils import (TEST_ROOT, BufferSizeGtValidator, any_library,
                              any_new_version, any_tenant, any_version)

any_name = 'any name'
any_escaped_name = 'any%20name'
any_high_resolution_path = 'any_high_resolution_path'
any_lower_resolution_path = 'any_lower_resolution_path'
any_resolution: ResolutionType = 'md'
any_max_size = 1024
any_fallback = 'fallback_image'

base_path = f'image/customers/{any_tenant}/{any_library}'
invalidation_base_path = f'/tenant/{any_tenant}/image-library/{any_library}/image'
invalidation_base_shape_path = f'/tenant/{any_tenant}/image-library/{any_library}/shape'


class TestImageService(unittest.TestCase):
    def setUp(self):
        self.maxDiff = None

    @staticmethod
    def any_buffer():
        file_path = path_join(TEST_ROOT, 'fixtures/sample.svg')
        with open(file_path, 'rb+') as fp:
            return fp.read()

    @staticmethod
    def any_png_buffer():
        file_path = path_join(TEST_ROOT, 'fixtures/sample.png')
        with open(file_path, 'rb+') as fp:
            return fp.read()

    @staticmethod
    def any_glb_buffer():
        file_path = path_join(TEST_ROOT, 'fixtures/sample.glb')
        with open(file_path, 'rb+') as fp:
            return fp.read()

    ### SAVE ###

    def test_save_invalid_file(self):
        service = ImageService(MagicMock(), MagicMock(), MagicMock(), MagicMock(), MagicMock(), MagicMock())
        with self.assertRaises(ValueError) as context:
            service.save(any_tenant, any_library, any_name, b'any-text')
        self.assertEqual(str(context.exception), "Invalid image type: text/plain")

    def test_save_with_invalid_buffer(self):
        service = ImageService(MagicMock(), MagicMock(), MagicMock(), MagicMock(), MagicMock(), MagicMock())
        with self.assertRaises(ValueError) as context:
            service.save(any_tenant, any_library, any_name, b'')
        self.assertEqual(str(context.exception), "File content is empty")

    def test_save_success(self):
        name = 'SOME-very_long (image) /name\\'
        escaped_name = 'SOME-very_long%20%28image%29%20%2Fname%5C'
        process_client = MagicMock()
        repository_mock = MagicMock()
        any_buffer = self.any_buffer()
        service = ImageService(repository_mock, MagicMock(), MagicMock(), process_client, MagicMock(), MagicMock())
        service.version_factory = MagicMock()
        service.version_factory.create.return_value = any_new_version
        service.save(any_tenant, any_library, name, any_buffer)

        # get save_original call
        save_call = repository_mock.save.call_args[0]
        self.assertEqual(save_call[0], any_tenant)
        self.assertEqual(save_call[1], any_library)
        self.assertEqual(save_call[2], name)
        self.assertEqual(save_call[3], any_new_version)
        self.assertEqual(save_call[4], any_buffer)

        # must use escaped name
        cwd = path_join('image/customers', any_tenant, any_library, escaped_name)

        process_client.process_sync.assert_called_once_with({
            "cwd": cwd,
            "type": "sequential",
            "steps": [{
                "cwd": cwd,
                'type': 'image_resize',
                'data': {
                    'origin': f'{any_new_version}/raw',
                    'destination': f'{any_new_version}/4096.webp',
                    'max_size': 4096,
                },
                'invalidation_urls': [f'{invalidation_base_path}/{name}*', invalidation_base_shape_path],
                'ready': True
            }, {
                "cwd": cwd,
                'type': 'parallel',
                'steps': [
                    {
                        "cwd": cwd,
                        'type': 'image_to_shape',
                        'data': {
                            'origin': f'{any_new_version}/4096.webp',
                            'destination': f'{any_new_version}/shape.json'
                        },
                        'invalidation_urls': [
                            f'{invalidation_base_path}/{name}*',
                            invalidation_base_shape_path
                        ]
                    },
                    {
                        "cwd": cwd,
                        'type': 'image_to_rooms',
                        'data': {
                            'origin': f'{any_new_version}/4096.webp',
                            'destination': f'{any_new_version}/rooms.json'
                        },
                        'invalidation_urls': [
                            f'{invalidation_base_path}/{name}*',
                            invalidation_base_shape_path
                        ]
                    }
                ]
            }]
        })

        process_client.process_many_async.assert_called_once_with(
            [
                {
                    "cwd": cwd,
                    'type': 'image_resize',
                    'data': {
                        'origin': f'{any_new_version}/raw',
                        'destination': f'{any_new_version}/256.webp',
                        'max_size': 256,
                    },
                    'invalidation_urls': [f'{invalidation_base_path}/{name}*', invalidation_base_shape_path]
                },
                {
                    "cwd": cwd,
                    'type': 'image_resize',
                    'data': {
                        'origin': f'{any_new_version}/raw',
                        'destination': f'{any_new_version}/512.webp',
                        'max_size': 512,
                    },
                    'invalidation_urls': [f'{invalidation_base_path}/{name}*', invalidation_base_shape_path]
                },
                {
                    "cwd": cwd,
                    'type': 'image_resize',
                    'data': {
                        'origin': f'{any_new_version}/raw',
                        'destination': f'{any_new_version}/1024.webp',
                        'max_size': 1024,
                    },
                    'invalidation_urls': [f'{invalidation_base_path}/{name}*', invalidation_base_shape_path]
                },
                {
                    "cwd": cwd,
                    'type': 'image_resize',
                    'data': {
                        'origin': f'{any_new_version}/raw',
                        'destination': f'{any_new_version}/2048.webp',
                        'max_size': 2048,
                    },
                    'invalidation_urls': [f'{invalidation_base_path}/{name}*', invalidation_base_shape_path]
                },
                {
                    "cwd": cwd,
                    'type': 'image_resize',
                    'data': {
                        'origin': f'{any_new_version}/raw',
                        'destination': f'{any_new_version}/8192.webp',
                        'max_size': 8192,
                    },
                    'invalidation_urls': [f'{invalidation_base_path}/{name}*', invalidation_base_shape_path]
                },
                {
                    "cwd": cwd,
                    'type': 'image_resize',
                    'data': {
                        'origin': f'{any_new_version}/raw',
                        'destination': f'{any_new_version}/16383.webp',
                        'max_size': 16383,
                    },
                    'invalidation_urls': [f'{invalidation_base_path}/{name}*', invalidation_base_shape_path]
                }
            ]
        )

    def test_save_glb(self):
        name = 'SOME-very_long (image) /name\\'
        process_client = MagicMock()
        repository_mock = MagicMock()
        any_buffer = self.any_glb_buffer()
        service = ImageService(repository_mock, MagicMock(), MagicMock(), process_client, MagicMock(), MagicMock())
        service.version_factory = MagicMock()
        service.version_factory.create.return_value = any_new_version
        service.save(any_tenant, any_library, name, any_buffer)

        # get save_original call
        save_call = repository_mock.save.call_args[0]
        self.assertEqual(save_call[0], any_tenant)
        self.assertEqual(save_call[1], any_library)
        self.assertEqual(save_call[2], name)
        self.assertEqual(save_call[3], any_new_version)
        self.assertEqual(save_call[4], any_buffer)

        # must use escaped name
        cwd = path_join('image/customers', any_tenant, any_library, 'SOME-very_long%20%28image%29%20%2Fname%5C')

        process_client.process_sync.assert_called_once_with({
            "cwd": cwd,
            "type": "sequential",
            "steps": [{
                "cwd": cwd,
                'type': 'model_to_image',
                'data': {
                    'origin': f'{any_new_version}/raw',
                    'destinations': [f'{any_new_version}/4096_45.webp', f'{any_new_version}/4096_135.webp',
                                     f'{any_new_version}/4096_225.webp', f'{any_new_version}/4096_315.webp'],
                    'angles': [45, 135, 225, 315],
                    'resolution': 'md'
                },
                'invalidation_urls': [f'{invalidation_base_path}/{name}*', invalidation_base_shape_path],
            }]
        })

    def test_save_processing(self):
        name = 'SOME-very_long (image) /name\\'
        process_client = MagicMock()
        process_client.process_sync.return_value = ResourceState.PROCESSING
        repository_mock = MagicMock()
        repository_mock.get.return_value = ResourceResult.processing()
        any_buffer = self.any_buffer()
        service = ImageService(repository_mock, MagicMock(), MagicMock(), process_client, MagicMock(), MagicMock())
        service.version_factory = MagicMock()
        service.version_factory.create.return_value = any_new_version
        ret = service.save(any_tenant, any_library, name, any_buffer)

        self.assertEqual(ret, ResourceResult.processing())

    ### END SAVE ###

    ### CROP ###
    def test_crop_image_not_version_folder(self):
        repository_mock = MagicMock()
        repository_mock.get_latest_version.return_value = None
        process_client_mock = MagicMock()
        service = ImageService(repository_mock, MagicMock(), MagicMock(), process_client_mock, MagicMock(), MagicMock())
        with self.assertRaises(FileNotFoundError) as context:
            service.crop(any_tenant, any_library, any_name, 100, 100, 200, 200)
        self.assertEqual(str(context.exception), "Image any name not found in library any_library")

    def test_crop_success(self):
        queue_mock = MagicMock()
        process_client_mock = MagicMock()
        repository_mock = MagicMock()
        repository_mock.get_latest_version.return_value = any_version

        service = ImageService(
            repository_mock, queue_mock, MagicMock(), process_client_mock, MagicMock(), MagicMock()
        )
        service.version_factory = MagicMock()
        service.version_factory.create.return_value = any_new_version
        service.crop(any_tenant, any_library, any_name, 0.1, 0.2, 0.3, 0.4)

        cwd = ImagePath.get_base_dir(any_tenant, any_library, 'any name')

        invalidation_urls = [f'/tenant/{any_tenant}/image-library/{any_library}/image/{any_name}*',
                             invalidation_base_shape_path]

        cwd = ImagePath.get_base_dir(any_tenant, any_library, any_name)

        expected_1 = {
            'cwd': cwd,
            'type': 'sequential',
            'steps': [
                {
                    'cwd': cwd,
                    'type': 'image_crop',
                    'data': {
                        'origin': f'{any_version}/raw',
                        'destination': f'{any_new_version}/raw',
                        'crop_area': {
                            'left': 0.1,
                            'bottom': 0.3,
                            'right': 0.2,
                            'top': 0.4
                        },
                    },
                    'ready': True
                },
                {
                    'cwd': cwd,
                    'type': 'parallel',
                    'steps': [
                        {
                            'cwd': cwd,
                            'type': 'image_resize',
                            'data': {
                                'origin': f'{any_new_version}/raw',
                                'destination': f'{any_new_version}/16383.webp',
                                'max_size': 16383
                            },
                            'invalidation_urls': invalidation_urls
                        },
                        {
                            'cwd': cwd,
                            'type': 'image_resize',
                            'data': {
                                'origin': f'{any_new_version}/raw',
                                'destination': f'{any_new_version}/8192.webp',
                                'max_size': 8192
                            },
                            'invalidation_urls': invalidation_urls
                        },
                        {
                            'cwd': cwd,
                            'type': 'image_resize',
                            'data': {
                                'origin': f'{any_new_version}/raw',
                                'destination': f'{any_new_version}/2048.webp',
                                'max_size': 2048
                            },
                            'invalidation_urls': invalidation_urls
                        },
                        {
                            'cwd': cwd,
                            'type': 'image_resize',
                            'data': {
                                'origin': f'{any_new_version}/raw',
                                'destination': f'{any_new_version}/1024.webp',
                                'max_size': 1024
                            },
                            'invalidation_urls': invalidation_urls
                        },
                        {
                            'cwd': cwd,
                            'type': 'image_resize',
                            'data': {
                                'origin': f'{any_new_version}/raw',
                                'destination': f'{any_new_version}/512.webp',
                                'max_size': 512
                            },
                            'invalidation_urls': invalidation_urls
                        },
                        {
                            'cwd': cwd,
                            'type': 'image_resize',
                            'data': {
                                'origin': f'{any_new_version}/raw',
                                'destination': f'{any_new_version}/256.webp',
                                'max_size': 256
                            },
                            'invalidation_urls': invalidation_urls
                        }
                    ]
                }]
        }
        expected_2 = {
            'cwd': cwd,
            'type': 'sequential',
            'steps': [
                {
                    'cwd': cwd,
                    'type': 'image_resize',
                    'data': {
                        'origin': f'{any_new_version}/raw',
                        'destination': f'{any_new_version}/4096.webp',
                        'max_size': 4096
                    },
                    'invalidation_urls': invalidation_urls,
                    'ready': True
                },
                {
                    'cwd': cwd,
                    'type': 'parallel',
                    'steps': [
                        {
                            'cwd': cwd,
                            'type': 'image_to_shape',
                            'data': {
                                'origin': f'{any_new_version}/4096.webp',
                                'destination': f'{any_new_version}/shape.json'
                            },
                            'invalidation_urls': invalidation_urls
                        },
                        {
                            'cwd': cwd,
                            'type': 'image_to_rooms',
                            'data': {
                                'origin': f'{any_new_version}/4096.webp',
                                'destination': f'{any_new_version}/rooms.json'
                            },
                            'invalidation_urls': invalidation_urls
                        }
                    ]
                }
            ]
        }
        self.assertEqual(process_client_mock.process_sync.call_args_list[0].args[0], expected_1)
        self.assertEqual(process_client_mock.process_sync.call_args_list[1].args[0], expected_2)

        ### IMAGE TO RENDER ###

    ### END CROP ###

    def test_isometrify(self):
        def step(type, steps=None, use_cache=False, progress=None, data=None, invalidate=None):
            s = {
                "cwd": ImagePath.get_base_dir(any_tenant, any_library, any_name),
                "type": type,
            }
            if steps:
                s['steps'] = steps
            if data:
                s['data'] = data
            if use_cache:
                s['use_cache'] = True
            if progress is not None:
                s['notification'] = {
                    'tenant': any_tenant,
                    'library': any_library,
                    'name': any_name,
                    'progress': progress,
                    'event': 'GENERATE_PROGRESS',
                }
            if invalidate:
                s['invalidation_urls'] = [
                    f'/tenant/{any_tenant}/image-library/{any_library}/image/{any_name}*',
                    invalidation_base_shape_path
                ]
            return s

        queue_mock = MagicMock()
        process_client_mock = MagicMock()
        repository_mock = MagicMock()
        cache_mock = MagicMock()
        repository_mock.get_higher_resolution_path.return_value = any_high_resolution_path
        repository_mock.get_latest_version.return_value = '12345'
        repository_mock.storage.file_exists.return_value = False
        repository_mock.get_lower_resolution_path.return_value = path_join(TEST_ROOT, 'fixtures/sample_icon.png')
        repository_mock.storage.get_bytes.return_value = self.any_png_buffer()
        repository_mock.get.return_value = ResourceResult.processing()

        service = ImageService(
            repository_mock, queue_mock, cache_mock, process_client_mock, MagicMock(), MagicMock()
        )
        service.version_factory = MagicMock()
        service.version_factory.create.return_value = any_new_version
        ret = service.image_to_render(any_tenant, any_library, any_name)
        self.assertEqual(ret.state, ResourceState.PROCESSING)

        repository_mock.get.assert_called_once_with(any_tenant, any_library, any_name, any_new_version, 'json')

        cwd = ImagePath.get_base_dir(any_tenant, any_library, 'any name')
        repository_mock.get_higher_resolution_path.assert_called_once_with(cwd, '12345')

        repository_mock.storage.upload.assert_called_once_with(
            BufferSizeGtValidator(22000), 'progress.webp', cwd='image/customers/any_tenant/any_library/any%20name'
        )

        repository_mock.storage.copy.assert_has_calls([
            call('any_high_resolution_path', 'image/customers/any_tenant/any_library/any%20name/12345679/raw')
        ])

        queue_mock.send_message.assert_called_once_with(step('sequential', [
            step('image_to_fake_render', use_cache=True, progress=0.25, data={
                'origin': f'{any_new_version}/raw',
                'destination': 'cache_fake_render.webp',
                'hint': f"This is a '{any_name}'."
            }),
            step('image_to_model', use_cache=True, progress=0.65, data={
                'origin': 'cache_fake_render.webp',
                'destination': 'cache_model.glb'
            }),
            step('parallel', [
                # angle 45
                step('sequential', [
                    step('model_to_image', use_cache=True, progress=0.8, data={
                        'origin': 'cache_model.glb',
                        'destinations': ['cache_render_45.webp'],
                        'angles': [45],
                        "resolution": "md"
                    }),
                    step('copy', progress=1.0, data={
                        'origin': 'cache_render_45.webp',
                        'destinations': [
                            f'{any_new_version}/raw_45',
                            f'{any_new_version}/4096_45.webp'
                        ],
                    }),
                    step('parallel', [
                        step(
                            'image_to_shape',
                            invalidate=True,
                            data={
                                'origin': f'{any_new_version}/4096_45.webp',
                                'destination': f'{any_new_version}/shape_45.json'
                            }
                        ),
                        step(
                            'image_resize',
                            invalidate=True,
                            data={
                                'origin': f'{any_new_version}/raw_45',
                                'destination': f'{any_new_version}/2048_45.webp',
                                'max_size': 2048,
                            }
                        ),
                        step(
                            'image_resize',
                            invalidate=True,
                            data={
                                'origin': f'{any_new_version}/raw_45',
                                'destination': f'{any_new_version}/1024_45.webp',
                                'max_size': 1024,
                            }
                        ),
                        step(
                            'image_resize',
                            invalidate=True,
                            data={
                                'origin': f'{any_new_version}/raw_45',
                                'destination': f'{any_new_version}/512_45.webp',
                                'max_size': 512,
                            }
                        ),
                        step(
                            'image_resize',
                            invalidate=True,
                            data={
                                'origin': f'{any_new_version}/raw_45',
                                'destination': f'{any_new_version}/256_45.webp',
                                'max_size': 256,
                            }
                        ),
                    ])
                ]),

                # angle 135
                step('sequential', [
                    step('model_to_image', use_cache=True, progress=0.8, data={
                        'origin': 'cache_model.glb',
                        'destinations': ['cache_render_135.webp'],
                        'angles': [135],
                        "resolution": "md"
                    }),
                    step('copy', progress=1.0, data={
                        'origin': 'cache_render_135.webp',
                        'destinations': [
                            f'{any_new_version}/raw_135',
                            f'{any_new_version}/4096_135.webp'
                        ],
                    }),
                    step('parallel', [
                        step(
                            'image_to_shape',
                            invalidate=True,
                            data={
                                'origin': f'{any_new_version}/4096_135.webp',
                                'destination': f'{any_new_version}/shape_135.json'
                            }
                        ),
                        step(
                            'image_resize',
                            invalidate=True,
                            data={
                                'origin': f'{any_new_version}/raw_135',
                                'destination': f'{any_new_version}/2048_135.webp',
                                'max_size': 2048,
                            }
                        ),
                        step(
                            'image_resize',
                            invalidate=True,
                            data={
                                'origin': f'{any_new_version}/raw_135',
                                'destination': f'{any_new_version}/1024_135.webp',
                                'max_size': 1024,
                            }
                        ),
                        step(
                            'image_resize',
                            invalidate=True,
                            data={
                                'origin': f'{any_new_version}/raw_135',
                                'destination': f'{any_new_version}/512_135.webp',
                                'max_size': 512,
                            }
                        ),
                        step(
                            'image_resize',
                            invalidate=True,
                            data={
                                'origin': f'{any_new_version}/raw_135',
                                'destination': f'{any_new_version}/256_135.webp',
                                'max_size': 256,
                            }
                        ),
                    ])
                ]),

                # angle 225
                step('sequential', [
                    step('model_to_image', use_cache=True, progress=0.8, data={
                        'origin': 'cache_model.glb',
                        'destinations': ['cache_render_225.webp'],
                        'angles': [225],
                        "resolution": "md"
                    }),
                    step('copy', progress=1.0, data={
                        'origin': 'cache_render_225.webp',
                        'destinations': [
                            f'{any_new_version}/raw_225',
                            f'{any_new_version}/4096_225.webp'
                        ],
                    }),
                    step('parallel', [
                        step(
                            'image_to_shape',
                            invalidate=True,
                            data={
                                'origin': f'{any_new_version}/4096_225.webp',
                                'destination': f'{any_new_version}/shape_225.json'
                            }
                        ),
                        step(
                            'image_resize',
                            invalidate=True,
                            data={
                                'origin': f'{any_new_version}/raw_225',
                                'destination': f'{any_new_version}/2048_225.webp',
                                'max_size': 2048,
                            }
                        ),
                        step(
                            'image_resize',
                            invalidate=True,
                            data={
                                'origin': f'{any_new_version}/raw_225',
                                'destination': f'{any_new_version}/1024_225.webp',
                                'max_size': 1024,
                            }
                        ),
                        step(
                            'image_resize',
                            invalidate=True,
                            data={
                                'origin': f'{any_new_version}/raw_225',
                                'destination': f'{any_new_version}/512_225.webp',
                                'max_size': 512,
                            }
                        ),
                        step(
                            'image_resize',
                            invalidate=True,
                            data={
                                'origin': f'{any_new_version}/raw_225',
                                'destination': f'{any_new_version}/256_225.webp',
                                'max_size': 256,
                            }
                        ),
                    ])
                ]),

                # angle 315
                step('sequential', [
                    step('model_to_image', use_cache=True, progress=0.8, data={
                        'origin': 'cache_model.glb',
                        'destinations': ['cache_render_315.webp'],
                        'angles': [315],
                        "resolution": "md"
                    }),
                    step('copy', progress=1.0, data={
                        'origin': 'cache_render_315.webp',
                        'destinations': [
                            f'{any_new_version}/raw_315',
                            f'{any_new_version}/4096_315.webp'
                        ],
                    }),
                    step('parallel', [
                        step(
                            'image_to_shape',
                            invalidate=True,
                            data={
                                'origin': f'{any_new_version}/4096_315.webp',
                                'destination': f'{any_new_version}/shape_315.json'
                            }
                        ),
                        step(
                            'image_resize',
                            invalidate=True,
                            data={
                                'origin': f'{any_new_version}/raw_315',
                                'destination': f'{any_new_version}/2048_315.webp',
                                'max_size': 2048,
                            }
                        ),
                        step(
                            'image_resize',
                            invalidate=True,
                            data={
                                'origin': f'{any_new_version}/raw_315',
                                'destination': f'{any_new_version}/1024_315.webp',
                                'max_size': 1024,
                            }
                        ),
                        step(
                            'image_resize',
                            invalidate=True,
                            data={
                                'origin': f'{any_new_version}/raw_315',
                                'destination': f'{any_new_version}/512_315.webp',
                                'max_size': 512,
                            }
                        ),
                        step(
                            'image_resize',
                            invalidate=True,
                            data={
                                'origin': f'{any_new_version}/raw_315',
                                'destination': f'{any_new_version}/256_315.webp',
                                'max_size': 256,
                            }
                        ),
                    ])
                ]),
            ]),
        ]))

        cache_mock.invalidate.assert_called_once()

    def test_isometrify_without_invalidation(self):
        queue_mock = MagicMock()
        repository_mock = MagicMock()
        cache_mock = MagicMock()
        repository_mock.get_higher_resolution_path.return_value = any_high_resolution_path
        repository_mock.get_latest_version.return_value = '12345'
        repository_mock.storage.file_exists.return_value = False
        repository_mock.get_lower_resolution_path.return_value = path_join(TEST_ROOT, 'fixtures/sample_icon.png')
        repository_mock.storage.get_bytes.return_value = self.any_png_buffer()
        repository_mock.get.return_value = ResourceResult.processing()

        service = ImageService(
            repository_mock, queue_mock, cache_mock, MagicMock(), MagicMock(), MagicMock()
        )
        service.version_factory = MagicMock()
        service.version_factory.create.return_value = any_new_version

        ret = service.image_to_render(any_tenant, any_library, any_name, invalidate=False)
        self.assertEqual(ret.state, ResourceState.PROCESSING)

        cache_mock.invalidate.assert_not_called()

        root = queue_mock.send_message.call_args[0][0]
        for invalidation_urls in self._collect_invalidation_urls(root):
            self.assertEqual(invalidation_urls, [])

    @staticmethod
    def _collect_invalidation_urls(step):
        urls = []
        if 'invalidation_urls' in step:
            urls.append(step['invalidation_urls'])
        for child in step.get('steps', []):
            urls += TestImageService._collect_invalidation_urls(child)
        return urls

        ### END IMAGE TO RENDER ###

    ### GET ###

    def test_get_success_image_found(self):
        repository_mock = MagicMock()
        repository_mock.get_latest_version.return_value = any_version

        mock_image = MagicMock()
        mock_image_result = ResourceResult.success(mock_image, {})
        repository_mock.get.return_value = mock_image_result

        service = ImageService(repository_mock, MagicMock(), MagicMock(), MagicMock(), MagicMock(), MagicMock())

        result = service.get(any_tenant, any_library, any_name, 'image', any_resolution, any_max_size)

        repository_mock.get_latest_version.assert_called_once_with(any_tenant, any_library, any_name)
        repository_mock.get.assert_called_once_with(any_tenant, any_library, any_name, any_version, 'image',
                                                    any_resolution,
                                                    any_max_size, None)
        self.assertEqual(result, mock_image_result)
        self.assertEqual(result.state, ResourceState.SUCCESS)

    def test_get_image_not_found_no_fallback(self):
        repository_mock = MagicMock()
        repository_mock.get_latest_version.return_value = any_version

        not_found_result = ResourceResult.not_found()
        repository_mock.get.return_value = not_found_result

        service = ImageService(repository_mock, MagicMock(), MagicMock(), MagicMock(), MagicMock(), MagicMock())

        result = service.get(any_tenant, any_library, any_name, 'image', any_resolution, any_max_size)

        repository_mock.get_latest_version.assert_called_once_with(any_tenant, any_library, any_name)
        repository_mock.get.assert_called_once_with(
            any_tenant, any_library, any_name, any_version, 'image', any_resolution, any_max_size, None
        )
        self.assertEqual(result.state, ResourceState.NOT_FOUND)
        self.assertIsNone(result.buffer)

    def test_get_image_not_found_fallback_exists(self):
        repository_mock = MagicMock()
        repository_mock.get_latest_version.return_value = any_version

        not_found_result = ResourceResult.not_found()
        mock_fallback_image = MagicMock()
        fallback_result = ResourceResult.success(mock_fallback_image, {})

        repository_mock.get.side_effect = [not_found_result, fallback_result]

        service = ImageService(repository_mock, MagicMock(), MagicMock(), MagicMock(), MagicMock(), MagicMock())

        result = service.get(any_tenant, any_library, any_name, 'image', any_resolution, any_max_size, any_fallback)

        repository_mock.get_latest_version.assert_has_calls([
            call(any_tenant, any_library, any_name),
            call(any_tenant, any_library, any_fallback)
        ])
        self.assertEqual(repository_mock.get.call_count, 2)
        repository_mock.get.assert_has_calls([
            call(any_tenant, any_library, any_name, any_version, 'image', any_resolution, any_max_size, None),
            call(any_tenant, any_library, any_fallback, any_version, 'image', any_resolution, any_max_size, None)
        ])
        self.assertEqual(result, fallback_result)
        self.assertEqual(result.state, ResourceState.SUCCESS)

    def test_get_image_not_found_fallback_also_not_found(self):
        repository_mock = MagicMock()
        repository_mock.get_latest_version.return_value = any_version

        # Both calls return not found
        not_found_result = ResourceResult.not_found()
        repository_mock.get.return_value = not_found_result

        service = ImageService(repository_mock, MagicMock(), MagicMock(), MagicMock(), MagicMock(), MagicMock())

        result = service.get(any_tenant, any_library, any_name, 'image', any_resolution, any_max_size, any_fallback)

        repository_mock.get_latest_version.assert_has_calls([
            call(any_tenant, any_library, any_name),
            call(any_tenant, any_library, any_fallback)
        ])
        self.assertEqual(repository_mock.get_latest_version.call_count, 2)
        repository_mock.get.assert_has_calls([
            call(any_tenant, any_library, any_name, any_version, 'image', any_resolution, any_max_size, None),
            call(any_tenant, any_library, any_fallback, any_version, 'image', any_resolution, any_max_size, None)
        ])
        self.assertEqual(result.state, ResourceState.NOT_FOUND)
        self.assertIsNone(result.buffer)

    def test_get_with_processing_state(self):
        repository_mock = MagicMock()
        repository_mock.get_latest_version.return_value = any_version
        processing_result = ResourceResult.processing()
        repository_mock.get.return_value = processing_result

        service = ImageService(repository_mock, MagicMock(), MagicMock(), MagicMock(), MagicMock(), MagicMock())

        result = service.get(any_tenant, any_library, any_name, 'image', any_resolution, any_max_size)

        repository_mock.get_latest_version.assert_called_once_with(any_tenant, any_library, any_name)
        repository_mock.get.assert_called_once_with(
            any_tenant, any_library, any_name, any_version, 'image', any_resolution, any_max_size, None
        )
        self.assertEqual(result, processing_result)
        self.assertEqual(result.state, ResourceState.PROCESSING)

    ### END GET ###

    ### HISTORY LIST ###

    def test_history_list_success(self):
        history_repository_mock = MagicMock()
        expected_history = [
            {'version': '12345678'},
            {'version': '12345679'}
        ]
        history_repository_mock.list.return_value = expected_history

        service = ImageService(MagicMock(), MagicMock(), MagicMock(), MagicMock(), history_repository_mock,
                               MagicMock())

        result = service.history_list(any_tenant, any_library, any_name, 10)

        history_repository_mock.list.assert_called_once_with(any_tenant, any_library, any_name, 10)
        self.assertEqual(result, expected_history)

    ### END HISTORY LIST ###

    ### HISTORY RESTORE ###

    def test_history_restore_success(self):
        history_repository_mock = MagicMock()
        cache_mock = MagicMock()
        history_repository_mock.restore.return_value = True

        repository_mock = MagicMock()
        expected_result = ResourceResult.success(MagicMock(), {})
        repository_mock.get.return_value = expected_result

        service = ImageService(repository_mock, MagicMock(), cache_mock, MagicMock(), history_repository_mock,
                               MagicMock())

        result = service.history_restore(any_tenant, any_library, any_name, 12345)

        history_repository_mock.restore.assert_called_once_with(any_tenant, any_library, any_name, 12345)
        cache_mock.invalidate.assert_called_once_with([
            f'/tenant/{any_tenant}/image-library/{any_library}/image/{any_name}*',
            f'/tenant/{any_tenant}/image-library/{any_library}/shape'
        ])

        self.assertEqual(expected_result, result)

    ### END HISTORY RESTORE ###

    ### UNDO ###

    def test_undo_success(self):
        history_repository_mock = MagicMock()
        cache_mock = MagicMock()
        expected_result = ResourceResult.success(MagicMock(), {})
        history_repository_mock.undo.return_value = expected_result

        repository_mock = MagicMock()
        expected_result = ResourceResult.success(MagicMock(), {})
        repository_mock.get.return_value = expected_result

        service = ImageService(repository_mock, MagicMock(), cache_mock, MagicMock(), history_repository_mock,
                               MagicMock())

        result = service.undo(any_tenant, any_library, any_name, 12345)

        history_repository_mock.undo.assert_called_once_with(any_tenant, any_library, any_name, 12345)
        cache_mock.invalidate.assert_called_once_with([
            f'/tenant/{any_tenant}/image-library/{any_library}/image/{any_name}*',
            f'/tenant/{any_tenant}/image-library/{any_library}/shape'
        ])
        self.assertEqual(result, expected_result)

    ### END UNDO ###

    ### GET SHAPE ###

    def test_get_shape_success(self):
        shape_repository_mock = MagicMock()
        expected_shape = {
            'width': 100,
            'height': 200,
            'polygons': [{'x': 10, 'y': 20}]
        }
        shape_repository_mock.get_shape.return_value = expected_shape

        service = ImageService(MagicMock(), MagicMock(), MagicMock(), MagicMock(), MagicMock(),
                               shape_repository_mock)

        result = service.get_shape(any_tenant, any_library, any_name)

        shape_repository_mock.get_shape.assert_called_once_with(any_tenant, any_library, any_name, None)
        self.assertEqual(result, expected_shape)

    ### END GET SHAPE ###

    ### SHAPE BOX ###

    def test_shape_box_success(self):
        shape_repository_mock = MagicMock()
        expected_box = {
            'min_x': 0,
            'min_y': 0,
            'max_x': 100,
            'max_y': 200
        }
        shape_repository_mock.shape_box.return_value = expected_box

        service = ImageService(MagicMock(), MagicMock(), MagicMock(), MagicMock(), MagicMock(),
                               shape_repository_mock)

        result = service.shape_box(any_tenant, any_library, any_name)

        shape_repository_mock.shape_box.assert_called_once_with(any_tenant, any_library, any_name)
        self.assertEqual(result, expected_box)

    ### END SHAPE BOX ###

    ### GET CLOSEST ROOM ###

    def test_get_closest_room_success(self):
        shape_repository_mock = MagicMock()
        any_polygon = [{'x': 10, 'y': 20}, {'x': 30, 'y': 40}]
        expected_room = {
            'room_id': 'room_123',
            'distance': 5.5,
            'coordinates': [50, 60]
        }
        shape_repository_mock.get_closest_room.return_value = expected_room

        service = ImageService(MagicMock(), MagicMock(), MagicMock(), MagicMock(), MagicMock(),
                               shape_repository_mock)

        result = service.get_closest_room(any_tenant, any_library, any_name, any_polygon)

        shape_repository_mock.get_closest_room.assert_called_once_with(any_tenant, any_library, any_name,
                                                                       any_polygon)
        self.assertEqual(result, expected_room)

    ### END GET CLOSEST ROOM ###

    ### GET LIBRARY SHAPE LIST ###
    def test_get_library_shape_list(self):
        shape_repository_mock = MagicMock()

        metadata_1_1 = {'name': 'Image 1', 'shape': b'{"polygon": [[0, 0], [1, 1]]}'}
        metadata_1_2 = {'name': 'Image 1', 'shape': b'{"polygon": [[0, 0], [2, 2]]}'}
        metadata_2_1 = {'name': 'Image 2', 'shape': b'{"polygon": [[0, 0], [3, 3]]}'}

        shape_repository_mock.get_library_shapes.return_value = [
            ResourceResult.success(MagicMock(), metadata_1_1),
            ResourceResult.success(MagicMock(), metadata_1_2),
            ResourceResult.success(MagicMock(), metadata_2_1)
        ]

        service = ImageService(MagicMock(), MagicMock(), MagicMock(), MagicMock(), MagicMock(),
                               shape_repository_mock)

        result = service.get_library_shapes(any_tenant, any_library)

        shape_repository_mock.get_library_shapes.assert_called_once_with(any_tenant, any_library)

        self.assertEqual(result, {
            'Image 1': [{"name": "Image 1", "shape": [[0, 0], [1, 1]]},
                        {"name": "Image 1", "shape": [[0, 0], [2, 2]]}],
            'Image 2': [{"name": "Image 2", "shape": [[0, 0], [3, 3]]}]
        })
    ### END GET LIBRARY SHAPE LIST ###
