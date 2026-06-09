import magic


def is_gltf(buffer: bytes) -> bool:
    return buffer.startswith(b'glTF')


def is_png(buffer: bytes) -> bool:
    return buffer.startswith(b'\x89PNG\r\n\x1a\n')


def is_svg(buffer: bytes) -> bool:
    head = buffer[:1024].decode("utf-8", errors="ignore").lower()
    return "<svg" in head


def is_webp(buffer: bytes) -> bool:
    return len(buffer) >= 12 and buffer[:4] == b'RIFF' and buffer[8:12] == b'WEBP'


def is_obj(buffer: bytes) -> bool:
    """Check if buffer is a Wavefront OBJ file by scanning for OBJ keywords."""
    _OBJ_KEYWORDS = {'v', 'vn', 'vt', 'f', 'o', 'g', 'mtllib', 'usemtl', 's'}
    try:
        head = buffer[:2048].decode('utf-8', errors='ignore')
        for line in head.splitlines()[:30]:
            parts = line.strip().split()
            if parts and parts[0] in _OBJ_KEYWORDS:
                return True
    except Exception:
        pass
    return False


def discover_mimetype(buffer: bytes) -> str:
    if is_gltf(buffer):
        return 'model/gltf-binary'
    if is_png(buffer):
        return 'image/png'
    if is_svg(buffer):
        return 'image/svg+xml'
    if is_webp(buffer):
        return 'image/webp'
    mime = magic.from_buffer(buffer, mime=True)
    if mime == 'text/plain' and is_obj(buffer):
        return 'model/obj'
    return mime