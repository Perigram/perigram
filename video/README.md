# COMPONENT: Facade Explainer Video

A standalone [fframes](https://github.com/dmtrKovalenko/fframes) project (Rust
+ SVG scenes, GPU-rendered, ffmpeg-encoded) that produces the PerigramFacade
explainer: a 25.6-second, 1920×1080 @ 30 fps video following one cassette
geometry through its whole lifecycle — authored flat, folded up, baked into
variants, nested onto a sheet, cut free and folded again into the facade wall.
It is a separate Rust crate — the Nuxt build never imports it.

## Plot

| # | Scene | Duration | What it shows |
|---|---|---|---|
| 0 | `TitleScene` | 2.8 s | Wordmark with the rotating-core mark and one line. |
| 1 | `AuthorScene` | 7.2 s | The flat pattern traces itself in (contour, fold routes, bolt holes, hanger notches, mark); `A`/`B` settle once with dimension lines visible only while changing; then the same geometry folds up in place — returns +90°, mounting lips −90° — while the camera yaws to show the tray. |
| 2 | `BakeScene` | 4.6 s | The folded template splits into three baked variants with fixed dimensions, then all three unfold flat, shrink and land as the first three placements on the incoming sheet. |
| 3 | `NestScene` | 5.0 s | The remaining solver placements stamp in with landing rings; the efficiency number counts up to 77.0 % once and fades out. |
| 4 | `CutScene` | 6.0 s | A cut head walks one `PFC-001` contour with sparks, the piece frees, folds up into the finished cassette (same two-level fold as authoring) and flies into the facade wall assembling from this run's pieces; the end line closes the loop. |

Scene boundaries are handoffs, not resets: the folded piece that ends
`AuthorScene` opens `BakeScene` at the same screen position, the baked
pieces that end `BakeScene` are the first three placements of `NestScene`'s
sheet, and `CutScene` opens on the nest's exact final framing (identity
sheet transform) before its camera push starts. Each pair of neighbours
cross-fades over a 10-frame overlap in which both scenes render the same
pixels; the handoff continuity test guards this. Text appears only while it
carries data: parameter values during the morph, piece ids and dimensions
on baked pieces, piece marks on the sheet (fading out before the cut
handoff), one efficiency number.

## Visual identity

Everything is traced from the app, not invented:

- Surfaces and text: the dark-theme zinc tokens from
  [assets/tokens](../../assets/tokens/README.md) — page `#09090b`, cards
  `#18181b`, subtle `#27272a`, borders `#3f3f46`, ink `#fafafa`, muted
  `#a1a1aa` — with the Perigram accent `#ff0040` for signals.
- Drawing layers: the sheet-design preview palette
  (`LAYER_STYLES` in [sheet designs](../../server/packs/facade/sheet-designs/README.md))
  — `cut.outer` red, `fold.route` amber dashed, `code.cassette_mark` emerald,
  `dimension.cassette` violet dotted, `contour.material_sheet` slate dashed.
- Logo: the Perigram mark from `public/icon.svg` (isometric cube, red-orange
  gradient) traced into `logo()`.
- Fonts: IBM Plex Sans (display/UI) and IBM Plex Mono (technical), the app's
  typography faces, embedded in `media/`.

## Cassette anatomy

A cassette is the OCCS graph tree the Cassette Designer authors: a root face
with a return flange (+90°) on every edge, and mounting-flange lips (−90°,
the tree's `mounting_flange` role) on the side returns — so the fold is
two-level, exactly what `foldAngle: '-90'` produces in the app. The flat
pattern is the union of those faces: side returns run the full face height,
top/bottom returns only the face width (the evaluator's stepped contour), the
lips widen the side steps, and the two integral-cut hanger clips break the
top return's outer edge with the true `hangerClipCutPolygon` shape
(width 42, height 28, hook depth 12, slot 14.7 — edge-breaking cuts dispatch
through `cut.outer`). Bolt holes are `cut.hole` circles (d = 5) through the
side returns; the mark is the name / template id / WP triple on the root face.

`groundtruth.mjs` regenerates the evaluator's geometry for both the simple
four-return cassette and the complex one with mounting lips (`node
video/groundtruth.mjs` from the repo root); `src/lib.rs` carries the resulting
contours as unit-test constants so the Rust drawing stays diffed against the
app's own evaluator.

The folded cassette is not a separate drawing: `cassette_faces` builds every
face once (polygon, holes, fold angle, junction line), the flat pattern draws
them coplanar, and the folded piece folds the same faces about their junction
lines with composed rotations — the same face/fold graph algorithm as
`buildCassetteV2FoldedPreview` in [the facade plugin's render family](../../workers/facade/surfaces/lib/cassetteV2FoldedPreview.js).
At fold 0 the folded piece is the exact flat pattern; holes and hanger notches
ride their flanges; the corner steps open into relief gaps as the returns
rise. Piece sizes, sheet size, the layout and the efficiency number are
illustrative demo constants defined once in `src/lib.rs` (`SPECS`, `SHEET_MM`,
`LAYOUT`, `EFFICIENCY`).

## Motion

One continuous camera push runs over the whole video (1.0 → 1.035 on global
time): every scene computes the same transform for the same global frame,
so during a handoff overlap the incoming and outgoing content sits
pixel-on-pixel instead of jumping the framing. The Perigram mark carries
the Rive mark's rotating-core motion (the face square spins in its own plane,
90°-periodic). The flat pattern traces in with a dash-offset walk, dimensions
pulse once when a parameter settles, the fold is a spring with the light
sweeping as walls rise — the folded drawing starts as the exact flat pattern
(an axis-aligned projection blend) so the flat ↔ folded cross-fade never
changes the silhouette — baked pieces bob apart, unfold and flatten onto the
sheet as they fly to their placements, nested pieces land with expanding
rings, the cut head throws sparks, and the freed piece rises off the flat
drawing on a spring before flying into the breathing wall.

## Layout

| File | Role |
| --- | --- |
| `src/lib.rs` | The video: palette/logo helpers, the cassette face model (flat + folded from one geometry), the piece/sheet model, the five scenes, and the ground-truth/fold unit tests. |
| `src/main.rs` | The fframes command line (Skia/Vulkan backend, libx264 encode). |
| `media/` | IBM Plex Sans/Mono TTFs embedded into the binary. |
| `groundtruth.mjs` | Regenerates the evaluator's OCCS geometry (cut contour with and without mounting lips, fold routes, mark) to diff the Rust drawing against. |
| `tests/frames.rs` | Snapshot test of settled frames, an every-frame problem inspection, and a scene-handoff continuity check (switch frames must not change the screen) — the render guard for changes. |

## Requirements and build

Rust stable, plus the libraries ffmpeg is linked against (the first build
downloads prebuilt Skia/ffmpeg archives; it falls back to compiling ffmpeg
from source when the feature set has no archive). On Debian/Ubuntu:

```bash
sudo apt-get install -y yasm nasm ffmpeg libx264-dev libx265-dev libopus-dev \
  libclang-dev clang ninja-build libvpx-dev libasound2-dev
```

The crate links ffmpeg through the prebuilt `ffmpeg-sys-fframes` archive,
which expects system x264 ABI **163** (Ubuntu 22.04-era `libx264-dev`). On
newer systems (x264 164/165) the link fails with an undefined
`x264_encoder_open_163`; build that exact x264 from the
[mirror](https://github.com/mirror/x264) (last commit before the
`X264_BUILD 164` bump) with `./configure --disable-cli --enable-static
--disable-asm` and point the linker at it, e.g.
`RUSTFLAGS="-L /path/to/x264/lib"`. Without the `clang` package, bindgen
also needs gcc's wrapper headers:
`BINDGEN_EXTRA_CLANG_ARGS="-isystem /usr/lib/gcc/x86_64-linux-gnu/<ver>/include"`.
The final link also needs `libfreetype.so` / `libfontconfig.so` dev names:
when only the runtime `.so.N` files are installed, put symlinks next to the
static `libx264.a` (e.g. `/tmp/video-libs/`) and pass
`RUSTFLAGS="-L /tmp/video-libs"`.

## Work on it

```bash
cargo run --release -- timeline        # scenes, frame ranges
cargo run --release -- inspect         # every frame checked for problems
cargo run --release -- strip NestScene -n 12   # contact sheet -> strip.png
cargo run --release -- render          # final video -> out.mp4
cargo run --release -- preview         # real-time GPU window, with sound
cargo test                             # snapshots + all-frame inspection
```

The rendered video is `out.mp4` (gitignored); regenerate it with `render`.

## Related

- [Root README](../../README.md) — documentation map.
- [Facade plugin](../../workers/facade/README.md) — the contracts the plot follows.
