# CODE: Rive Mark Animation

Source project for the animated Perigram mark, built with the Rive CLI into
[`public/rive/perigram-mark.riv`](../../../public/rive/perigram-mark.riv) for
web embedding. Parent: [assets README](../../README.md).

The mark is the folded axonometric cassette from
[`public/icon.svg`](../../../public/icon.svg): the top rhombus is the face,
the two lower parallelograms are the flanges, and the V-shaped negative space
between them is the rib. The animation is a **pen plotter** — the language of
the fabrication domain the platform serves: a bright pen dot runs each
contour at constant speed, the outline traces behind it, the fill floods the
panel as its contour closes, the ink dissolves into the fill, the dot makes
one fast inspection lap over the finished mark, and the lines slurp back for
the next part. The loop reads as a part being produced over and over.

## Source of truth

`tools/generate_scene.py` owns the geometry and motion; `scene.rml` is its
output and is committed so the project builds without Python. One metric
drives everything — the edge length `e`; the face is a 60° rhombus, each
flange hangs under a lower face edge at exactly one fold depth (`e/2`), and
`public/icon.svg` is the reference for the shape.

Each panel is two shapes sharing one geometry: a fill shape (the brand
gradient, red `#FF0000` → orange `#FF6600`, one mark-global direction) and
an ink shape carrying the trace stroke. Panel visibility is keyed as shape
opacity — one mechanism everywhere. Trace and pen motion key only contour
vertices, where linear interpolation equals constant pen speed along the
edges.

**Gradients are only ever keyed as absolute endpoints.** A zero-length
gradient (relative deltas from 0) degenerates and kills the
`@rive-app/canvas` state-machine player — the direct-animation path and the
Rive CLI tolerate it, so nothing local warns. This was found by bisection
against the browser runtime; `tools/check_frames.py` plus the demo page
exist to catch such runtime-only breaks.

## Animations

| Name | Kind | Duration | Use |
|---|---|---|---|
| `load` | loop | 3.2 s | Loader: plot face → flanges → hold → inspection lap → retract. |
| `unfold` | one-shot | 1.7 s | Sidebar mount: the mark draws itself in. |
| `idle` | loop | 4 s | Sidebar idle: light drifts across the folded panels; geometry static. |
| `fold` | one-shot | 0.5 s | Sidebar unmount: outlines flash on, retract, fill fades. |

The default state machine `Lifecycle` chains `unfold` → `idle` (exit-time
transition), so a mounted canvas draws the mark in and holds it under a
moving light with no driving code.

## Build and validate

```bash
python3 tools/generate_scene.py     # regenerate scene.rml + preview SVGs
rive . --verify                     # compile check
rive inspect . --summary            # wiring problems
rive . --screenshot --advance=2s    # render one frame headless
rive . --once                       # write build/perigram-mark.riv
cp build/perigram-mark.riv ../../../public/rive/
```

`tools/check_frames.py` pixel-samples screenshots against the expected
phases (`empty`, `draw`, `full`, `lap`). The Rive CLI installs with
`curl -fsSL https://releases.rive.app/cli/install.sh | bash` — piped through
`bash`, not `sh`: the script uses bash-only `[[ ]]`, and under `sh` its
stream check fails open and it fetches a nonexistent `stable/manifest.json`.

## Web embedding

`embed-demo.html` (served from the repository root, e.g.
`python3 -m http.server`) shows both consumption modes with the
`@rive-app/canvas` runtime:

- Loader: `new rive.Rive({ src: '/rive/perigram-mark.riv', animations: ['load'], autoplay: true })`
- Sidebar: the same with `stateMachines: ['Lifecycle']` instead of
  `animations`; call `resizeDrawingSurfaceToCanvas()` on load.

The `.riv` is script-free, so an unsigned `--once` build embeds fine; the
signed `--publish` flow is only needed for files carrying Luau scripts.
