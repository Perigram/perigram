# Vendored MLightCAD CAD runtime

The cassette designer's profile sketch canvas runs on a vendored,
self-contained ESM bundle of the MLightCAD browser CAD engine
([cad-viewer](https://github.com/mlightcad/cad-viewer), MIT) so the
plugin serves its own drawing runtime — the surface module lazy-imports
`cad-viewer.mjs` by relative URL against the executor's static tree, and
the SDK surfaces check keeps the graph free of bare specifiers.

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

where `entry.mjs` re-exports `AcApDocManager` from
`@mlightcad/cad-simple-viewer` and `AcDbArc`, `AcDbCircle`, `AcDbLine`,
`AcDbPolyline` from `@mlightcad/data-model`. `--keep-names` is required:
the engine reflects on constructor names. `three` is bundled inline (the
stack is built against the npm r172 build); if `assets/vendor/three` is
ever re-vendored from the same build, the two copies can be deduplicated.

Patched in place after bundling: two error-message templates reworded
(`from '${url}'` → `at ${url}` / `of "${url}"`) so the SDK surfaces
check's import-specifier scan does not false-positive on prose inside
string literals.
