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

In 3D the face is a true square lying in the isometric plane (corners at
(+/-e/2, +/-e/2, 0); screen = (0.866(x-y), 0.5(x+y) - z)). Motion is the
rotating core: the face square turns in its own plane about the isometric
normal. A square is 90-degree periodic, so the projected rhombus morphs
rhombus -> rectangle -> rhombus forever, and the projected vertical extent
never exceeds the rest rhombus (max half-height V at rest) — the spinning
face never touches the flanges or the rib gap. The flanges are the stator
frame, the face is the rotor; spinning reads as working, resting as idle.

Keyframes sit at equal angle steps on linearly distributed frames (constant
angular velocity for `load`; eased for the settle in and fling out), so
linear keyframe interpolation follows the circular arc to within
1 - cos(step/2) < 0.25%.

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

CX, CY = 100.0, 100.0           # artboard center

# Face rhombus, clockwise (screen y is down): L, T, R, B
FACE = [(-W, 0.0), (0.0, -V), (W, 0.0), (0.0, V)]

# Left flange rest pose, clockwise: A, Bf, C1, D1; right is its x-mirror
FLANGE = [(-W, V), (0.0, 2 * V), (-M, 2.5 * V), (-(W + M), 1.5 * V)]

GRAD_START = (-68.0, -74.3)     # brand gradient, mark-global direction
GRAD_END = (68.7, 18.8)
RED, ORANGE = "FFFF0000", "FFFF6600"

# Face corners in 3D (isometric plane, z = 0), same order as FACE.
FACE_3D = [(-E / 2, E / 2), (-E / 2, -E / 2), (E / 2, -E / 2), (E / 2, E / 2)]

# Animated face vertex ids (paths of the flanges carry no ids).
FACE_VERTS = ["0:51", "0:52", "0:53", "0:54"]
FACE_ID, FLANGE_L_ID, FLANGE_R_ID = "0:10", "0:15", "0:20"
GRAD_IDS = ["0:13", "0:18", "0:23"]

SPIN_STEP = 7.5                 # degrees between keyframes


def face_screen(phi_deg):
    """Face vertex screen positions (rhombus-local) at yaw phi."""
    phi = math.radians(phi_deg)
    pts = []
    for x, y in FACE_3D:
        xr = x * math.cos(phi) - y * math.sin(phi)
        yr = x * math.sin(phi) + y * math.cos(phi)
        pts.append((math.sqrt(3) / 2 * (xr - yr), 0.5 * (xr + yr)))
    return pts


# --- eases -------------------------------------------------------------------

def ease_in_out_cubic(t):
    return 4 * t ** 3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def ease_out_cubic(t):
    return 1 - (1 - t) ** 3


def ease_in_cubic(t):
    return t ** 3


def ease_in_out_sine(t):
    return -(math.cos(math.pi * t) - 1) / 2


# --- animation channels ------------------------------------------------------
# {(object_id, prop_key): [(frame, value)]}; props 24/25 are vertex x/y.

def spin_track(ch, f0, dur, phi0, phi1, ease=lambda t: t):
    steps = max(2, round(abs(phi1 - phi0) / SPIN_STEP))
    for i in range(steps + 1):
        t = i / steps
        f = f0 + round(ease(t) * dur)
        for vid, (x, y) in zip(FACE_VERTS, face_screen(phi0 + (phi1 - phi0) * t)):
            setk(ch, (vid, 24), f, x)
            setk(ch, (vid, 25), f, y)


def setk(ch, objkey, frame, value):
    lst = ch.setdefault(objkey, [])
    if lst and lst[-1][0] == frame:
        lst[-1] = (frame, value)
    else:
        lst.append((frame, value))


def anim_load():
    """Constant-velocity core rotation; square symmetry makes it seamless."""
    ch = {}
    spin_track(ch, 0, 96, 0.0, 360.0)
    return ch, 96, "loop"


def anim_unfold():
    """Mount: the rotor decelerates into alignment with a small overshoot."""
    ch = {}
    spin_track(ch, 0, 30, 135.0, -10.0, ease_out_cubic)
    spin_track(ch, 30, 10, -10.0, 0.0, ease_in_out_cubic)
    return ch, 40, "oneShot"


def anim_fold():
    """Unmount: the rotor flings out of alignment and fades."""
    ch = {}
    spin_track(ch, 0, 26, 0.0, 90.0, ease_in_cubic)
    for sid in (FACE_ID, FLANGE_L_ID, FLANGE_R_ID):
        setk(ch, (sid, 18), 8, 1.0)
        setk(ch, (sid, 18), 26, 0.0)
    return ch, 28, "oneShot"


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

    shapes = (
        shape_rml("Face", "0:10", "0:11", "0:12", "0:13", FACE, True,
                  FACE_VERTS),
        shape_rml("FlangeL", "0:15", "0:16", "0:17", "0:18", FLANGE, True),
        shape_rml("FlangeR", "0:20", "0:21", "0:22", "0:23",
                  [(-x, y) for x, y in FLANGE], False),
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

def preview_svg(out, phi):
    def poly(pts, fill):
        p = " ".join(f"{CX + x:.1f},{CY + y:.1f}" for x, y in pts)
        return f'<polygon points="{p}" fill="{fill}"/>'

    shapes = [poly(face_screen(phi), "#ff5a1e"),
              poly(FLANGE, "#e63600"),
              poly([(-x, y) for x, y in FLANGE], "#e63600")]
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
    for label, phi in (("phi0", 0.0), ("phi22", 22.5), ("phi45", 45.0),
                       ("phi67", 67.5)):
        preview_svg(os.path.join(prev, f"{label}.svg"), phi)
    print("wrote scene.rml and build/previews/*.svg")


if __name__ == "__main__":
    main()
