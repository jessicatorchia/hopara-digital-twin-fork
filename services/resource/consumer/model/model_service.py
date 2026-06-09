import logging
import multiprocessing
import os
import platform
import tempfile
import threading
from math import radians
from typing import Any, List, Optional, cast

import trimesh

from common.lazy_import import lazy_import
from common.path import path_join
from common.resolution import Resolution
from consumer.image.image_utils import convert_to_webp

if platform.system() == 'Linux':
    os.environ['BLENDER_EXTERN_DRACO_LIBRARY_PATH'] = path_join(os.path.dirname(__file__), 'libextern_draco.so')
elif platform.system() == 'Darwin':
    os.environ['BLENDER_EXTERN_DRACO_LIBRARY_PATH'] = path_join(os.path.dirname(__file__), 'libextern_draco.dylib')

SUPPORTED_EXTENSIONS = ['.glb', '.gltf', '.fbx', '.obj']

MODEL_PROCESSING_TIMEOUT = os.getenv('MODEL_PROCESSING_TIMEOUT', 600)  # 10 minutes

lock = threading.Lock()


def obj_to_glb(obj_file_path):
    mesh = trimesh.load(obj_file_path, process=False)
    glb_file_path = f'{obj_file_path}.glb'
    mesh.export(glb_file_path)
    return glb_file_path


def load_model(model_file_path):
    _, extension = os.path.splitext(model_file_path)
    extension = extension.lower()

    if extension not in SUPPORTED_EXTENSIONS:
        raise ValueError(f'Invalid extension: {extension} | Supported: {SUPPORTED_EXTENSIONS}')

    # blender uses internal global variables leading to concurrency issues
    lock.acquire(timeout=MODEL_PROCESSING_TIMEOUT)
    lazy_import.LOG = False
    bpy = lazy_import('bpy', reload=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()

    if extension == '.fbx':
        result = bpy.ops.import_scene.fbx(filepath=model_file_path)
    elif extension == '.obj':
        # Use Blender's native OBJ importer (bpy 4.x) so that geometry is
        # loaded correctly even when the accompanying .mtl / texture files are
        # absent (trimesh silently produces an empty GLB in that case).
        result = bpy.ops.wm.obj_import(filepath=model_file_path)
    else:
        result = bpy.ops.import_scene.gltf(filepath=model_file_path, loglevel=logging.NOTSET)

    if result != {'FINISHED'}:
        raise ValueError(f'Error importing file: {result}')
    return bpy


def get_model_bounding_box(bpy):
    objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    if not objects:
        return 1, 1, 1  # Caso não haja modelos
    bbox_min = [min(obj.bound_box[i][j] for obj in objects for i in range(8)) for j in range(3)]
    bbox_max = [max(obj.bound_box[i][j] for obj in objects for i in range(8)) for j in range(3)]
    return bbox_max[0] - bbox_min[0], bbox_max[1] - bbox_min[1], bbox_max[2] - bbox_min[2]


def do_compress_model(input_file_path, output_file_paths, compression_level=6, reset_centroid=True):
    try:
        bpy = load_model(input_file_path)
        if len(bpy.data.objects) != 0:
            # criar material ou levar cor da layer
            for obj in bpy.data.objects:
                if type(obj.data) is bpy.types.Mesh:
                    if not obj.data.materials:
                        mat = bpy.data.materials.new(name="Material")
                        mat.use_nodes = True
                        obj.data.materials.append(mat)
                    # Convertendo cada objeto para MESH individualmente
                    obj.select_set(True)
                    bpy.context.view_layer.objects.active = obj
                    if bpy.ops.object.convert.poll():
                        bpy.ops.object.convert(target='MESH')

            bpy.ops.object.select_all(action='SELECT')
            # Move centro de massa do objeto para a posição 0,0,0
            bpy.ops.object.join()
            group = bpy.context.view_layer.objects.active
            if reset_centroid:
                bpy.ops.object.origin_set(type='GEOMETRY_ORIGIN', center='BOUNDS')
                # group.location = (0, 0, 0)
                bpy.ops.object.transform_apply(location=True)

            # Dimensiona o tamanho maximo para 20 metros
            max_size = 20
            max_dimension = max(group.dimensions)
            if max_dimension > max_size:
                scale_factor = max_size / max_dimension
                group.scale *= scale_factor
                bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

            print(output_file_paths[0])

            bpy.ops.export_scene.gltf(
                filepath=output_file_paths[0],
                export_normals=True,
                export_texcoords=True,
                export_tangents=True,
                export_attributes=True,
                export_yup=True,
                export_apply=True,
                export_current_frame=True,
                export_all_influences=True,
                export_hierarchy_flatten_bones=True,
                export_draco_mesh_compression_enable=True if compression_level else False,
                export_draco_mesh_compression_level=int(compression_level),
                export_draco_position_quantization=14,
                export_draco_normal_quantization=10,
                export_draco_texcoord_quantization=12,
                export_draco_color_quantization=10,
                export_draco_generic_quantization=12,
            )
    except Exception as error:
        logging.error(f'Error generating compressed gltf {error=}')
    finally:
        if lock.locked():
            lock.release()


def process_buffer_as_path(
        buffer: bytes, extension: str, output_extension: str, target: Any, output_count: int,
        extra_args: Optional[list[Any]] = None,
) -> List[bytes]:
    with (tempfile.TemporaryDirectory() as temp_dir):
        input_file_path = path_join(temp_dir, f'input{extension}')
        with open(input_file_path, 'wb+') as input_file:
            input_file.write(buffer)

        output_file_paths = []
        for i in range(output_count):
            output_file_paths.append(path_join(temp_dir, f'output_{i}{output_extension}'))
        args = [input_file_path, output_file_paths]
        if extra_args:
            args.extend(cast(Any, extra_args))
        process = multiprocessing.Process(target=target, args=tuple(args))
        process.daemon = True
        process.start()
        process.join(timeout=float(MODEL_PROCESSING_TIMEOUT))
        if process.is_alive():
            logging.error(f'{target.__name__}({args}) taking more them {MODEL_PROCESSING_TIMEOUT}s timeout. Killing it')
            process.terminate()
            process.join()
        if process.exitcode != 0:
            raise RuntimeError(f'Error processing model {target.__name__}({args}) {process.exitcode=}')
        buffers = []
        for output_file_path in output_file_paths:
            print(output_file_path)
            with open(output_file_path, 'rb') as output_file:
                buffers.append(output_file.read())
        return buffers


def do_model_to_image(
        input_file_path: str, output_file_paths: List[str], resolution: str, angles: List[int],
        technical: bool,
) -> None:
    try:
        bpy = load_model(input_file_path)
        bpy.ops.object.camera_add()
        camera = bpy.context.object

        # Configura a iluminação
        bpy.ops.object.select_all(action='DESELECT')
        bpy.ops.object.select_by_type(type='LIGHT')
        bpy.ops.object.delete()

        # Adicionar Key Light
        key_light_data = bpy.data.lights.new(name="KeyLight", type='AREA')
        key_light_data.energy = 1000
        key_light_data.size = 5
        key_light_data.color = (1, 1, 1)  # Cor branca
        key_light_object = bpy.data.objects.new(name="KeyLight", object_data=key_light_data)
        key_light_object.location = (5, -5, 5)
        bpy.context.collection.objects.link(key_light_object)

        # Adicionar Fill Light
        fill_light_data = bpy.data.lights.new(name="FillLight", type='AREA')
        fill_light_data.energy = 500
        fill_light_data.size = 5
        fill_light_data.color = (1, 1, 1)  # Cor branca
        fill_light_object = bpy.data.objects.new(name="FillLight", object_data=fill_light_data)
        fill_light_object.location = (-5, -5, 2)
        bpy.context.collection.objects.link(fill_light_object)

        # Adicionar Back Light
        back_light_data = bpy.data.lights.new(name="BackLight", type='AREA')
        back_light_data.energy = 800
        back_light_data.size = 5
        back_light_data.color = (1, 1, 1)  # Cor branca
        back_light_object = bpy.data.objects.new(name="BackLight", object_data=back_light_data)
        back_light_object.location = (0, 5, 5)
        bpy.context.collection.objects.link(back_light_object)

        # Configurar o ambiente do mundo (background) com uma cor branca
        bpy.context.scene.world.use_nodes = True
        env_node_tree = bpy.context.scene.world.node_tree
        bg = env_node_tree.nodes.new('ShaderNodeBackground')
        bg.inputs['Color'].default_value = (1, 1, 1, 1)  # Cor branca
        bg.location = (0, 0)
        output_node = env_node_tree.nodes.get('World Output')
        env_node_tree.links.new(bg.outputs['Background'], output_node.inputs['Surface'])

        bpy.context.scene.camera = camera
        bbox = get_model_bounding_box(bpy)
        max_dim = max(bbox[0], bbox[1], bbox[2])

        bpy.context.scene.render.resolution_x = resolution
        bpy.context.scene.render.resolution_y = resolution
        bpy.context.scene.eevee.taa_render_samples = 10
        bpy.context.scene.render.film_transparent = True
        bpy.context.scene.render.image_settings.file_format = 'PNG'
        bpy.context.scene.render.image_settings.color_mode = 'RGBA'
        # bpy.context.scene.render.resolution_percentage = 100
        bpy.context.view_layer.update()

        # Renderiza as vistas
        for index, angle in enumerate(angles):
            # Centraliza o modelo na origem (0, 0, 0)
            for obj in bpy.context.scene.objects:
                if obj.type == 'MESH':
                    bpy.context.view_layer.objects.active = obj
                    bpy.ops.object.origin_set(type='GEOMETRY_ORIGIN', center='BOUNDS')
                    obj.location = (0, 0, 0)

            camera.data.type = 'ORTHO'
            camera.rotation_euler = (radians(54.736), 0, radians(angle))
            camera.data.ortho_scale = max(bbox[0], bbox[1]) * 1.3
            camera.location = (max_dim, -max_dim, max_dim)

            bpy.ops.object.select_all(action='SELECT')
            bpy.ops.view3d.camera_to_view_selected()

            # Configura as propriedades de renderização
            if technical:
                bpy.context.scene.render.engine = 'BLENDER_WORKBENCH'

                # Configurações do Workbench para preto e branco
                bpy.context.scene.display.shading.light = 'FLAT'  # Iluminação plana
                bpy.context.scene.display.shading.color_type = 'SINGLE'  # Cor única
                bpy.context.scene.display.shading.single_color = (1.0, 1.0, 1.0)  # Branco para os objetos
                bpy.context.scene.display.shading.show_shadows = False
                bpy.context.scene.view_settings.view_transform = 'Raw'

                # Ativar Freestyle
                bpy.context.scene.render.use_freestyle = True

                # Configurações do Freestyle
                view_layer = bpy.context.view_layer
                view_layer.freestyle_settings.linesets.new(name="LineSet")

                lineset = view_layer.freestyle_settings.linesets["LineSet"]
                lineset.select_silhouette = True  # Silhuetas
                lineset.select_border = True  # Bordas externas
                lineset.select_crease = False  # Sem linhas de dobras
                lineset.visibility = 'VISIBLE'

                linestyle = lineset.linestyle
                linestyle.color = (0.0, 0.0, 0.0)  # Preto
                linestyle.thickness = 1.0
            else:
                bpy.context.scene.render.engine = 'BLENDER_EEVEE_NEXT'
                eevee = bpy.context.scene.eevee
                eevee.use_soft_shadows = True
                eevee.shadow_cube_size = '4096'
                eevee.shadow_cascade_size = '2048'
                eevee.use_gtao = True
                eevee.gtao_distance = 0.5
                eevee.gtao_factor = 1.0
                eevee.use_ssr = True
                eevee.use_ssr_refraction = True
                eevee.ssr_quality = 0.9
                eevee.ssr_max_roughness = 0.5

                eevee.use_volumetric_lights = True
                eevee.use_volumetric_shadows = True
                eevee.volumetric_tile_size = '2'
                bpy.ops.object.lightprobe_cache_bake(subset='ALL')

                for obj in bpy.context.scene.objects:
                    if obj.type == 'LIGHT':
                        obj.data.use_contact_shadow = True
                        obj.data.contact_shadow_distance = 0.2
                        obj.data.contact_shadow_thickness = 0.2
                        obj.data.shadow_soft_size = 0.25

            bpy.context.scene.render.filepath = output_file_paths[index]
            bpy.ops.render.render(write_still=True)
    except Exception as error:
        logging.exception(f'Error taking model screenshot {error=}')
    finally:
        if lock.locked():
            lock.release()


class ModelService:
    @staticmethod
    def to_images(buffer: bytes, angles: List[int], size: int | None = Resolution.default_size()) -> List[bytes]:
        buffers = process_buffer_as_path(
            buffer, '.glb', '.png', do_model_to_image,
            len(angles), [size, angles, False],
        )
        return [convert_to_webp(b)[0] for b in buffers]

    @staticmethod
    def compress(buffer: bytes, extension: str, compression_level: int = 6, reset_centroid: bool = True) -> List[bytes]:
        return process_buffer_as_path(
            buffer, extension, '.glb', do_compress_model,
            1, [compression_level, reset_centroid]
        )