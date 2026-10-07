#!/usr/bin/env python3
"""Generates scene.rml for the Perigram mark animation.

Single source of truth for the mark's geometry and motion. Run from the
project root (assets/rive/perigram-mark):

    python3 tools/generate_scene.py

Writes scene.rml next to rive.yaml and preview SVGs under build/previews/.

Geometry is reconstructed from public/icon.svg in rhombus-local coordinates
(origin = rhombus center, y down). One metric drives everything: the edge
length e. Face is a 60-degree rhombus (L, T, R, B); each flange is the
parallelogram hanging under a lower face edge; the V-shaped negative space
between the flanges is the rib.

Motion is the walking fold: the cassette feeds itself. Each flange folds
flat into a thin tape-arm along its top edge, the arm sweep-glides through
the rib gap to the other side — the per-vertex glide is a pivot around the
shared inner corner, so the arm sweeps like a wiper and points straight
down mid-transit — and unfolds into the opposite slot. Both flanges swap
simultaneously, so the loop alternates: whole mark, two tapes sweeping
through the throat, whole mark. There is always a full flange's worth of
material visible; the mark never dissolves.

Gradient endpoints are only ever keyed absolute (base + delta): keying them
relative to 0 degenerates the gradient and kills the @rive-app/canvas
state-machine player while the CLI and the direct-animation path tolerate
it (found by browser bisection; see README).
"""

import math
import os

E = 52.9147                     # edge length
W = E * math.sqrt(3) / 2        # half horizontal diagonal
V = E / 2                       # half vertical diagonal
M = W / 2                       # flange inner step
FLAT = 0.12                     # tape-arm thickness as a depth fraction

CX, CY = 100.0, 100.0           # artboard center

# Face rhombus, clockwise (screen y is down): L, T, R, B
FACE = [(-W, 0.0), (0.0, -V), (W, 0.0), (0.0, V)]

# Left flange rest pose, clockwise: A, Bf, C1, D1; right is its x-mirror
FLANGE = [(-W, V), (0.0, 2 * V), (-M, 2.5 * V), (-(W + M), 1.5 * V)]

GRAD_START = (-68.0, -74.3)     # brand gradient, mark-global direction
GRAD_END = (68.7, 18.8)
RED, ORANGE = "FFFF0000", "FFFF6600"

# Animated flange vertex ids (A, Bf, C1, D1 order; face has none).
FL_VERTS = ["0:51", "0:52", "0:53", "0:54"]
FR_VERTS = ["0:61", "0:62", "0:63", "0:64"]
FACE_ID, FLANGE_L_ID, FLANGE_R_ID = "0:10", "0:15", "0:20"
GRAD_IDS = ["0:13", "0:18", "0:23"]


def mirror(pts):
    return [(-x, y) for x, y in pts]


def rot(pts, pivot, deg):
    """Rigid rotation of a pose around a pivot (screen coords, y down)."""
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    px, py = pivot
    return [(px + (x - px) * c - (y - py) * s,
             py + (x - px) * s + (y - py) * c) for x, y in pts]


def flat_pose(pts):
    """Collapse the flange onto its top edge (A-Bf), keeping FLAT depth."""
    a, bf, c1, d1 = pts
    return [a, bf,
            (bf[0] + FLAT * (c1[0] - bf[0]), bf[1] + FLAT * (c1[1] - bf[1])),
            (a[0] + FLAT * (d1[0] - a[0]), a[1] + FLAT * (d1[1] - a[1]))]


SEATED_L, SEATED_R = FLANGE, mirror(FLANGE)
FLAT_L, FLAT_R = flat_pose(SEATED_L), flat_pose(SEATED_R)
PIVOT = (0.0, 2 * V)          # shared inner corner both arms sweep around
SWEEP = 120.0                  # degrees; +60 is straight up (over the face)


# --- eases -------------------------------------------------------------------

def ease_in_out_cubic(t):
    return 4 * t ** 3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def ease_out_cubic(t):
    return 1 - (1 - t) ** 3


def ease_in_out_sine(t):
    return -(math.cos(math.pi * t) - 1) / 2


# --- keyframe channels -------------------------------------------------------
# {(vertex_id, prop_key): [(frame, value)]}; props 24/25 are vertex x/y.

def setk(ch, objkey, frame, value):
    lst = ch.setdefault(objkey, [])
    if lst and lst[-1][0] == frame:
        lst[-1] = (frame, value)
    else:
        lst.append((frame, value))


def morph(ch, verts, f0, dur, p0, p1, ease=ease_in_out_cubic, steps=4):
    """Vertex-morph one flange between two poses over dur frames."""
    for i in range(steps + 1):
        t = i / steps
        f = f0 + round(ease(t) * dur)
        for vid, (x0, y0), (x1, y1) in zip(verts, p0, p1):
            setk(ch, (vid, 24), f, x0 + (x1 - x0) * t)
            setk(ch, (vid, 25), f, y0 + (y1 - y0) * t)


def pose(ch, verts, frame, p):
    for vid, (x, y) in zip(verts, p):
        setk(ch, (vid, 24), frame, x)
        setk(ch, (vid, 25), frame, y)


def conveyor(ch, f0, left):
    """One seated -> sweep -> seated half of the walking-fold cycle.

    The flange folds flat into a tape-arm, the arm rigidly rotates around
    the shared inner corner (passing straight up over the face at +60
    degrees), then unfolds into the opposite slot.
    """
    fl = FL_VERTS if left else FR_VERTS
    seat0, flat0 = (SEATED_L, FLAT_L) if left else (SEATED_R, FLAT_R)
    seat1 = SEATED_R if left else SEATED_L
    pose(ch, fl, f0, seat0)
    morph(ch, fl, f0, 5, seat0, flat0)                        # fold to tape
    steps = 6
    for i in range(steps + 1):                          # rigid sweep
        t = i / steps
        f = f0 + 5 + (max(1, round(ease_in_out_cubic(t) * 8)) if i else 0)
        pose(ch, fl, f, rot(flat0, PIVOT, SWEEP * t if left else -SWEEP * t))
    end = rot(flat0, PIVOT, SWEEP if left else -SWEEP)
    morph(ch, fl, f0 + 13, 5, end, seat1, ease_out_cubic)     # unfold, seat


def anim_load():
    """Perpetual self-feeding: whole mark, both tapes sweep-swap, whole mark."""
    ch = {}
    conveyor(ch, 0, left=True)
    conveyor(ch, 0, left=False)
    conveyor(ch, 36, left=True)
    conveyor(ch, 36, left=False)
    return ch, 72, "loop"


def anim_unfold():
    """Mount: one simultaneous sweep lands both flanges in place."""
    ch = {}
    conveyor(ch, 0, left=True)
    conveyor(ch, 0, left=False)
    return ch, 18, "oneShot"


def anim_fold():
    """Unmount: fold to tape and fade."""
    ch = {}
    morph(ch, FL_VERTS, 0, 5, SEATED_L, FLAT_L)
    morph(ch, FR_VERTS, 0, 5, SEATED_R, FLAT_R)
    for sid in (FLANGE_L_ID, FLANGE_R_ID):
        setk(ch, (sid, 18), 5, 1.0)
        setk(ch, (sid, 18), 13, 0.0)
    return ch, 14, "oneShot"


def anim_idle():
    """Resting state: light drifts across the static folded panels.

    Endpoints are keyed absolute (base + delta): a zero-length gradient at
    frame 0 would degenerate and kill the web state-machine player.
    """
    gx, gy = GRAD_END[0] - GRAD_START[0], GRAD_END[1] - GRAD_START[1]
    glen = math.hypot(gx, gy)
    dx, dy = gx / glen * 20.0, gy / glen * 20.0
    ch = {}
    for gid in GRAD_IDS:
        for key, base, d in ((42, GRAD_START[0], dx), (33, GRAD_START[1], dy),
                             (34, GRAD_END[0], dx), (35, GRAD_END[1], dy)):
            for f0, f1, d0, d1 in ((0, 120, 0.0, 1.0), (120, 240, 1.0, 0.0)):
                for i in range(9):
                    t = i / 8
                    f = f0 + round(ease_in_out_sine(t) * (f1 - f0))
                    setk(ch, (gid, key), f, base + (d0 + (d1 - d0) * t) * d)
    return ch, 240, "loop"


# --- RML emission ------------------------------------------------------------

def shape_rml(name, sid, path_id, fill_id, grad_id, pts, clockwise,
              vertex_ids=None):
    verts = []
    for (x, y), vid in zip(pts, vertex_ids or [None] * len(pts)):
        vid_attr = f' id="{vid}"' if vid else ""
        verts.append(f'<StraightVertex x="{x:.2f}" y="{y:.2f}"{vid_attr}/>')
    return f'''<Shape x="{CX}" y="{CY}" name="{name}" id="{sid}">
            <PointsPath isClockwise="{"true" if clockwise else "false"}" name="{name}Path" id="{path_id}">
                {"".join(verts)}
            </PointsPath>
            <Fill name="{name}Fill" id="{fill_id}">
                <LinearGradient startX="{GRAD_START[0]}" startY="{GRAD_START[1]}" endX="{GRAD_END[0]}" endY="{GRAD_END[1]}" id="{grad_id}" name="Brand">
                    <GradientStop colorValue="{RED}" position="0"/>
                    <GradientStop colorValue="{ORANGE}" position="1"/>
                </LinearGradient>
            </Fill>
        </Shape>'''


def kfd(values, offset=0):
    return "".join(
        f'<KeyFrameDouble value="{v + offset:.3f}" frame="{f}" interpolationType="linear"/>'
        for f, v in values)


def animation_rml(name, aid, ch, duration, loop):
    objs = {}
    for (obj, key), pts in ch.items():
        objs.setdefault(obj, []).append((key, pts))
    parts = []
    for obj, props in objs.items():
        props_xml = "".join(
            f'<KeyedProperty propertyKey="{key}">{kfd(pts)}</KeyedProperty>'
            for key, pts in props)
        parts.append(f'<KeyedObject objectId="{obj}">{props_xml}</KeyedObject>')
    return f'''<LinearAnimation loopValue="{loop}" duration="{duration}" name="{name}" id="{aid}">
            {"".join(parts)}
        </LinearAnimation>'''


def build_rml():
    builders = (("load", "0:40", anim_load), ("unfold", "0:41", anim_unfold),
                ("idle", "0:42", anim_idle), ("fold", "0:43", anim_fold))
    animations = []
    for name, aid, builder in builders:
        ch, dur, loop = builder()
        animations.append(animation_rml(name, aid, ch, dur, loop))

    # Flanges declared first paint on top: the sweeping tape-arm
    shapes = (
    # must stay visible while it crosses the face. At rest the
    # flanges never overlap the face (the rib gap separates them).
        shape_rml("FlangeL", "0:15", "0:16", "0:17", "0:18", FLANGE, True,
                  FL_VERTS),
        shape_rml("FlangeR", "0:20", "0:21", "0:22", "0:23", mirror(FLANGE),
                  False, FR_VERTS),
        shape_rml("Face", "0:10", "0:11", "0:12", "0:13", FACE, True),
    )

    return f'''<Rive version="1" kind="fragment">
    <Artboard defaultStateMachineId="0:30" width="200" height="200" name="Mark" id="0:1">
        <StateMachine name="Lifecycle" id="0:30">
            <StateMachineLayer name="Layer" id="0:31">
                <AnyState x="0" y="0"/>
                <ExitState x="480" y="0"/>
                <EntryState x="-160" y="0">
                    <StateTransition stateToId="0:32"/>
                </EntryState>
                <AnimationState x="160" y="0" animationId="0:41" id="0:32">
                    <StateTransition stateToId="0:33" enableExitTime="true" exitTimeIsPercetange="true" exitTime="100"/>
                </AnimationState>
                <AnimationState x="320" y="0" animationId="0:42" id="0:33"/>
            </StateMachineLayer>
        </StateMachine>

        {shapes[0]}

        {shapes[1]}

        {shapes[2]}

        {"".join(animations)}
    </Artboard>
</Rive>
'''


# --- preview SVGs ------------------------------------------------------------

def preview_svg(out, mode):
    def poly(pts, fill):
        p = " ".join(f"{CX + x:.1f},{CY + y:.1f}" for x, y in pts)
        return f'<polygon points="{p}" fill="{fill}"/>'

    face = poly(FACE, "#ff5a1e")
    if mode == "seated":
        shapes = [face, poly(SEATED_L, "#e63600"), poly(SEATED_R, "#e63600")]
    elif mode == "flat":
        shapes = [face, poly(FLAT_L, "#e63600"), poly(FLAT_R, "#e63600")]
    else:  # mid-sweep: the arm stands vertical over the face
        mid = rot(FLAT_L, PIVOT, SWEEP / 2)
        shapes = [face, poly(mid, "#e63600")]
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" '
           f'viewBox="0 0 200 200"><rect width="200" height="200" fill="#101010"/>'
           f'{"".join(shapes)}</svg>')
    with open(out, "w") as f:
        f.write(svg)


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    with open(os.path.join(root, "scene.rml"), "w") as f:
        f.write(build_rml())
    prev = os.path.join(root, "build", "previews")
    os.makedirs(prev, exist_ok=True)
    for mode in ("seated", "flat", "mid"):
        preview_svg(os.path.join(prev, f"{mode}.svg"), mode)
    print("wrote scene.rml and build/previews/*.svg")


if __name__ == "__main__":
    main()
