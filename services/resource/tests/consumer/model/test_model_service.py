import os
import unittest

from common.path import path_join
from consumer.model.model_service import ModelService
from tests.test_utils import TEST_ROOT

model_service = ModelService()


class TestModelService(unittest.TestCase):
    def test_process_glb(self):
        file_path = path_join(TEST_ROOT, 'fixtures/sample.glb')
        with open(file_path, 'rb+') as fp:
            buffers = model_service.compress(fp.read(), os.path.splitext(file_path)[1])
            self.assertEqual(1496, len(buffers[0]))

    def test_generate_screenshot(self):
        file_path = path_join(TEST_ROOT, 'fixtures/sample.glb')
        with open(file_path, 'rb+') as fp:
            buffers = model_service.to_images(fp.read(), angles=[45, 135], size=256)
            self.assertEqual(2, len(buffers))
            self.assertGreater(len(buffers[0]), 1500)
            self.assertGreater(len(buffers[1]), 1500)

    def test_process_obj(self):
        file_path = path_join(TEST_ROOT, 'fixtures/sample.obj')
        with open(file_path, 'rb+') as fp:
            buffers = model_service.compress(fp.read(), os.path.splitext(file_path)[1])
            self.assertEqual(26048, len(buffers[0]))

    def test_process_fbx(self):
        file_path = path_join(TEST_ROOT, 'fixtures/sample.fbx')
        with open(file_path, 'rb+') as fp:
            buffers = model_service.compress(fp.read(), os.path.splitext(file_path)[1])
            self.assertEqual(1564, len(buffers[0]))
