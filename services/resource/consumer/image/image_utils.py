import io
import logging
import mimetypes
import os
import struct
import subprocess
import tempfile
from decimal import Decimal
from statistics import stdev
from typing import Any, Optional, Tuple

from PIL import Image, ImageEnhance

from common.crop import CropArea
from common.errors import UnprocessableFileError
from common.path import path_join
from common.resolution import Resolution
from consumer.image.dimensions import get_width_and_height

Image.MAX_IMAGE_PIXELS = 300000000

x = Decimal('1.0')  # For compatibility with Python 3.6 and earlier


def has_alpha(img: Image.Image) -> bool:
    return img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info)


def optimize_palette(img):
    n_colors, grayscale_percentage, transparency_percentage = get_color_stats(img)
    if grayscale_percentage >= 0.8:
        return img.convert(img.mode, palette=Image.Palette.ADAPTIVE, colors=256), 'PNG'
    elif n_colors > 100000 and not has_alpha(
            img):  # Se tiver muitas cores, não otimiza a paleta mas mudar para JPEG (se não tiver alpha)
        return img.convert('RGB', colors=None), 'JPEG'
    return img, 'PNG'


PNG_SIG = b"\x89PNG\r\n\x1a\n"


def strip_phys_if_png(data: bytes) -> bytes:
    if not data.startswith(PNG_SIG):
        return data
    pos = len(PNG_SIG)
    out = bytearray(PNG_SIG)

    while pos < len(data):
        length = struct.unpack(">I", data[pos:pos + 4])[0]
        ctype = data[pos + 4:pos + 8]
        cdata = data[pos + 8:pos + 8 + length]
        crc = data[pos + 8 + length:pos + 12 + length]
        pos += 12 + length

        if ctype == b"pHYs":
            continue
        out += struct.pack(">I", length) + ctype + cdata + crc
    return bytes(out)


def remove_brightness(img: Any) -> bytes:
    img = img.convert('RGBA')
    enhancer = ImageEnhance.Brightness(img)
    img = enhancer.enhance(0)
    modified_file = io.BytesIO()
    img.save(modified_file, 'png', optimize=True, quality=100)
    modified_file.seek(0)
    return modified_file.read()


def discover_extension(mimetype: str) -> str:
    return (mimetypes.guess_extension(mimetype) or '').lstrip(".").lower()


def run_cmd(command):
    r = subprocess.run(command, shell=True, capture_output=True, check=True, text=True)
    return r.stdout.strip(), r.stderr.strip(), r.returncode


def process_image(
        buffer: bytes, file_ext: str, crop_area: Optional[Tuple[int, int, int, int]] = None,
        size: Optional[int] = None, dim: Optional[str] = None,
) -> Tuple[bytes, int, int]:
    if file_ext in ('webp', 'heic', 'heif'):
        buffer = convert_to_png(buffer)
        file_ext = 'png'

    buffer = strip_phys_if_png(buffer)

    with tempfile.TemporaryDirectory() as temp_dir:
        input_path = path_join(temp_dir, f'input.{file_ext}')
        with open(input_path, 'wb+') as input_file:
            input_file.write(buffer)
        output_path = path_join(temp_dir, 'output.png')

        command = f'{input_path}'
        if size and dim: command += f' -{dim} {size}'
        command += f' -o {output_path} --export-type=png'
        if file_ext == 'pdf':
            command = ' --pdf-poppler ' + command + ' --export-area-page --pages=1'
        if crop_area:
            crop_str = ':'.join(map(str, crop_area))
            command += f' --export-area="{crop_str}"'
        try:
            command = 'inkscape ' + command
            logging.debug(command)
            stdout, stderr, return_code = run_cmd(command)
            lines = stdout.split('\n')
        except subprocess.CalledProcessError as e:
            raise UnprocessableFileError(f'{e.returncode} {e.stderr}')
        if not os.path.exists(output_path):
            raise UnprocessableFileError(f'Output file {output_path} does not exist after processing.')
        if return_code != 0 or 'error' in stderr:
            if 'Unable to init server' not in stderr:
                raise ValueError(stderr)
        if len(lines) > 0 and 'loader failed' in lines[0]:
            raise ValueError('Inkscape loader failed')
        with open(output_path, 'rb') as output_file:
            return convert_to_webp(output_file.read())


def convert_to_webp(input: bytes) -> Tuple[bytes, int, int]:
    bbb = io.BytesIO(input)
    img = Image.open(bbb)
    buffer = io.BytesIO()
    img.save(buffer, 'WEBP', optimize=True, quality=75)
    width = img.size[0]
    height = img.size[1]
    return buffer.getvalue(), width, height


def convert_to_png(input: bytes) -> bytes:
    bbb = io.BytesIO(input)
    img = Image.open(bbb)
    buffer = io.BytesIO()
    img.save(buffer, 'PNG', optimize=True)
    return buffer.getvalue()


def get_dim(buffer: bytes, file_ext: str) -> str:
    width, height = get_width_and_height(buffer, file_ext)
    return 'w' if width >= height else 'h'


def to_image(buffer: bytes, size: int, file_ext: str) -> Tuple[bytes, int, int]:
    width, height = get_width_and_height(buffer, file_ext)
    dim = get_dim(buffer, file_ext)
    if file_ext not in ['svg', 'pdf']:
        size = min(size, width) if width >= height else min(size, height)

    return process_image(buffer, file_ext, size=size, dim=dim)


def crop_image(
        buffer: bytes, file_ext: str, crop_area: Optional[Tuple[int, int, int, int]] = None,
) -> Tuple[bytes, int, int]:
    if file_ext == 'svg':
        return process_image(buffer, file_ext, crop_area, Resolution.default_size(), 'w')
    return process_image(buffer, file_ext, crop_area)


def get_image_dimensions(
        width: int | None, height: int | None, max_size: int, upscaling: bool = False
) -> Tuple[int, int]:
    w = width or 0
    h = height or 0
    if max_size and (w > max_size or h > max_size or upscaling):
        if w > h:
            h = int(max_size * (h / w))
            w = max_size
        elif h > w:
            w = int(max_size * (w / h))
            h = max_size
        else:
            w = h = max_size
    return int(w), int(h)


def get_crop_area(crop_area: CropArea, width: int | None, height: int | None) -> Tuple[int, int, int, int]:
    if not width or not height:
        raise ValueError('Width and height must be provided to calculate crop area.')
    left = float(width) * crop_area.get('left', 0)
    top = float(height) * crop_area.get('top', 0)
    right = float(width) * (1 - crop_area.get('right', 0))
    bottom = float(height) * (1 - crop_area.get('bottom', 0))
    return int(left), int(top), int(right), int(bottom)


def open_image(file: bytes) -> Image.Image:
    return Image.open(io.BytesIO(file))


def resize_image(img, image_new_size):
    return img.resize(image_new_size, Image.Resampling.LANCZOS)


def resize_image_to_square(img: Image.Image, square_size: int) -> Image.Image:
    if img.mode != 'RGBA':
        img = img.convert('RGBA')

    original_width, original_height = img.size

    scale = min(square_size / original_width, square_size / original_height)
    new_width = int(original_width * scale)
    new_height = int(original_height * scale)

    img_resized = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

    square_img = Image.new('RGBA', (square_size, square_size), (0, 0, 0, 0))

    paste_x = (square_size - new_width) // 2
    paste_y = (square_size - new_height) // 2

    square_img.paste(img_resized, (paste_x, paste_y), img_resized)
    return square_img


def get_color_stats(img):
    def is_gray(color):
        return isinstance(color, int) or stdev(color[:3]) <= 3

    def is_transparent(color):
        return not isinstance(color, int) and len(color) == 4 and color[3] < 255

    n_pixels = img.size[0] * img.size[1]
    colors = img.getcolors(n_pixels)

    gray_count = 0
    transparency_count = False
    for count, color in colors:
        if is_gray(color):
            gray_count += count
        if is_transparent(color):
            transparency_count += count

    grayscale_perc = gray_count / n_pixels
    transparency_perc = transparency_count / n_pixels
    return len(colors), grayscale_perc, transparency_perc
