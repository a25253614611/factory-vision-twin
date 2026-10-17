"""Generate two small synthetic PNG fixtures without external libraries."""

import struct
import zlib
from pathlib import Path

WIDTH, HEIGHT = 320, 200


def pixel(x, y, missing):
    color = (18, 31, 45)
    if 30 <= x < 290 and 25 <= y < 175:
        color = (42, 94, 99)
    if 80 <= x < 240 and 65 <= y < 135:
        color = (30, 54, 70)
    for sx, sy, index in ((50, 45, 0), (270, 45, 1), (50, 155, 2), (270, 155, 3)):
        if missing and index == 3:
            continue
        radius2 = (x - sx) ** 2 + (y - sy) ** 2
        if radius2 < 64:
            color = (201, 215, 215)
        if radius2 < 16:
            color = (82, 107, 119)
    return (*color, 255)


def chunk(name, data):
    return struct.pack(">I", len(data)) + name + data + struct.pack(">I", zlib.crc32(name + data))


def write_png(path, missing):
    rows = bytearray()
    for y in range(HEIGHT):
        rows.append(0)
        for x in range(WIDTH):
            rows.extend(pixel(x, y, missing))
    content = b"\x89PNG\r\n\x1a\n"
    content += chunk(b"IHDR", struct.pack(">IIBBBBB", WIDTH, HEIGHT, 8, 6, 0, 0, 0))
    content += chunk(b"IDAT", zlib.compress(bytes(rows), 9))
    content += chunk(b"IEND", b"")
    path.write_bytes(content)


if __name__ == "__main__":
    root = Path(__file__).parent
    write_png(root / "reference.png", False)
    write_png(root / "missing_fastener.png", True)
    print("Created synthetic reference.png and missing_fastener.png")
