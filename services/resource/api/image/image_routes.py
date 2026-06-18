from typing import cast

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, Response, jsonify, make_response, request

from api.container import Container
from api.image.image import ImageRequestFormat
from api.image.image_service import ImageService
from api.security.security import verify_token
from common.dictionary import get_with_default
from common.resolution import Resolution, ResolutionType
from common.resource_result import ResourceResult
from common.resource_state import ResourceState
from common.server_util import get_resource_response_with_header

blueprint = Blueprint('image', __name__)


def get_request_format() -> ImageRequestFormat:
    if request.args.get('format') == 'json' or 'json' in request.headers.get('Accept', ''):
        return 'json'
    return 'image'


def get_img_response(result: ResourceResult) -> Response:
    if result.state == ResourceState.NOT_FOUND:
        return make_response({'message': 'Image not found'}, 404)
    status_code = 200
    if result.state == ResourceState.PROCESSING:
        status_code = 202
    metadata = result.metadata
    metadata['dimensions'] = {
        'width': metadata.get('width', 0),
        'height': metadata.get('height', 0),
    }

    return make_response(jsonify(metadata), status_code)


# Libraries routes
@blueprint.route("/tenant/<tenant>/image-library/<library>/shape", methods=['GET'])
@inject
def get_library(tenant: str, library: str, service: ImageService = Provide[Container.image_service]) -> Response:
    shapes = service.get_library_shapes(tenant, library)
    if shapes:
        return make_response(jsonify(shapes), 200)
    return make_response({'message': f'library {library} not found!'}, 404)


@blueprint.route("/tenant/<tenant>/image-library/<library>/image/<path:name>", methods=['PUT'])
@inject
@verify_token
def library_put(
        tenant: str, library: str, name: str, service: ImageService = Provide[Container.image_service],
) -> Response:
    """
        Upload an image to the image library.
        ---
        tags:
          - image-library
        parameters:
          - name: tenant
            in: path
            type: string
            required: true
            description: The tenant ID
          - name: library
            in: path
            type: string
            required: true
            description: The name of the library where the image will be saved
          - name: name
            in: path
            type: string
            required: true
            description: The name of the image
          - name: file
            in: formData
            type: file
            required: true
            description: The image file to be uploaded. PNG, JPEG, SVG, and PDF are supported.
        consumes:
          - multipart/form-data
        responses:
          200:
            description: The image upload was successful and returns its dimensions, MIME type, and version
            schema:
              type: object
              properties:
                dimensions:
                  type: object
                  properties:
                    width:
                      type: integer
                      description: Image width
                    height:
                      type: integer
                      description: Image height
                version:
                  type: string
                  description: The version of the image
          500:
            description: Internal server error
            schema:
              type: object
              properties:
                message:
                  type: string
                  example: "Internal server error"
        """
    invalidate = request.args.get('invalidate', 'true', type=str).lower() == 'true'

    file = request.files['file']
    result = service.save(tenant, library, name, file.stream.read(), invalidate)
    return get_resource_response_with_header(result)


@blueprint.route("/tenant/<tenant>/image-library/<library>/image/<name>/crop", methods=['POST'])
@inject
@verify_token
def image_crop(
        tenant: str, library: str, name: str, service: ImageService = Provide[Container.image_service],
) -> Response:
    crop_area = request.json or {}
    result = service.crop(
        tenant, library, name,
        crop_area.get('left', 0) / 100,
        crop_area.get('right', 0) / 100,
        crop_area.get('bottom', 0) / 100,
        crop_area.get('top', 0) / 100,
    )
    return get_resource_response_with_header(result)


@blueprint.route("/tenant/<tenant>/image-library/<library>/image/<path:name>", methods=['GET'])
@inject
def library_get(
        tenant: str, library: str, name: str, service: ImageService = Provide[Container.image_service],
) -> Response:
    """
    Retrieve an image or its metadata from the image library.
    ---
    tags:
      - image-library
    parameters:
      - name: tenant
        in: path
        required: true
        schema:
          type: string
        description: The tenant ID
      - name: library
        in: path
        required: true
        schema:
          type: string
        description: The name of the image library
      - name: name
        in: path
        required: true
        schema:
          type: string
        description: The name of the image to be retrieved
      - name: max-size
        in: query
        required: false
        schema:
          type: integer
        description: The maximum allowed size of the image in pixels (default 4096)
      - name: resolution
        in: query
        required: false
        schema:
          type: string
        description: The desired resolution of the image
      - name: fallback
        in: query
        required: false
        schema:
          type: string
        description: An alternative name to use if the original image is not found.
        The fallback must be in the same library.
      - name: format
        in: query
        required: false
        schema:
          type: string
        description: If 'json', only returns the image metadata instead of the image.
        This is a way to check if the image exists without downloading it.
    responses:
      200:
        description: The image was successfully retrieved, or the metadata was returned
        content:
          application/json:
            schema:
              type: object
              properties:
                dimensions:
                  type: object
                  properties:
                    width:
                      type: integer
                      description: Image width
                    height:
                      type: integer
                      description: Image height
                version:
                  type: string
                  description: The version of the image
          image/png:
            schema:
              type: string
              format: binary
      400:
        description: Invalid request, incorrect parameters
      404:
        description: Image not found
    """

    max_size_str = request.args.get('max-size', None)
    max_size = int(max_size_str) if max_size_str else None
    resolution = cast(ResolutionType, request.args.get('resolution', type=str))

    fallback = request.args.get('fallback', '')
    angle_str = request.args.get('angle', '')
    angle = int(angle_str) if angle_str.isdigit() else None
    result = service.get(
        tenant, library, name, get_request_format(), resolution, max_size, angle=angle, fallback=fallback
    )
    return get_resource_response_with_header(result)


@blueprint.route("/tenant/<tenant>/image-library/<library>/image/<path:name>/history", methods=['GET'])
@inject
def library_get_history(
        tenant: str, library: str, name: str, service: ImageService = Provide[Container.image_service],
) -> Response:
    limit = request.args.get('limit', type=int)
    items = service.history_list(tenant, library, name, limit)
    return make_response(items)


@blueprint.route("/tenant/<tenant>/image-library/<library>/image/<path:name>/history/<version>", methods=['GET'])
@inject
def library_get_history_version(
        tenant: str, library: str, name: str, version: int,
        service: ImageService = Provide[Container.image_service],
) -> Response:
    resolution, max_size = Resolution.default()
    resolution = get_with_default(request.args, 'resolution', cast(ResolutionType, 'md'))
    max_size = request.args.get('max-size', max_size, type=int)
    result = service.history_checkout(tenant, library, name, version, get_request_format(), resolution, max_size)
    return get_resource_response_with_header(result)


@blueprint.route(
    "/tenant/<tenant>/image-library/<library>/image/<path:name>/history/<version>/restore",
    methods=['PUT'],
)
@inject
@verify_token
def library_restore_history_version(
        tenant: str, library: str, name: str, version: int,
        service: ImageService = Provide[Container.image_service],
) -> Response:
    result = service.history_restore(tenant, library, name, int(version))
    return get_resource_response_with_header(result)


@blueprint.route(
    "/tenant/<tenant>/image-library/<library>/image/<path:name>/history/<version>/rollback",
    methods=['PUT'],
)
@inject
@verify_token
def library_undo(
        tenant: str, library: str, name: str, version: int,
        service: ImageService = Provide[Container.image_service],
) -> Response:
    result = service.undo(tenant, library, name, int(version))
    return get_resource_response_with_header(result)


@blueprint.route("/tenant/<tenant>/image-library/<library>/image/<path:name>/shape", methods=['GET', 'POST'])
@inject
def library_get_shape(
        tenant: str, library: str, name: str, service: ImageService = Provide[Container.image_service],
) -> Response:
    angle_str = request.args.get('angle', '')
    angle = int(angle_str) if angle_str.isdigit() else None
    image_shape: dict | None = None
    # GET = FIT TO IMAGE
    if request.method == 'GET':
        image_shape = service.get_shape(tenant, library, name, angle)
    # POST = FIT TO ROOM
    elif request.method == 'POST':
        body = request.get_json()
        if body:
            image_shape = service.get_closest_room(tenant, library, name, body)
        if not image_shape:
            image_shape = service.get_shape(tenant, library, name, angle)

    if image_shape is None:
        return make_response({'message': 'resource or shape not found!'}, 404)
    return make_response(jsonify(image_shape), 200)


@blueprint.route("/tenant/<tenant>/image-library/<library>/image/<path:name>/shape-box", methods=['GET'])
@inject
def library_get_shape_box(
        tenant: str, library: str, name: str, service: ImageService = Provide[Container.image_service],
) -> Response:
    image_shape = service.shape_box(tenant, library, name)
    if image_shape is None:
        return make_response({'message': 'resource or shape not found!'}, 404)
    return make_response(jsonify(image_shape), 200)


@blueprint.route("/tenant/<tenant>/image-library/<library>/image/<path:name>/generate", methods=['PUT'])
@inject
def generate(
        tenant: str, library: str, name: str, service: ImageService = Provide[Container.image_service],
) -> Response:
    invalidate = request.args.get('invalidate', 'true', type=str).lower() == 'true'
    result = service.image_to_render(tenant, library, name, invalidate=invalidate)
    return get_resource_response_with_header(result)
