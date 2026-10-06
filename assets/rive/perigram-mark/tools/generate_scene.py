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

Motion is a pen plotter: a bright pen dot runs each contour at constant
speed, the outline traces behind it (TrimPath on the stroke), the fill
floods the panel right after its contour closes, the outline ink dissolves
into the fill, and the dot does one fast inspection lap over the finished
mark before the line slurps back for the next part. All speeds are exact:
trim and dot keyframes sit only on contour vertices, where linear
interpolation equals constant pen speed along the edges.
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
INK, PEN = "FFFF3300", "FFFFFFFF"
INK_W, COMET_W = 3.0, 3.5       # stroke thicknesses when visible

# Each panel is two shapes sharing one geometry: a fill shape (flood keyed
# as shape opacity) and an ink shape carrying the trace and comet strokes
# (dissolve keyed as shape opacity, lap visible purely through its trim
# window). One visibility mechanism everywhere, and gradients are only
# ever keyed as absolute endpoints: a zero-length gradient (relative
# deltas from 0) degenerates and kills the @rive-app/canvas
# state-machine player, while the direct-animation path tolerates it.
PANELS = [
    {"name": "Face", "shape": "0:10", "path": "0:11", "fill": "0:12",
     "grad": "0:13", "inkshape": "0:80", "inkpath": "0:83",
     "ink": "0:50", "inkcol": "0:51", "inkt": "0:52", "verts": FACE},
    {"name": "FlangeL", "shape": "0:15", "path": "0:16", "fill": "0:17",
     "grad": "0:18", "inkshape": "0:81", "inkpath": "0:84",
     "ink": "0:53", "inkcol": "0:54", "inkt": "0:55", "verts": FLANGE},
    {"name": "FlangeR", "shape": "0:20", "path": "0:21", "fill": "0:22",
     "grad": "0:23", "inkshape": "0:82", "inkpath": "0:85",
     "ink": "0:56", "inkcol": "0:57", "inkt": "0:58",
     "verts": [(-x, y) for x, y in FLANGE]},
]
PEN_SHAPE = "0:70"
GRAD_IDS = [p["grad"] for p in PANELS]


def contour(verts):
    """(fractions, points) of the closed contour, per cumulative length."""
    pts = list(verts) + [verts[0]]
    seg = [math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts, pts[1:])]
    total = sum(seg)
    fracs, cum = [0.0], 0.0
    for s in seg:
        cum += s
        fracs.append(cum / total)
    return fracs, pts


CONTOURS = [contour(p["verts"]) for p in PANELS]


def point_at(i, frac):
    """Artboard-space point at arc fraction of panel i's contour."""
    fracs, pts = CONTOURS[i]
    for k in range(len(fracs) - 1):
        if fracs[k + 1] >= frac:
            t = (frac - fracs[k]) / (fracs[k + 1] - fracs[k])
            a, b = pts[k], pts[k + 1]
            return (CX + a[0] + (b[0] - a[0]) * t, CY + a[1] + (b[1] - a[1]) * t)
    return (CX + pts[-1][0], CY + pts[-1][1])


# --- keyframe channels -------------------------------------------------------
# channels[(object_id, prop_key)] -> [(frame, value)] ; prop 37 is a color.

# Visibility is keyed as stroke thickness and gradient opacity, never as
# color alpha: the web runtime's state-machine player rejects KeyFrameColor
# timelines (verified by bisection against @rive-app/canvas), while the
# direct animation path tolerates them. One mechanism everywhere.

def setk(ch, obj, key, frame, value):
    lst = ch.setdefault((obj, key), [])
    if lst and lst[-1][0] == frame:
        lst[-1] = (frame, value)
    else:
        lst.append((frame, value))


def sweep(ch, obj, key, f0, f1, v0, v1, ease=lambda t: t, steps=3):
    for i in range(steps + 1):
        t = i / steps
        setk(ch, obj, key, f0 + round(ease(t) * (f1 - f0)), v0 + (v1 - v0) * t)


def ease_in_out_sine(t):
    return -(math.cos(math.pi * t) - 1) / 2


def blink(ch, obj, prop, w, f_on, f_off):
    """Paint fully on through [f_on, f_off], off after (thickness/opacity)."""
    setk(ch, obj, prop, f_on, w)
    setk(ch, obj, prop, f_off, w)
    setk(ch, obj, prop, f_off + 1, 0.0)


def trace(ch, i, f0, dur, dot=True):
    """Panel i: pen runs the contour, trim follows, ink visible."""
    p, fracs = PANELS[i], CONTOURS[i][0]
    setk(ch, p["inkshape"], 18, f0, 1.0)
    setk(ch, p["inkt"], 115, f0, 0.0)
    for frac in fracs:
        f = f0 + round(frac * dur)
        setk(ch, p["inkt"], 115, f, frac)
        if dot:
            x, y = point_at(i, frac)
            setk(ch, PEN_SHAPE, 13, f, x)
            setk(ch, PEN_SHAPE, 14, f, y)


def flood(ch, i, f0, f1):
    sweep(ch, PANELS[i]["shape"], 18, f0, f1, 0.0, 1.0)


def dissolve(ch, i, f0, f1):
    """Ink dries: the ink shape fades into the flooded fill."""
    setk(ch, PANELS[i]["inkshape"], 18, f0, 1.0)
    setk(ch, PANELS[i]["inkshape"], 18, f1, 0.0)


def inspect_lap(ch, i, f0, dur):
    """Pen dot runs panel i's contour once more, fast: the inspection pass."""
    fracs = CONTOURS[i][0]
    for frac in fracs:
        f = f0 + round(frac * dur)
        x, y = point_at(i, frac)
        setk(ch, PEN_SHAPE, 13, f, x)
        setk(ch, PEN_SHAPE, 14, f, y)


def retract(ch, i, f0, dur):
    """Trim end slurps the contour back to nothing."""
    p, fracs = PANELS[i], CONTOURS[i][0]
    setk(ch, p["inkshape"], 18, f0, 1.0)
    setk(ch, p["inkt"], 115, f0, 1.0)
    for frac in reversed(fracs):
        setk(ch, p["inkt"], 115, f0 + dur - round(frac * dur), frac)


def empty(ch, frame):
    for p in PANELS:
        setk(ch, p["shape"], 18, frame, 0.0)
        setk(ch, p["inkshape"], 18, frame, 0.0)
        setk(ch, p["inkt"], 115, frame, 0.0)
    setk(ch, PEN_SHAPE, 18, frame, 0.0)
    setk(ch, PEN_SHAPE, 13, frame, CX + PANELS[0]["verts"][0][0])
    setk(ch, PEN_SHAPE, 14, frame, CY + PANELS[0]["verts"][0][1])


# --- animation timelines -----------------------------------------------------

def draw_pass(ch, f0, dot_on=True):
    """Face -> left flange -> right flange; fills flood behind the pen."""
    for i, (off, dur) in enumerate(((0, 32), (36, 24), (64, 24))):
        f = f0 + off
        trace(ch, i, f, dur, dot=dot_on)
        flood(ch, i, f + dur - 6, f + dur + 4)
        dissolve(ch, i, f + dur - 2, f + dur + 8)
        if dot_on:
            blink(ch, PEN_SHAPE, 18, 1.0, f, f + dur)


def anim_load():
    ch = {}
    empty(ch, 0)
    draw_pass(ch, 6)                           # traced and flooded by f=98
    inspect_lap(ch, 0, 116, 12)
    inspect_lap(ch, 1, 129, 10)
    inspect_lap(ch, 2, 140, 10)
    blink(ch, PEN_SHAPE, 18, 1.0, 116, 150)
    for i, (f, dur) in enumerate(((168, 12), (165, 12), (162, 12))):
        setk(ch, PANELS[i]["inkshape"], 18, 160, 1.0)
        sweep(ch, PANELS[i]["shape"], 18, 160, 170, 1.0, 0.0)
        retract(ch, i, f, dur)
        setk(ch, PANELS[i]["inkshape"], 18, f + dur + 2, 0.0)
    empty(ch, 190)
    return ch, 190, "loop"


def anim_unfold():
    ch = {}
    empty(ch, 0)
    draw_pass(ch, 0)
    return ch, 100, "oneShot"


def anim_fold():
    ch = {}
    for i, (f, dur) in enumerate(((10, 12), (7, 12), (4, 12))):
        setk(ch, PANELS[i]["inkt"], 115, 0, 1.0)
        setk(ch, PANELS[i]["inkshape"], 18, 0, 1.0)
        sweep(ch, PANELS[i]["shape"], 18, 2, 10, 1.0, 0.0)
        retract(ch, i, f, dur)
        setk(ch, PANELS[i]["inkshape"], 18, f + dur + 2, 0.0)
    return ch, 30, "oneShot"


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
            sweep(ch, gid, key, 0, 120, base, base + d, ease_in_out_sine, 8)
            sweep(ch, gid, key, 120, 240, base + d, base, ease_in_out_sine, 8)
    return ch, 240, "loop"


# --- RML emission ------------------------------------------------------------

def fill_shape_rml(p):
    verts = "".join(f'<StraightVertex x="{x:.2f}" y="{y:.2f}"/>' for x, y in p["verts"])
    cw = "true" if p["name"] != "FlangeR" else "false"
    return f'''<Shape x="{CX}" y="{CY}" name="{p['name']}" id="{p['shape']}">
            <PointsPath isClockwise="{cw}" name="{p['name']}Path" id="{p['path']}">
                {verts}
            </PointsPath>
            <Fill name="{p['name']}Fill" id="{p['fill']}">
                <LinearGradient startX="{GRAD_START[0]}" startY="{GRAD_START[1]}" endX="{GRAD_END[0]}" endY="{GRAD_END[1]}" id="{p['grad']}" name="Brand">
                    <GradientStop colorValue="{RED}" position="0"/>
                    <GradientStop colorValue="{ORANGE}" position="1"/>
                </LinearGradient>
            </Fill>
        </Shape>'''


def ink_shape_rml(p):
    verts = "".join(f'<StraightVertex x="{x:.2f}" y="{y:.2f}"/>' for x, y in p["verts"])
    cw = "true" if p["name"] != "FlangeR" else "false"
    return f'''<Shape x="{CX}" y="{CY}" opacity="0" name="{p['name']}Ink" id="{p['inkshape']}">
            <PointsPath isClockwise="{cw}" name="{p['name']}InkPath" id="{p['inkpath']}">
                {verts}
            </PointsPath>
            <Stroke thickness="3" cap="round" join="round" name="{p['name']}Trace" id="{p['ink']}">
                <SolidColor colorValue="{INK}" id="{p['inkcol']}" name="Ink"/>
                <TrimPath start="0" end="0" id="{p['inkt']}" name="Trace"/>
            </Stroke>
        </Shape>'''


def animation_rml(name, aid, ch, duration, loop):
    objs = {}
    for (obj, key), pts in ch.items():
        objs.setdefault(obj, []).append((key, pts))
    parts = []
    for obj, props in objs.items():
        props_xml = []
        for key, pts in props:
            frames = "".join(
                f'<KeyFrameDouble value="{v:.3f}" frame="{f}" interpolationType="linear"/>'
                for f, v in pts)
            props_xml.append(f'<KeyedProperty propertyKey="{key}">{frames}</KeyedProperty>')
        parts.append(f'<KeyedObject objectId="{obj}">{"".join(props_xml)}</KeyedObject>')
    return f'''<LinearAnimation loopValue="{loop}" duration="{duration}" name="{name}" id="{aid}">
            {"".join(parts)}
        </LinearAnimation>'''


def build_rml():
    animations = []
    for name, aid, builder in (("load", "0:40", anim_load),
                               ("unfold", "0:41", anim_unfold),
                               ("idle", "0:42", anim_idle),
                               ("fold", "0:43", anim_fold)):
        ch, dur, loop = builder()
        animations.append(animation_rml(name, aid, ch, dur, loop))

    fills = [fill_shape_rml(p) for p in PANELS]
    inks = [ink_shape_rml(p) for p in PANELS]
    pen = f'''<Shape x="{CX + FACE[0][0]}" y="{CY + FACE[0][1]}" opacity="0" name="Pen" id="{PEN_SHAPE}">
            <Ellipse width="7" height="7" originX="0.5" originY="0.5" name="PenPath" id="0:71"/>
            <Fill name="PenFill" id="0:72"><SolidColor colorValue="{PEN}" id="0:73" name="PenColor"/></Fill>
        </Shape>'''

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

        {fills[0]}

        {fills[1]}

        {fills[2]}

        {inks[0]}

        {inks[1]}

        {inks[2]}

        {pen}

        {"".join(animations)}
    </Artboard>
</Rive>
'''


# --- preview SVGs ------------------------------------------------------------

def preview_svg(out, lineart=False):
    def poly(pts):
        p = " ".join(f"{CX + x:.1f},{CY + y:.1f}" for x, y in pts)
        return p

    style = ('fill="none" stroke="#ff3300" stroke-width="3" stroke-linejoin="round"'
             if lineart else 'fill="#ff4a1a"')
    shapes = [f'<polygon points="{poly(p["verts"])}" {style}/>' for p in PANELS]
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
    preview_svg(os.path.join(prev, "full.svg"))
    preview_svg(os.path.join(prev, "lineart.svg"), lineart=True)
    print("wrote scene.rml and build/previews/*.svg")


if __name__ == "__main__":
    main()
