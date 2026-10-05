# COMPONENT: Facade Explainer Video

A standalone [fframes](https://github.com/dmtrKovalenko/fframes) project (Rust
+ SVG scenes, GPU-rendered, ffmpeg-encoded) that produces the PerigramFacade
explainer: a 53-second, 1920×1080 @ 30 fps video walking the parametric
cassette lifecycle from facade design to production. It is a separate Rust
crate — the Nuxt build never imports it.

## Plot

| # | Scene | Duration | What it shows |
|---|---|---|---|
| 0 | `TitleScene` | 4.5 s | Wordmark with the Perigram mark; a facade elevation assembles from folded isometric cassettes (two accent-tinted pieces). |
| 1 | `TemplateScene` | 10 s | Authoring the OCCS template: full flat-pattern anatomy with expression dimensions `A`/`B`/`R`, a live parameter panel with a folded preview that morphs with the values, and the semantic layer legend. |
| 2 | `BakeScene` | 9 s | Baking cassette-designs: parameter pills fly from the template drawing and land as folded pieces with fixed numeric dimensions — evaluated once, never re-propagated. |
| 3 | `NestScene` | 11 s | `nesting.solve` packing: the nine baked pieces fly onto a 2500 × 1250 mm material sheet (rotated placements, per-piece marks) with a pieces/sheets/efficiency stat column. |
| 4 | `SheetScene` | 8.5 s | The generated sheet-design record: piece marks, summary sidebar, the `entity_revision · scope: geometry` note and the `LAYOUT_DXF` export stamp. |
| 5 | `ProductionScene` | 10 s | A cut head walks one notched `cut.outer` contour, the piece frees and folds up into the finished cassette, then the five-stage recap strip (template → bake → nest → sheet → cut) and end card. |

## Visual identity

Everything is traced from the app, not invented:

- Surfaces and text: the dark-theme zinc tokens from
  [assets/tokens](../../assets/tokens/README.md) — page `#09090b`, cards
  `#18181b`, subtle `#27272a`, borders `#3f3f46`, ink `#fafafa`, muted
  `#a1a1aa` — with the Perigram accent `#ff0040` for stage chips and signals.
- Drawing layers: the sheet-design preview palette
  (`LAYER_STYLES` in [sheet designs](../../server/packs/facade/sheet-designs/README.md))
  — `cut.outer` red, `contour.cassette_face` blue tint, `fold.route` amber
  dashed, `code.cassette_mark` emerald, `dimension.cassette` violet dotted,
  `contour.material_sheet` slate dashed.
- Logo: the Perigram mark from `public/icon.svg` (isometric cube, red-orange
  gradient) traced into `logo()`.
- Fonts: IBM Plex Sans (display/UI) and IBM Plex Mono (technical), the app's
  typography faces, embedded in `media/`.

## Cassette anatomy

The flat pattern (`flat_pattern`) follows the OCCS contracts
([OCCS utilities](../../utils/occs/README.md)): outer cut contour with 45°
corner relief notches where perpendicular returns meet, face with dashed fold
routes at the return junctions, bolt holes through the side returns, two
integral-cut hanger clips (`hangerClipCutPolygon`: wide notch through the top
edge, narrow slot rising into the flange), an optional hem fold line, and the
production mark (name + template id/workpiece) on the root face. Detail levels
(`Full`/`Std`/`Tiny`) keep small placed pieces readable. `folded_cassette`
projects the same piece isometrically and animates the flange fold angle, so
scenes can show flat drawing and folded part of the same cassette; piece sizes,
sheet size, the layout and the efficiency number are illustrative demo
constants defined once in `src/lib.rs` (`PIECES`, `SHEET_MM`, `LAYOUT`,
`EFFICIENCY`).

## Layout

| File | Role |
| --- | --- |
| `src/lib.rs` | The video: palette/logo helpers, flat-pattern and folded-cassette geometry, the piece/sheet model, and the six scenes. |
| `src/main.rs` | The fframes command line (Skia/Vulkan backend, libx264 encode). |
| `media/` | IBM Plex Sans/Mono TTFs embedded into the binary. |
| `tests/frames.rs` | Snapshot test of settled frames plus an every-frame problem inspection — the render guard for changes. |

## Requirements and build

Rust stable, plus the libraries ffmpeg is linked against (the first build
downloads prebuilt Skia/ffmpeg archives; it falls back to compiling ffmpeg
from source when the feature set has no archive). On Debian/Ubuntu:

```bash
sudo apt-get install -y yasm nasm ffmpeg libx264-dev libx265-dev libopus-dev \
  libclang-dev clang ninja-build libvpx-dev libasound2-dev
```

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
- [Facade domain pack](../../packages/facade/README.md) — the contracts the plot follows.
