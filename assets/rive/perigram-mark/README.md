# CODE: Rive Mark Animation

Source project for the animated Perigram mark, built with the Rive CLI into
[`public/rive/perigram-mark.riv`](../../../public/rive/perigram-mark.riv) for
web embedding. Parent: [assets README](../../README.md).

The mark is the folded axonometric cassette from
[`public/icon.svg`](../../../public/icon.svg): the top rhombus is the face,
the two lower parallelograms are the flanges, and the V-shaped negative space
between them is the rib. The animation is the **walking fold**: the cassette
feeds itself. Each flange folds flat into a thin tape-arm along its top
edge, the arm rigidly rotates around the shared inner corner — passing
straight up over the face mid-sweep — and unfolds into the opposite slot.
Both flanges swap simultaneously, so the loop alternates between the whole
mark and the two tapes sweeping past each other across the face. There is
always a flange's worth of material on screen; the mark reads as material
perpetually fed through its own folds.

## Source of truth

`tools/generate_scene.py` owns the geometry and motion; `scene.rml` is its
output and is committed so the project builds without Python. One metric
drives everything — the edge length `e`; the face is a 60° rhombus
reconstructed as the 3D square with corners `(±e/2, ±e/2, 0)` projected
through `P(x,y,z) = (0.866(x−y), 0.5(x+y) − z)`, each flange hangs under a
lower face edge at exactly one fold depth (`e/2`), and `public/icon.svg` is
the reference for the shape.

Spin keyframes sit at equal angle steps on linearly distributed frames
(constant angular velocity for `load`; eased for mount/unmount), so linear
keyframe interpolation follows the circular arc to under 0.25%.

**Gradients are only ever keyed as absolute endpoints.** A zero-length
gradient (relative deltas from 0) degenerates and kills the
`@rive-app/canvas` state-machine player — the direct-animation path and the
Rive CLI tolerate it, so nothing local warns. This was found by bisection
against the browser runtime; `tools/check_frames.py` plus the demo page
exist to catch such runtime-only breaks.

## Animations

| Name | Kind | Duration | Use |
|---|---|---|---|
| `load` | loop | 1.2 s | Loader: whole mark, both tapes fold-sweep-unfold into each other's slots, repeat. |
| `unfold` | one-shot | 0.3 s | Sidebar mount: one simultaneous sweep lands both flanges. |
| `idle` | loop | 4 s | Sidebar idle: light drifts across the static panels; geometry at rest. |
| `fold` | one-shot | 0.23 s | Sidebar unmount: fold to tape and fade. |

The default state machine `Lifecycle` chains `unfold` → `idle` (exit-time
transition), so a mounted canvas sweeps its flanges in and rests under a
moving light with no driving code. The flanges are declared before the face
so the sweeping tape-arm paints over it; at rest the rib gap keeps them
from ever overlapping.

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
phases (`seated`, `flat`, `sweep`). The Rive CLI installs with
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
