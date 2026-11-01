# Vendored MLightCAD CAD runtime

The drawing-domain CAD engine as a vendored, self-contained ESM bundle
of MLightCAD ([cad-viewer](https://github.com/mlightcad/cad-viewer),
MIT) — the base for DXF editing in this plugin; the facade cassette
designer's profile sketch canvas consumes the same bundle through its
declared cross-plugin `cad-viewer` dependency (the module proxy serves
it from this executor). The surface module lazy-imports the bare
`cad-viewer` name.

Bundled with esbuild from npm (DXF-only configuration — the open-source
DWG path is GPL LibreDWG and stays out):

- `@mlightcad/cad-simple-viewer` 1.7.5 (document manager, draw/modify
  commands, prompt input, osnaps, undo/redo) with its MIT peers
  (`@mlightcad/data-model`, `@mlightcad/three-renderer`,
  `@mlightcad/mtext-*`, `@mlightcad/geometry-engine`,
  `@mlightcad/graphic-interface`, `@mlightcad/common`,
  `@velipso/polybool`, `three` 0.172, `lodash-es`, `mitt`, `rbush`)

Rebuild (from a scratch install of the packages above):

```bash
node_modules/.bin/esbuild entry.mjs --bundle --format=esm --minify \
  --keep-names --platform=browser \
  --define:process.env.NODE_ENV='"production"' \
  --alias:three/examples/jsm/libs/stats.module=three/examples/jsm/libs/stats.module.js \
  --alias:three/examples/jsm/controls/OrbitControls=three/examples/jsm/controls/OrbitControls.js \
  --outfile=cad-viewer.mjs
```

where `entry.mjs` re-exports `AcApDocManager`, `AcApSettingManager`,
and `acedApplyUiTheme` from `@mlightcad/cad-simple-viewer` and
`AcDbArc`, `AcDbCircle`, `AcDbLine`, `AcDbPolyline` from
`@mlightcad/data-model`. `--keep-names` is required:
the engine reflects on constructor names. `three` is bundled inline (the
stack is built against the npm r172 build); if `assets/vendor/three` is
ever re-vendored from the same build, the two copies can be deduplicated.
The surface turns the engine's standalone-viewer widgets off through the
settings manager (`isShowCommandLine`, `isShowShortCutToolbar` — the
dialog owns the chrome; prompts ride the cursor dynamic input) and themes
the remaining canvas UI with `acedApplyUiTheme('dark', …)`.

Patched in place after bundling: two error-message templates reworded
(`from '${url}'` → `at ${url}` / `of "${url}"`) so the SDK surfaces
check's import-specifier scan does not false-positive on prose inside
string literals.

Surface-reachable drafting assists (the profile sketch editor's
toolbar): ortho toggles through the document's `orthomode` property
(point input reads the ORTHOMODE sysvar live), and object snaps live on
`AcApSettingManager.osnapModes` as the standard DXF OSMODE bit mask
(shipped default set: endpoint, midpoint, center, quadrant,
intersection, nearest — the surface ORs in the Tangent bit for fillet
workflows). The settings manager persists `osnapModes` to localStorage
per origin and a stored value permanently overrides the engine defaults,
so the editor asserts the default six-mode mask (± the Tangent toggle)
on every mount — a stale stored mask from an older build can never
disable snapping. POLARMODE/POLARANG are non-db sysvars held in the
engine's internal sysvar manager, which the bundle does not export —
wiring polar tracking needs a re-vendor that re-exports it. This build
has no grid or snap-to-grid at all (grid data only round-trips through
DXF viewport table records).

## One canvas per page

`AcApDocManager` is a page singleton: `createInstance` returns the first
manager and ignores every later container, so a second canvas would draw
the first one's document. Surfaces coordinate through a lease on
`globalThis[Symbol.for('perigram.cadViewer.lease')]` — an object with one
slot, `owner`. A mount claims the lease with a private token before
`createInstance`, releases it on unmount, and while another token holds
it renders the collision state with a retry instead of mounting. The
`cad-viewer` module is shared by both consumers (facade's profile canvas,
tech-drawing's DXF template canvas), so the symbol is the whole protocol.

Every mount destroys its manager on unmount (`destroy()` clears the
singleton); the glyph-redraw settle delay in both surfaces guards the
engine's font timer from firing after teardown.

Keyboard routing stays in the engine: its view key handler binds at the
document level for the active managed view and maps Delete/Backspace to
erase, skipping events whose target is an editable field. Undo/redo over
an authored model belongs to that model: the profile canvas intercepts
Ctrl+Z / Ctrl+Y at the window and steps its sketch snapshots, and the
engine's undo/redo commands leave its command stack. The surface routes
no other drawing keys (only its window-level Escape), so authoring
inputs type normally. Typed prompt
entry (a bare length as direct distance toward the cursor, `dist<angle`
polar, `@x,y` relative) parses only through the command-line input —
the engine's length/angle entry chrome is touch-layout only — so the
profile editor's toolbar carries a Command line toggle that reveals the
CLI on demand (mounted `display`-absolute inside the canvas container);
the mount asserts the setting off, so every session starts with the
clean chrome.
