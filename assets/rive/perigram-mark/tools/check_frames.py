#!/usr/bin/env python3
"""Pixel-samples rive screenshots against expected core-rotation phases.

Validation helper for the authoring loop. The face is the only moving part;
flanges and rib gap never change. Phases: rest (phi=0, the logo) and
phi45 (square corner-on: the wide rectangle, narrower than the rhombus).
"""
import os
import sys
from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__))))
from generate_scene import W, V, face_screen  # noqa: E402

CX, CY = 100.0, 100.0


def sample(img, x, y):
    return img.getpixel((int(round(CX + x)), int(round(CY + y))))


def is_brand(px):
    r, g, b = px[:3]
    return r > 140 and g < 130 and b < 90


def inside(pts, p):
    """Point-in-polygon for the projected face quad."""
    x, y = p
    n, inside_ = len(pts), False
    for k in range(n):
        x1, y1 = pts[k]
        x2, y2 = pts[(k + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside_ = not inside_
    return inside_


def main(path, phi):
    img = Image.open(path).convert("RGB")
    quad = face_screen(phi)
    print(path, f"phi={phi}")
    ok = True
    checks = [("rhombus corner zone", 0.9 * W, 0.0),
              ("rectangle corner zone", 0.6 * W, 0.55 * V),
              ("face center", 0.0, 0.0),
              ("left flange mid", -W + 20, V + 20),
              ("rib gap", 0.0, V + 22)]
    for name, x, y in checks:
        px = sample(img, x, y)
        want = inside(quad, (x, y)) if y <= V else (V < y < 2.2 * V and x < -10)
        # flange zone: only the flange covers it; gap zone: nothing does
        if name == "left flange mid":
            want = True
        if name == "rib gap":
            want = False
        got = is_brand(px)
        status = "OK " if got == want else "FAIL"
        if got != want:
            ok = False
        print(f"  {status} {name:24s} ({x:+7.1f},{y:+7.1f}) want={'mark' if want else 'gap':4s} got={px}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main(sys.argv[2], float(sys.argv[1]))
