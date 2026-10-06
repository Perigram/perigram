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

Motion is an exploded axonometric breathe: nothing rotates, the three rigid
panels slide along their own isometric axes (face floats up along its
normal, flanges drop and splay down-out), so the rib opens and closes like
a fabrication exploded view. All timelines key only panel translations
(x/y), the shared brand gradient's endpoints (a light drift across the
static folds), and panel opacity for the exit. Keyframes sit at equal
amplitude steps on frames distributed by an ease curve, so linear keyframe
interpolation follows the eased path.
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

# Explode axis per panel (rhombus-local screen space), full amplitude 1.0.
FACE_ID, FLANGE_L_ID, FLANGE_R_ID = "0:10", "0:15", "0:20"
FACE_GRAD_ID, FL_L_GRAD_ID, FL_R_GRAD_ID = "0:13", "0:18", "0:23"
PANEL_VECS = {
    FACE_ID: (0.0, -14.0),
    FLANGE_L_ID: (-0.866 * 24, 12.0),
    FLANGE_R_ID: (0.866 * 24, 12.0),
}
GRAD_IDS = [FACE_GRAD_ID, FL_L_GRAD_ID, FL_R_GRAD_ID]

# idle light drift: translates the whole gradient along its own axis
_gx, _gy = GRAD_END[0] - GRAD_START[0], GRAD_END[1] - GRAD_START[1]
_glen = math.hypot(_gx, _gy)
LIGHT_DRIFT = (_gx / _glen * 20.0, _gy / _glen * 20.0)


# --- eases -------------------------------------------------------------------

def ease_in_out_cubic(t):
    return 4 * t ** 3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def ease_out_cubic(t):
    return 1 - (1 - t) ** 3


def ease_in_cubic(t):
    return t ** 3


def ease_in_out_sine(t):
    return -(math.cos(math.pi * t) - 1) / 2


# --- translation tracks ------------------------------------------------------

class MoveTrack:
    """Panel x/y keyframes: {shape_id: [(frame, dx, dy)]}."""

    def __init__(self):
        self.points = {sid: [] for sid in PANEL_VECS}

    def pose(self, frame, amp, lags=None):
        targets = lags if lags else PANEL_VECS
        for sid in targets:
            f = frame + lags.get(sid, 0) if lags else frame
            vec = PANEL_VECS[sid]
            entry = (f, vec[0] * amp, vec[1] * amp)
            pts = self.points[sid]
            if pts and pts[-1][0] == f:
                pts[-1] = entry
            else:
                pts.append(entry)

    def sweep(self, f0, f1, a0, a1, ease, steps, lags=None):
        for i in range(steps + 1):
            t = i / steps
            self.pose(f0 + round(ease(t) * (f1 - f0)), a0 + (a1 - a0) * t, lags)


def move_load():
    """Locked -> staggered explode -> hold -> re-lock with rib click."""
    tr = MoveTrack()
    tr.pose(0, 0)
    # explode: flanges lead, face follows; slight overshoot then settle
    for sid, lag in ((FLANGE_L_ID, 0), (FLANGE_R_ID, 3), (FACE_ID, 8)):
        tr.sweep(12, 44, 0, 1.1, ease_in_out_cubic, 8, {sid: lag})
        tr.sweep(44, 52, 1.1, 1.0, ease_out_cubic, 3, {sid: lag})
    # re-lock: face leads home, flanges follow, tiny tuck past locked
    for sid, lag in ((FACE_ID, 0), (FLANGE_L_ID, 6), (FLANGE_R_ID, 9)):
        tr.sweep(70, 100, 1.0, -0.07, ease_in_out_cubic, 8, {sid: lag})
        tr.sweep(100, 110, -0.07, 0.0, ease_out_cubic, 3, {sid: lag})
    return tr, 120, "loop"


def move_unfold():
    """Mount: exploded -> staggered fly-in -> lock with rib click."""
    tr = MoveTrack()
    tr.pose(0, 1.0)
    for sid, lag in ((FLANGE_L_ID, 0), (FLANGE_R_ID, 2), (FACE_ID, 6)):
        tr.sweep(0, 26, 1.0, -0.07, ease_in_out_cubic, 8, {sid: lag})
        tr.sweep(26, 32, -0.07, 0.0, ease_out_cubic, 3, {sid: lag})
    return tr, 40, "oneShot"


def move_fold():
    """Unmount: disperse along the axes and fade."""
    tr = MoveTrack()
    tr.pose(0, 0)
    for sid in PANEL_VECS:
        tr.sweep(0, 26, 0, 1.0, ease_in_cubic, 6, {sid: 0})
    return tr, 30, "oneShot"


def move_idle():
    """Idle is a light drift, not a translation; panels stay locked."""
    return None, 240, "loop"


# --- gradient / opacity tracks ----------------------------------------------

def grad_idle():
    """Light drift keyframes for the three gradients (out-and-back)."""
    frames = []
    for f0, f1, d0, d1 in ((0, 120, 0.0, 1.0), (120, 240, 1.0, 0.0)):
        for i in range(9):
            t = i / 8
            frames.append((f0 + round(ease_in_out_sine(t) * (f1 - f0)),
                           d0 + (d1 - d0) * t))
    return frames


def opacity_fold():
    return [(0, 1.0), (12, 1.0), (30, 0.0)]


# --- RML emission ------------------------------------------------------------

def shape_rml(name, sid, path_id, fill_id, grad_id, pts, clockwise):
    verts = "".join(f'<StraightVertex x="{x:.2f}" y="{y:.2f}"/>' for x, y in pts)
    return f'''<Shape x="{CX}" y="{CY}" name="{name}" id="{sid}">
            <PointsPath isClockwise="{"true" if clockwise else "false"}" name="{name}Path" id="{path_id}">
                {verts}
            </PointsPath>
            <Fill name="{name}Fill" id="{fill_id}">
                <LinearGradient startX="{GRAD_START[0]}" startY="{GRAD_START[1]}" endX="{GRAD_END[0]}" endY="{GRAD_END[1]}" id="{grad_id}" name="Brand">
                    <GradientStop colorValue="{RED}" position="0"/>
                    <GradientStop colorValue="{ORANGE}" position="1"/>
                </LinearGradient>
            </Fill>
        </Shape>'''


def keyframe_doubles(values, offset):
    return "".join(
        f'<KeyFrameDouble value="{v + offset:.2f}" frame="{f}" interpolationType="linear"/>'
        for f, v in values)


def animation_rml(name, aid, move=None, grad_frames=None, opacity_frames=None,
                  duration=60, loop="oneShot"):
    parts = []
    if move:
        for sid, pts in move.points.items():
            dx = [(f, v) for f, v, _ in pts]
            dy = [(f, v) for f, _, v in pts]
            parts.append(f'''<KeyedObject objectId="{sid}">
                <KeyedProperty propertyKey="13">{keyframe_doubles(dx, CX)}</KeyedProperty>
                <KeyedProperty propertyKey="14">{keyframe_doubles(dy, CY)}</KeyedProperty>
            </KeyedObject>''')
    if grad_frames:
        dx = [(f, LIGHT_DRIFT[0] * d) for f, d in grad_frames]
        dy = [(f, LIGHT_DRIFT[1] * d) for f, d in grad_frames]
        for gid in GRAD_IDS:
            parts.append(f'''<KeyedObject objectId="{gid}">
                <KeyedProperty propertyKey="42">{keyframe_doubles(dx, GRAD_START[0])}</KeyedProperty>
                <KeyedProperty propertyKey="33">{keyframe_doubles(dy, GRAD_START[1])}</KeyedProperty>
                <KeyedProperty propertyKey="34">{keyframe_doubles(dx, GRAD_END[0])}</KeyedProperty>
                <KeyedProperty propertyKey="35">{keyframe_doubles(dy, GRAD_END[1])}</KeyedProperty>
            </KeyedObject>''')
    if opacity_frames:
        for sid in PANEL_VECS:
            parts.append(f'''<KeyedObject objectId="{sid}">
                <KeyedProperty propertyKey="18">{keyframe_doubles(opacity_frames, 0)}</KeyedProperty>
            </KeyedObject>''')
    return f'''<LinearAnimation loopValue="{loop}" duration="{duration}" name="{name}" id="{aid}">
            {"".join(parts)}
        </LinearAnimation>'''


def build_rml():
    animations = [
        animation_rml("load", "0:40", move=move_load()[0],
                      duration=move_load()[1], loop=move_load()[2]),
        animation_rml("unfold", "0:41", move=move_unfold()[0],
                      duration=move_unfold()[1], loop=move_unfold()[2]),
        animation_rml("idle", "0:42", grad_frames=grad_idle(),
                      duration=move_idle()[1], loop=move_idle()[2]),
        animation_rml("fold", "0:43", move=move_fold()[0],
                      opacity_frames=opacity_fold(),
                      duration=move_fold()[1], loop=move_fold()[2]),
    ]

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

        {shape_rml("Face", "0:10", "0:11", "0:12", "0:13", FACE, True)}

        {shape_rml("FlangeL", "0:15", "0:16", "0:17", "0:18", FLANGE, True)}

        {shape_rml("FlangeR", "0:20", "0:21", "0:22", "0:23",
                   [(-x, y) for x, y in FLANGE], False)}

        {"".join(animations)}
    </Artboard>
</Rive>
'''


# --- preview SVGs ------------------------------------------------------------

def preview_svg(amp, out):
    def poly(pts, off, fill):
        p = " ".join(f"{CX + x + off[0]:.1f},{CY + y + off[1]:.1f}" for x, y in pts)
        return f'<polygon points="{p}" fill="{fill}"/>'

    shapes = [
        poly(FACE, (PANEL_VECS[FACE_ID][0] * amp, PANEL_VECS[FACE_ID][1] * amp), "#e0e0e0"),
        poly(FLANGE, (PANEL_VECS[FLANGE_L_ID][0] * amp, PANEL_VECS[FLANGE_L_ID][1] * amp), "#808080"),
        poly([(-x, y) for x, y in FLANGE],
             (PANEL_VECS[FLANGE_R_ID][0] * amp, PANEL_VECS[FLANGE_R_ID][1] * amp), "#808080"),
    ]
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
    for label, amp in (("locked", 0.0), ("half", 0.5), ("exploded", 1.0)):
        preview_svg(amp, os.path.join(prev, f"{label}.svg"))
    print("wrote scene.rml and build/previews/*.svg")


if __name__ == "__main__":
    main()
