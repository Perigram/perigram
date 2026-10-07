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

Motion is the cassette clamp: both flanges spring up behind the face by
exactly one fold depth, so the rib gap squeezes from a wide V to a tight V
(the overlap hides behind the face, which owns the top draw slot), then the
clamp springs back open. One rapid deformation, seamless loop, readable at
favicon size. Timelines key only shape translations, plus absolute
gradient endpoints for the idle light drift — keying gradient endpoints
relative to 0 degenerates the gradient and kills the @rive-app/canvas
state-machine player while the CLI and the direct-animation path tolerate
it (found by browser bisection; see README).
"""

import math
import os

E = 52.9147                     # edge length
W = E * math.sqrt(3) / 2        # half horizontal diagonal
V = E / 2                       # half vertical diagonal (= fold depth)
M = W / 2                       # flange inner step

CX, CY = 100.0, 100.0           # artboard center

# Face rhombus, clockwise (screen y is down): L, T, R, B
FACE = [(-W, 0.0), (0.0, -V), (W, 0.0), (0.0, V)]

# Left flange rest pose, clockwise: A, Bf, C1, D1; right is its x-mirror
FLANGE = [(-W, V), (0.0, 2 * V), (-M, 2.5 * V), (-(W + M), 1.5 * V)]

GRAD_START = (-68.0, -74.3)     # brand gradient, mark-global direction
GRAD_END = (68.7, 18.8)
RED, ORANGE = "FFFF0000", "FFFF6600"

# Clamp vectors (rhombus-local) at amplitude 1.0: flanges rise one fold
# depth behind the face; the face nods down in counter-motion.
FACE_ID, FLANGE_L_ID, FLANGE_R_ID = "0:10", "0:15", "0:20"
CLAMP = {
    FLANGE_L_ID: (0.0, -V),
    FLANGE_R_ID: (0.0, -V),
    FACE_ID: (0.0, 1.5),
}
GRAD_IDS = ["0:13", "0:18", "0:23"]


# --- eases -------------------------------------------------------------------

def ease_in_out_cubic(t):
    return 4 * t ** 3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def ease_out_back(t):
    c1, c3 = 1.70158, 2.70158
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2


def ease_in_out_sine(t):
    return -(math.cos(math.pi * t) - 1) / 2


# --- translation tracks ------------------------------------------------------

class MoveTrack:
    """Shape x/y keyframes: {shape_id: [(frame, dx, dy)]}."""

    def __init__(self):
        self.points = {sid: [] for sid in CLAMP}

    def pose(self, frame, amp):
        for sid, vec in CLAMP.items():
            entry = (frame, vec[0] * amp, vec[1] * amp)
            pts = self.points[sid]
            if pts and pts[-1][0] == frame:
                pts[-1] = entry
            else:
                pts.append(entry)

    def sweep(self, f0, f1, a0, a1, ease, steps):
        for i in range(steps + 1):
            t = i / steps
            self.pose(f0 + round(ease(t) * (f1 - f0)), a0 + (a1 - a0) * t)

    def channels(self):
        """Absolute shape x/y channels (props 13/14, artboard coords)."""
        ch = {}
        for sid, pts in self.points.items():
            ch[(sid, 13)] = [(f, CX + dx) for f, dx, _ in pts]
            ch[(sid, 14)] = [(f, CY + dy) for f, _, dy in pts]
        return ch


def anim_load():
    """Clamp and release, one rapid seamless cycle (54 frames)."""
    tr = MoveTrack()
    tr.pose(0, 0)
    tr.sweep(6, 18, 0, 1.06, ease_out_back, 8)          # snap shut, overshoot
    tr.sweep(18, 24, 1.06, 1.0, ease_in_out_cubic, 3)   # settle closed
    tr.sweep(32, 50, 1.0, -0.06, ease_in_out_cubic, 8)  # spring open
    tr.sweep(50, 54, -0.06, 0.0, ease_in_out_cubic, 3)  # settle open
    return tr, 54, "loop"


def anim_unfold():
    """Mount: the cassette opens — flanges drop from behind the face."""
    tr = MoveTrack()
    tr.pose(0, 1.0)
    tr.sweep(0, 20, 1.0, -0.06, ease_in_out_cubic, 8)
    tr.sweep(20, 28, -0.06, 0.0, ease_in_out_cubic, 3)
    return tr, 30, "oneShot"


def anim_fold():
    """Unmount: clamp shut and fade out."""
    tr = MoveTrack()
    tr.pose(0, 0)
    tr.sweep(0, 22, 0, 1.06, ease_out_back, 8)
    tr.sweep(22, 28, 1.06, 1.0, ease_in_out_cubic, 3)
    return tr, 30, "oneShot"


def anim_idle():
    """Light drift across the static folded panels.

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
            frames = []
            for f0, f1, d0, d1 in ((0, 120, 0.0, 1.0), (120, 240, 1.0, 0.0)):
                for i in range(9):
                    t = i / 8
                    f = f0 + round(ease_in_out_sine(t) * (f1 - f0))
                    v = d0 + (d1 - d0) * t
                    frames.append((f, base + v * d))
            ch[(gid, key)] = frames
    return ch, 240, "loop"


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


def animation_rml(name, aid, ch, duration, loop):
    """ch: {(object_id, prop_key): [(frame, value)]}, values absolute."""
    objs = {}
    for (obj, key), pts in ch.items():
        objs.setdefault(obj, []).append((key, pts))
    parts = []
    for obj, props in objs.items():
        props_xml = "".join(
            f'<KeyedProperty propertyKey="{key}">{kfd(pts, 0)}</KeyedProperty>'
            for key, pts in props)
        parts.append(f'<KeyedObject objectId="{obj}">{props_xml}</KeyedObject>')
    return f'''<LinearAnimation loopValue="{loop}" duration="{duration}" name="{name}" id="{aid}">
            {"".join(parts)}
        </LinearAnimation>'''


def kfd(values, offset):
    return "".join(
        f'<KeyFrameDouble value="{v + offset:.3f}" frame="{f}" interpolationType="linear"/>'
        for f, v in values)


def build_rml():
    builders = (("load", "0:40", anim_load), ("unfold", "0:41", anim_unfold),
                ("idle", "0:42", anim_idle), ("fold", "0:43", anim_fold))
    animations = []
    for name, aid, builder in builders:
        result = builder()
        if name == "idle":
            ch, dur, loop = result
        else:
            tr, dur, loop = result
            ch = tr.channels()
        animations.append(animation_rml(name, aid, ch, dur, loop))

    shapes = (
        shape_rml("Face", "0:10", "0:11", "0:12", "0:13", FACE, True),
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

def preview_svg(out, amp=0.0):
    def poly(pts, fill):
        p = " ".join(f"{CX + x:.1f},{CY + y:.1f}" for x, y in pts)
        return f'<polygon points="{p}" fill="{fill}"/>'

    shapes = [poly([(x, y + 1.5 * amp) for x, y in FACE], "#ff4a1a"),
              poly([(x, y - V * amp) for x, y in FLANGE], "#e63600"),
              poly([(-x, y - V * amp) for x, y in FLANGE], "#e63600")]
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
    for label, amp in (("open", 0.0), ("half", 0.5), ("clamped", 1.0)):
        preview_svg(os.path.join(prev, f"{label}.svg"), amp)
    print("wrote scene.rml and build/previews/*.svg")


if __name__ == "__main__":
    main()
