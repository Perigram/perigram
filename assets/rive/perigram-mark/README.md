# CODE: Rive Mark Animation

Source project for the animated Perigram mark, built with the Rive CLI into
[`public/rive/perigram-mark.riv`](../../../public/rive/perigram-mark.riv) for
web embedding. Parent: [assets README](../../README.md).

The mark is the folded axonometric cassette from
[`public/icon.svg`](../../../public/icon.svg): the top rhombus is the face,
the two lower parallelograms are the flanges, and the V-shaped negative space
between them is the rib. The animation is the **cassette clamp**: both
flanges spring up behind the face by exactly one fold depth, so the rib
squeezes from a wide V to a tight V (the overlap hides behind the face,
which owns the top draw slot; the face nods 1.5 units in counter-motion),
then the clamp springs back open with a small overshoot. One rapid
deformation in a seamless ~0.9 s loop — readable at favicon size, and the
negative-space rib does the acting.

## Source of truth

`tools/generate_scene.py` owns the geometry and motion; `scene.rml` is its
output and is committed so the project builds without Python. One metric
drives everything — the edge length `e`; the face is a 60° rhombus, each
flange hangs under a lower face edge at exactly one fold depth (`e/2`), and
`public/icon.svg` is the reference for the shape.

Timelines key only shape translations, plus gradient endpoints for the idle
light drift. **Gradients are only ever keyed as absolute endpoints.** A
zero-length gradient (relative deltas from 0) degenerates and kills the
`@rive-app/canvas` state-machine player — the direct-animation path and the
Rive CLI tolerate it, so nothing local warns. This was found by bisection
against the browser runtime; `tools/check_frames.py` plus the demo page
exist to catch such runtime-only breaks.

## Animations

| Name | Kind | Duration | Use |
|---|---|---|---|
| `load` | loop | 0.9 s | Loader: clamp shut with overshoot, hold, spring open, settle. |
| `unfold` | one-shot | 0.5 s | Sidebar mount: the cassette opens — flanges drop from behind the face. |
| `idle` | loop | 4 s | Sidebar idle: light drifts across the folded panels; geometry static. |
| `fold` | one-shot | 0.5 s | Sidebar unmount: clamp shut. |

The default state machine `Lifecycle` chains `unfold` → `idle` (exit-time
transition), so a mounted canvas opens from the clamped pose and holds the
logo under a moving light with no driving code.

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
phases (`open` and `clamped`). The Rive CLI installs with
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
