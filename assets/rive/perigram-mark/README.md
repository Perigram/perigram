# CODE: Rive Mark Animation

Source project for the animated Perigram mark, built with the Rive CLI into
[`public/rive/perigram-mark.riv`](../../../public/rive/perigram-mark.riv) for
web embedding. Parent: [assets README](../../README.md).

The mark is the folded axonometric cassette from
[`public/icon.svg`](../../../public/icon.svg): the top rhombus is the face,
the two lower parallelograms are the flanges, and the V-shaped negative space
between them is the rib. The animation keeps that identity and puts it in
motion: the flanges fold up around the face's lower edges (the cassette
closing) and swing back out with a small overshoot that momentarily narrows
the rib.

## Source of truth

`tools/generate_scene.py` owns the geometry and motion; `scene.rml` is its
output and is committed so the project builds without Python. One metric
drives everything — the edge length `e`; the face is a 60° rhombus, each
flange hangs under a lower face edge at exactly one fold depth (`e/2`), and
`public/icon.svg` is the reference for the shape.

The fold is the exact isometric projection of a 3D rotation about the face's
lower edge: per-vertex offsets `(a, y, z)` against the hinge axis are rotated
in `(y, z)` and projected through `P(X)=(0.866,0.5)`, `P(Y)=(-0.866,0.5)`,
`P(Z)=(0,-1)`. Fold angle 0 is the logo pose; 90° is the flange standing
against the face edge. Keyframes are placed at equal angle steps on frames
distributed by an ease curve, so linear keyframe interpolation follows the
eased projected arc.

## Animations

| Name | Kind | Duration | Use |
|---|---|---|---|
| `load` | loop | 1.6 s | Loader: fold shut, hold, swing out with overshoot, settle. |
| `unfold` | one-shot | 0.6 s | Sidebar mount: shut pose → open with overshoot settle. |
| `idle` | loop | 4 s | Sidebar idle: ±8° fold breathe. |
| `fold` | one-shot | 0.5 s | Sidebar unmount: open → shut. |

The default state machine `Lifecycle` chains `unfold` → `idle` (exit-time
transition), so a mounted canvas animates in and keeps breathing with no
driving code. All timelines key only the eight flange vertices; the face and
the shared brand gradient (red `#FF0000` → orange `#FF6600`, mark-global
direction so the gradient reads as one material across the folds) are static.

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
geometry (`rest` and `shut` poses). The Rive CLI installs with
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
