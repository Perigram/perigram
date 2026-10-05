# COMPONENT: Facade Explainer Video

A standalone [fframes](https://github.com/dmtrKovalenko/fframes) project (Rust
+ SVG scenes, GPU-rendered, ffmpeg-encoded) that produces the PerigramFacade
explainer: a 52-second, 1920×1080 @ 30 fps video walking the parametric
cassette lifecycle from facade design to production. It is a separate Rust
crate — the Nuxt build never imports it.

## Plot

| # | Scene | Duration | What it shows |
|---|---|---|---|
| 0 | `TitleScene` | 4.5 s | Wordmark; a facade elevation assembles from cassette panels (every third panel carries dashed fold routes). |
| 1 | `TemplateScene` | 10 s | Authoring the OCCS template: flat pattern with expression dimensions `A`/`B`/`R`, a live parameter panel morphing the geometry, and the semantic layer legend (`cut.outer`, `fold.route`, `cut.hole`, `code.cassette_mark`). |
| 2 | `BakeScene` | 9 s | Baking cassette-designs: parameter pills (`A=300 · B=600`) fly from the template card and land as production pieces with fixed numeric dimensions — evaluated once, never re-propagated. |
| 3 | `NestScene` | 11 s | `nesting.solve` packing: the nine baked pieces fly onto a 2500 × 1250 mm material sheet (rotated placements, per-piece marks) with a pieces/sheets/efficiency stat column. |
| 4 | `SheetScene` | 8.5 s | The generated sheet-design record: piece marks appear, a summary sidebar, the `entity_revision · scope: geometry` note and the `LAYOUT_DXF` export stamp. |
| 5 | `ProductionScene` | 9.3 s | A cut head walks one `cut.outer` contour and frees the piece, then the five-stage recap strip (template → bake → nest → sheet → cut) and end card. |

The story tracks the real contracts: templates keep expression dimensions and
bake once through the pure OCCS evaluator
([cassettes](../../server/packs/facade/cassettes/README.md),
[cassette-design construction](../../packages/facade/README.md)); nesting is a
pure values-in/layouts-out service over baked polygons
([nesting](../../server/packs/facade/nesting/README.md)); sheet designs are
immutable geometry revisions with a `LAYOUT_DXF` export
([sheet designs](../../server/packs/facade/sheet-designs/README.md)); layer
vocabulary comes from [OCCS utilities](../../utils/occs/README.md). Piece
sizes, sheet size, the layout, and the efficiency number are illustrative
demo constants defined once in `src/lib.rs` (`PIECES`, `SHEET_MM`, `LAYOUT`,
`EFFICIENCY`).

## Layout

| File | Role |
| --- | --- |
| `src/lib.rs` | The video: shared drawing helpers (flat pattern, dimensions, chips), the piece/sheet model, and the six scenes. |
| `src/main.rs` | The fframes command line (Skia/Vulkan backend, libx264 encode). |
| `media/` | Fonts embedded into the binary: DM Sans (display), JetBrains Mono (technical labels). |
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
