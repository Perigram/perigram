#!/usr/bin/env python3
"""Pixel-samples rive screenshots against expected clamp phases.

Validation helper for the authoring loop. Phases: open (rest, the logo)
and clamped (flanges risen one fold depth behind the face, rib squeezed).
"""
import sys
from PIL import Image

E = 52.9147
W = E * 3**0.5 / 2
V = E / 2
CX, CY = 100.0, 100.0


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
        print(f"  {status} {name:30s} ({x:+7.1f},{y:+7.1f}) want={'mark' if want_fill else 'gap':4s} got={px}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    OPEN = [
        ("face center", 0, 0, True),
        ("face top", 0, -V + 5, True),
        ("left flange mid", -W + 20, V + 20, True),
        ("right flange mid", W - 20, V + 20, True),
        ("rib gap below face edge", -11.5, 32.5, False),
        ("rib gap (below B)", 0, V + 22, False),
        ("below mark", 0, 2.5 * V + 12, False),
    ]
    CLAMPED = [
        ("face center (nodded 1.5)", 0, 1.5, True),
        ("flange covers old gap", -11.5, 32.5, True),
        ("mirror flange covers gap", 11.5, 32.5, True),
        ("old flange mid now empty", -W + 20, V + 20, False),
        ("tight notch below B", 0, V + 22, False),
        ("face top still mark", 0, -V + 5, True),
    ]
    poses = {"open": OPEN, "clamped": CLAMPED}
    main(sys.argv[2], poses[sys.argv[1]])
