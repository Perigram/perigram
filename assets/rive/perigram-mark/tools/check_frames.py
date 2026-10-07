#!/usr/bin/env python3
"""Pixel-samples rive screenshots against expected walking-fold phases.

Validation helper for the authoring loop. Phases: seated (the logo), flat
(flange collapsed to a tape along its top edge), sweep (the tape-arm
standing vertical over the face, mid-rotation around the inner corner).
"""
import os
import sys
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generate_scene import W, V, FLAT_L, SEATED_L, rot, PIVOT, SWEEP  # noqa: E402

CX, CY = 100.0, 100.0


def sample(img, x, y):
    return img.getpixel((int(round(CX + x)), int(round(CY + y))))


def is_brand(px):
    r, g, b = px[:3]
    return r > 140 and g < 130 and b < 90


def inside(pts, p):
    x, y = p
    n, hit = len(pts), False
    for k in range(n):
        x1, y1 = pts[k]
        x2, y2 = pts[(k + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            hit = not hit
    return hit


def main(path, phase):
    img = Image.open(path).convert("RGB")
    print(path, phase)
    quads = {"L": SEATED_L, "F": FLAT_L, "M": rot(FLAT_L, PIVOT, SWEEP / 2)}
    checks = {
        "seated": [("face top", 0, -V + 5, True), ("left flange", -W + 20, V + 20, True),
                   ("right flange", W - 20, V + 20, True), ("rib gap", 0, V + 22, False)],
        "flat": [("tape interior", -24.3, 40.5, True),
                 ("old flange mid empty", -W + 20, V + 20, False),
                 ("mirror tape interior", 24.3, 40.5, True),
                 ("rib gap below tapes", 0, V + 22, False)],
        "sweep": [("arm over face center", -1.3, 5, True),
                  ("arm mid, below face", -1.3, 35, True),
                  ("face top intact", 0, -V + 5, True),
                  ("old flange mid empty", -W + 20, V + 20, False),
                  ("rib gap aside arm", -15, V + 22, False)],
    }
    ok = True
    for name, x, y, want in checks[phase]:
        px = sample(img, x, y)
        got = is_brand(px)
        status = "OK " if got == want else "FAIL"
        if got != want:
            ok = False
        print(f"  {status} {name:26s} ({x:+7.1f},{y:+7.1f}) want={'mark' if want else 'gap':4s} got={px}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main(sys.argv[2], sys.argv[1])
