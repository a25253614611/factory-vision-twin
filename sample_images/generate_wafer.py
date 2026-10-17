"""Create fictional wafer images for the browser demo; no external packages."""

import struct
import zlib
from pathlib import Path

SIZE = 480
CENTER = SIZE // 2
RADIUS = 205


def wafer_pixel(x, y, defect):
    dx, dy = x - CENTER, y - CENTER
    radius2 = dx * dx + dy * dy
    color = (13, 27, 43)
    if radius2 <= RADIUS * RADIUS and not (dy > 197 and abs(dx) < 16):
        if radius2 >= (RADIUS - 4) ** 2:
            color = (137, 211, 222)
        else:
            gx = abs((dx + 16) % 32 - 16)
            gy = abs((dy + 16) % 32 - 16)
            die_x = (x - 35) // 32
            die_y = (y - 35) // 32
            variation = ((die_x * 7 + die_y * 11) % 5) * 3
            color = (49 + variation, 101 + variation, 123 + variation)
            if gx >= 14 or gy >= 14:
                color = (25, 61, 82)
            elif gx <= 2 and gy <= 10:
                color = (93, 166, 174)
            elif gy <= 2 and gx <= 10:
                color = (82, 151, 169)
            elif 6 <= gx <= 8 and 6 <= gy <= 8:
                color = (109, 184, 185)
            if defect == "particle" and (x - 305) ** 2 + (y - 170) ** 2 < 10 ** 2:
                color = (244, 162, 105)
            if defect == "scratch":
                x1, y1, vx, vy = 135, 308, 195, -100
                t = ((x - x1) * vx + (y - y1) * vy) / (vx * vx + vy * vy)
                if 0 <= t <= 1 and (x - x1 - t * vx) ** 2 + (y - y1 - t * vy) ** 2 < 2.8 ** 2:
                    color = (222, 204, 155)
    return (*color, 255)


def chunk(name, data):
    return struct.pack(">I", len(data)) + name + data + struct.pack(">I", zlib.crc32(name + data))


def write_wafer(path, defect=None):
    rows = bytearray()
    for y in range(SIZE):
        rows.append(0)
        for x in range(SIZE):
            rows.extend(wafer_pixel(x, y, defect))
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(rows), 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


if __name__ == "__main__":
    folder = Path(__file__).parent
    for name, defect in (("wafer_reference.png", None), ("wafer_particle.png", "particle"), ("wafer_scratch.png", "scratch")):
        write_wafer(folder / name, defect)
        print(name)
