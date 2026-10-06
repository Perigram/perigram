#!/usr/bin/env python3
"""Generates scene.rml for the Perigram mark animation.

Single source of truth for the mark's geometry and fold motion. Run from the
project root (assets/rive/perigram-mark):

    python3 tools/generate_scene.py

Writes scene.rml next to rive.yaml and preview SVGs under build/previews/.

Geometry is reconstructed from public/icon.svg in rhombus-local coordinates
(origin = rhombus center, y down). One metric drives everything: the edge
length e. Face is a 60-degree rhombus (L, T, R, B); each flange is the
parallelogram hanging under a lower face edge; the V-shaped negative space
between the flanges is the rib.

The fold: a flange rotates about the face's lower edge as a virtual hinge —
the exact isometric projection of a 3D rotation about that edge. Per-vertex
3D offsets (a, y, z) against the hinge axis, projected through
P(X) = (0.866, 0.5), P(Y) = (-0.866, 0.5), P(Z) = (0, -1):
at fold angle theta (0 = logo pose, 90 degrees = flange standing against
the face edge):
    p(theta) = base + a*P(X) + (y*cos - z*sin)*P(Y) + (y*sin + z*cos)*P(Z)
Keyframes are placed at equal theta steps on frames distributed by an ease
curve, so linear keyframe interpolation follows the eased projected arc.
"""

import math
import os

E = 52.9147                     # edge length
W = E * math.sqrt(3) / 2        # half horizontal diagonal
V = E / 2                       # half vertical diagonal (= fold depth)
M = W / 2                       # flange inner step

CX, CY = 100.0, 100.0           # artboard center

PX = (math.sqrt(3) / 2, 0.5)    # P(X-hat)
PY = (-math.sqrt(3) / 2, 0.5)   # P(Y-hat)
PZ = (0.0, -1.0)                # P(Z-hat)

# Face rhombus, clockwise (screen y is down): L, T, R, B
FACE = [(-W, 0.0), (0.0, -V), (W, 0.0), (0.0, V)]

# Left flange rest pose, clockwise: A, Bf, C1, D1
FLANGE = [(-W, V), (0.0, 2 * V), (-M, 2.5 * V), (-(W + M), 1.5 * V)]

# Left flange 3D params (a, y, z) against the hinge through L along P(X)
FLANGE_3D = [(0.0, 0.0, -V), (2 * V, 0.0, -V), (2 * V, V, -V), (0.0, V, -V)]

GRAD_START = (-68.0, -74.3)     # brand gradient, mark-global direction
GRAD_END = (68.7, 18.8)
RED, ORANGE = "FFFF0000", "FFFF6600"


def fold(theta_deg):
    """Left-flange vertex positions (rhombus-local) at fold angle theta."""
    t = math.radians(theta_deg)
    y_p = [y * math.cos(t) - z * math.sin(t) for _, y, z in FLANGE_3D]
    z_p = [y * math.sin(t) + z * math.cos(t) for _, y, z in FLANGE_3D]
    pts = []
    for (a, _, _), yp, zp in zip(FLANGE_3D, y_p, z_p):
        x = a * PX[0] + yp * PY[0] + zp * PZ[0]
        y = a * PX[1] + yp * PY[1] + zp * PZ[1]
        pts.append((-W + x, y))          # base vertex is L = (-W, 0)
    return pts


def fold_right(theta_deg):
    return [(-x, y) for x, y in fold(theta_deg)]


# --- eases -------------------------------------------------------------------

def ease_in_out_cubic(t):
    return 4 * t ** 3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def ease_out_cubic(t):
    return 1 - (1 - t) ** 3


def ease_in_cubic(t):
    return t ** 3


def ease_in_out_sine(t):
    return -(math.cos(math.pi * t) - 1) / 2


# --- keyframe tracks ---------------------------------------------------------

class Track:
    """Vertex x/y keyframes for one animation: {vertex_id: [(frame, x, y)]}."""

    def __init__(self):
        self.points = {}

    def pose(self, frame, theta_deg):
        left = fold(theta_deg)
        right = fold_right(theta_deg)
        for vids, pts in ((LEFT_VERTEX_IDS, left), (RIGHT_VERTEX_IDS, right)):
            for vid, (x, y) in zip(vids, pts):
                self.points.setdefault(vid, []).append((frame, x, y))

    def sweep(self, f0, f1, t0, t1, ease, steps):
        for i in range(steps + 1):
            t = i / steps
            self.pose(f0 + round(ease(t) * (f1 - f0)), t0 + (t1 - t0) * t)


LEFT_VERTEX_IDS = ["0:51", "0:52", "0:53", "0:54"]
RIGHT_VERTEX_IDS = ["0:61", "0:62", "0:63", "0:64"]


def track_load():
    tr = Track()
    tr.pose(0, 0)
    tr.sweep(12, 34, 0, 90, ease_in_out_cubic, 8)      # fold shut
    tr.sweep(44, 78, 90, -12, ease_out_cubic, 10)      # swing out, overshoot
    tr.sweep(78, 88, -12, 0, ease_in_out_cubic, 4)     # settle
    return tr, 96, "loop"


def track_unfold():
    tr = Track()
    tr.pose(0, 90)
    tr.sweep(0, 26, 90, -12, ease_out_cubic, 10)
    tr.sweep(26, 36, -12, 0, ease_in_out_cubic, 4)
    return tr, 36, "oneShot"


def track_idle():
    tr = Track()
    tr.pose(0, 0)
    tr.sweep(0, 120, 0, 8, ease_in_out_sine, 6)        # slow breathe
    tr.sweep(120, 240, 8, 0, ease_in_out_sine, 6)
    return tr, 240, "loop"


def track_fold():
    tr = Track()
    tr.pose(0, 0)
    tr.sweep(0, 30, 0, 90, ease_in_cubic, 8)
    return tr, 30, "oneShot"


# --- RML emission ------------------------------------------------------------

def shape_rml(name, sid, path_id, fill_id, pts, clockwise, vertex_ids=None):
    verts = []
    for (x, y), vid in zip(pts, vertex_ids or [None] * len(pts)):
        vid_attr = f' id="{vid}"' if vid else ""
        verts.append(f'<StraightVertex x="{x:.2f}" y="{y:.2f}"{vid_attr}/>')
    return f'''<Shape x="{CX}" y="{CY}" name="{name}" id="{sid}">
            <PointsPath isClockwise="{"true" if clockwise else "false"}" name="{name}Path" id="{path_id}">
                {"".join(verts)}
            </PointsPath>
            <Fill name="{name}Fill" id="{fill_id}">
                <LinearGradient startX="{GRAD_START[0]}" startY="{GRAD_START[1]}" endX="{GRAD_END[0]}" endY="{GRAD_END[1]}" name="Brand">
                    <GradientStop colorValue="{RED}" position="0"/>
                    <GradientStop colorValue="{ORANGE}" position="1"/>
                </LinearGradient>
            </Fill>
        </Shape>'''


def animation_rml(name, aid, track, duration, loop):
    parts = []
    for vid in LEFT_VERTEX_IDS + RIGHT_VERTEX_IDS:
        kx, ky = [], []
        for frame, x, y in track.points[vid]:
            kx.append(f'<KeyFrameDouble value="{x:.2f}" frame="{frame}" interpolationType="linear"/>')
            ky.append(f'<KeyFrameDouble value="{y:.2f}" frame="{frame}" interpolationType="linear"/>')
        parts.append(f'''<KeyedObject objectId="{vid}">
                <KeyedProperty propertyKey="24">{''.join(kx)}</KeyedProperty>
                <KeyedProperty propertyKey="25">{''.join(ky)}</KeyedProperty>
            </KeyedObject>''')
    return f'''<LinearAnimation loopValue="{loop}" duration="{duration}" name="{name}" id="{aid}">
            {"".join(parts)}
        </LinearAnimation>'''


def build_rml():
    animations = []
    for name, aid, builder in (("load", "0:40", track_load),
                               ("unfold", "0:41", track_unfold),
                               ("idle", "0:42", track_idle),
                               ("fold", "0:43", track_fold)):
        tr, dur, loop = builder()
        animations.append(animation_rml(name, aid, tr, dur, loop))

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

        {shape_rml("Face", "0:10", "0:11", "0:12", FACE, True)}

        {shape_rml("FlangeL", "0:15", "0:16", "0:17", FLANGE, True, LEFT_VERTEX_IDS)}

        {shape_rml("FlangeR", "0:20", "0:21", "0:22",
                   [(-x, y) for x, y in FLANGE], False, RIGHT_VERTEX_IDS)}

        {"".join(animations)}
    </Artboard>
</Rive>
'''


# --- preview SVGs ------------------------------------------------------------

def preview_svg(thetas, out):
    def poly(pts, fill):
        p = " ".join(f"{CX + x:.1f},{CY + y:.1f}" for x, y in pts)
        return f'<polygon points="{p}" fill="{fill}"/>'

    shapes = [poly(FACE, "#e0e0e0")]
    for th in thetas:
        shapes.append(poly(fold(th), "#808080"))
        shapes.append(poly(fold_right(th), "#808080"))
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
    for label, thetas in (("rest", [0]), ("mid", [45]), ("shut", [90]),
                          ("overshoot", [-12])):
        preview_svg(thetas, os.path.join(prev, f"{label}.svg"))
    print("wrote scene.rml and build/previews/*.svg")


if __name__ == "__main__":
    main()
