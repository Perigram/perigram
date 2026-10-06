#!/usr/bin/env python3
"""Pixel-samples rive screenshots against expected plotter phases.

Validation helper for the authoring loop. Phases: full (solid mark, the
logo), empty (loop start/end), draw (face outline mid-trace: line art on
the face, flanges untouched), comet (white inspection segment on the left
flange contour).
"""
import sys
from PIL import Image

E = 52.9147
W = E * 3**0.5 / 2
V = E / 2
M = W / 2
CX, CY = 100.0, 100.0


def sample(img, x, y):
    return img.getpixel((int(round(CX + x)), int(round(CY + y))))


def is_brand(px):
    r, g, b = px[:3]
    return r > 140 and g < 130 and b < 90


def is_white(px):
    r, g, b = px[:3]
    return r > 200 and g > 200 and b > 200


def main(path, expect):
    img = Image.open(path).convert("RGB")
    print(path, img.size)
    ok = True
    for name, x, y, kind in expect:
        if kind in ("white-any",):
            r = 6
            box = [(dx, dy) for dx in range(-r, r + 1) for dy in range(-r, r + 1)]
            hits = [p for p in box
                    if is_white(sample(img, x + p[0], y + p[1]))]
            status = "OK " if hits else "FAIL"
            if not hits:
                ok = False
            print(f"  {status} {name:28s} ({x:+7.1f},{y:+7.1f}) want=white got={len(hits)} px")
            continue
        px = sample(img, x, y)
        filled = {"mark": is_brand, "gap": lambda p: not is_brand(p)}[kind](px)
        status = "OK " if filled else "FAIL"
        if not filled:
            ok = False
        print(f"  {status} {name:28s} ({x:+7.1f},{y:+7.1f}) want={kind:5s} got={px}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    FULL = [
        ("face center", 0, 0, "mark"),
        ("face top", 0, -V + 5, "mark"),
        ("left flange mid", -W + 20, V + 20, "mark"),
        ("right flange mid", W - 20, V + 20, "mark"),
        ("rib gap (below B)", 0, V + 22, "gap"),
        ("below mark", 0, 2.5 * V + 12, "gap"),
    ]
    EMPTY = [
        ("face center", 0, 0, "gap"),
        ("face edge R", W, 0, "gap"),
        ("left flange mid", -W + 20, V + 20, "gap"),
        ("rib gap", 0, V + 22, "gap"),
    ]
    DRAW = [
        ("face vertex R inked", W, 0, "mark"),
        ("face vertex T inked", 0, -V, "mark"),
        ("face interior clean", 0, -4, "gap"),
        ("left flange untouched", -W + 20, V + 20, "gap"),
        ("right flange untouched", W - 20, V + 20, "gap"),
        ("pen dot near B", 5.7, 23.2, "white-any"),
    ]
    LAP = [
        ("mark full", 0, 0, "mark"),
        ("flangeL fill", -W + 20, V + 20, "mark"),
        ("pen dot at D1 corner", -68.7, 39.7, "white-any"),
    ]
    poses = {"full": FULL, "empty": EMPTY, "draw": DRAW, "lap": LAP}
    main(sys.argv[2], poses[sys.argv[1]])
