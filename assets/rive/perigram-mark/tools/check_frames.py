#!/usr/bin/env python3
"""Pixel-samples rive screenshots against expected mark geometry.

Validation helper for the authoring loop. Poses: locked (amp 0, the logo)
and exploded (amp 1: face floats up, flanges splay down-out).
"""
import sys
from PIL import Image

E = 52.9147
W = E * 3**0.5 / 2
V = E / 2
M = W / 2
CX, CY = 100.0, 100.0

FACE_VEC = (0.0, -14.0)
FLANGE_VEC = (0.866 * 24, 12.0)


def flange_center(sign):
    xs = [-W, 0.0, -M, -(W + M)]
    ys = [V, 2 * V, 2.5 * V, 1.5 * V]
    cx = sign * (abs(sum(xs) / 4) + FLANGE_VEC[0])
    cy = sum(ys) / 4 + FLANGE_VEC[1]
    return (cx, cy)


def sample(img, x, y):
    return img.getpixel((int(round(CX + x)), int(round(CY + y))))


def is_brand(px):
    r, g, b = px[:3]
    return r > 140 and g < 130 and b < 90


def main(path, expect):
    img = Image.open(path).convert("RGB")
    print(path, img.size)
    ok = True
    for name, x, y, want_fill in expect:
        px = sample(img, x, y)
        filled = is_brand(px)
        status = "OK " if filled == want_fill else "FAIL"
        if filled != want_fill:
            ok = False
        print(f"  {status} {name:28s} ({x:+7.1f},{y:+7.1f}) want={'mark' if want_fill else 'gap':4s} got={px}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    LOCKED = [
        ("face center", 0, 0, True),
        ("face top", 0, -V + 5, True),
        ("above face top", 0, -31, False),
        ("left flange mid", -W + 20, V + 20, True),
        ("right flange mid", W - 20, V + 20, True),
        ("rib gap (below B)", 0, V + 22, False),
        ("below mark", 0, 2.5 * V + 12, False),
    ]
    fl, fr = flange_center(-1), flange_center(1)
    EXPLODED = [
        ("face floated up", 0, -31, True),
        ("face center", 0, -8, True),
        ("left flange moved", fl[0], fl[1], True),
        ("right flange moved", fr[0], fr[1], True),
        ("rib gap still gap", 0, V + 22, False),
        ("face old bottom now gap", 0, V + 2, False),
    ]
    which = sys.argv[1] if len(sys.argv) > 1 else "locked"
    main(sys.argv[2], LOCKED if which == "locked" else EXPLODED)
