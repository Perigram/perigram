# CODE: Rive Mark Animation

Source project for the animated Perigram mark, built with the Rive CLI into
[`public/rive/perigram-mark.riv`](../../../public/rive/perigram-mark.riv) for
web embedding. Parent: [assets README](../../README.md).

The mark is the folded axonometric cassette from
[`public/icon.svg`](../../../public/icon.svg): the top rhombus is the face,
the two lower parallelograms are the flanges, and the V-shaped negative space
between them is the rib. The animation keeps that identity and puts it in
motion as an **exploded axonometric breathe**: nothing rotates — the three
rigid panels slide apart along their own isometric axes (the face floats up
along its normal, the flanges drop and splay down-out), opening the rib like
a fabrication exploded view, then re-lock with a small tuck past the locked
pose so the rib clicks shut.

## Source of truth

`tools/generate_scene.py` owns the geometry and motion; `scene.rml` is its
output and is committed so the project builds without Python. One metric
drives everything — the edge length `e`; the face is a 60° rhombus, each
flange hangs under a lower face edge at exactly one fold depth (`e/2`), and
`public/icon.svg` is the reference for the shape.

Timelines key only panel translations, the shared brand gradient's endpoints
(a light drift across the static folds), and panel opacity for the exit.
Keyframes sit at equal amplitude steps on frames distributed by an ease
curve, so linear keyframe interpolation follows the eased path. Panel order
is staggered (flanges lead out, face leads home) for a mechanical but alive
feel.

## Animations

| Name | Kind | Duration | Use |
|---|---|---|---|
| `load` | loop | 2 s | Loader: locked → staggered explode → hold → re-lock with rib click. |
| `unfold` | one-shot | 0.67 s | Sidebar mount: exploded → staggered fly-in → lock. |
| `idle` | loop | 4 s | Sidebar idle: light drifts across the folded panels; geometry static. |
| `fold` | one-shot | 0.5 s | Sidebar unmount: disperse along the axes and fade. |

The default state machine `Lifecycle` chains `unfold` → `idle` (exit-time
transition), so a mounted canvas animates in and then holds the locked mark
under a moving light with no driving code. The three faces share one brand
gradient (red `#FF0000` → orange `#FF6600`) in one mark-global direction, so
the gradient reads as one material across the panels and the idle light
drift stays consistent across the folds.

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
geometry (`locked` and `exploded` poses). The Rive CLI installs with
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
