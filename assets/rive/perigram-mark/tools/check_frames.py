#!/usr/bin/env python3
"""Pixel-samples rive screenshots against expected mark geometry.

Not part of the shipped animation; validation helper for the authoring loop.
"""
import sys
from PIL import Image

E = 52.9147
W = E * 3**0.5 / 2
V = E / 2
CX, CY = 100.0, 100.0


def sample(img, x, y):
    return img.getpixel((int(round(x)), int(round(y))))


def is_brand(px):
    r, g, b = px[:3]
    return r > 140 and g < 130 and b < 90


def main(path, expect):
    img = Image.open(path).convert("RGB")
    print(path, img.size)
    ok = True
    for name, x, y, want_fill in expect:
        px = sample(img, CX + x, CY + y)
        filled = is_brand(px)
        status = "OK " if filled == want_fill else "FAIL"
        if filled != want_fill:
            ok = False
        print(f"  {status} {name:26s} ({x:+7.1f},{y:+7.1f}) want={'mark' if want_fill else 'gap':4s} got={px}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    # geometry facts (rhombus-local): face spans y in [-V, V]; flanges hang to
    # 2.5V; rib gap under face bottom vertex B=(0, V) between the flanges.
    REST = [
        ("face center", 0, 0, True),
        ("face top", 0, -V + 5, True),
        ("left flange mid", -W + 20, V + 20, True),
        ("right flange mid", W - 20, V + 20, True),
        ("rib gap (below B)", 0, V + 22, False),
        ("outside left", -W - 22, 0, False),
        ("below mark", 0, 2.5 * V + 12, False),
    ]
    SHUT = [
        ("face center", 0, 0, True),
        ("flange lifted: old rest spot", -W + 20, V + 20, False),
        ("flange lifted: old rest spot R", W - 20, V + 20, False),
        ("rib gap", 0, V + 22, False),
    ]
    which = sys.argv[1] if len(sys.argv) > 1 else "rest"
    main(sys.argv[2], REST if which == "rest" else SHUT)
