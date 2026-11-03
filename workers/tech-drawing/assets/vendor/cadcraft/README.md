# Vendored CadCraft browser edition

CadCraft 0.7.0 from [getcadcraft/cadcraft](https://github.com/getcadcraft/cadcraft)
(Apache-2.0), unpacked from `cadcraft-browser-edition-v0.7.0.zip` under
[`app/`](./app/). The plugin's two drawing surfaces load it through the
declared `cadcraft` dependency; `host.mjs` is the same-origin embedding
adapter.

## Host contract

`CadCraftHost` mounts `app/index.html?embed=1` in an iframe on the page's
origin. The frame exposes `window.cadcraft = { doc, view, engine, host, commands }`.
Embed mode keeps the host's persistence model: the edition starts no
autosave copies, shows no recovery dialog, and starts no add-ons or
assistant tooling.

| Member | Contract |
|---|---|
| `mount()` | creates the `?embed=1` frame, waits for `window.cadcraft`, injects the chrome stylesheet, binds the document, selection, command hook and input listeners, and mirrors the app theme |
| `seed(entities, { name, layers, linetypes, fit })` | `doc.load` of CadCraft entities (`line`, `circle`, `arc`, `poly`); seeded entities carry `shapeId` so extraction keeps authored identity; `linetypes` carries dash patterns the layers name; `fit: false` restores the camera the load would otherwise refit |
| `entities()` | `doc.all()` |
| `openText(name, text)` | reads ASCII DXF through the edition's `dxf.js` and loads the drawing |
| `newDrawing(name)` | empty layer-0 document |
| `annotate(layer, entities, { locked })` | replaces one derived layer's entities in place; document events stay suppressed, a locked layer stays visible and unpickable |
| `pick(point, px)` | the engine's editable entity under a world point, or null |
| `worldToScreen` / `screenToWorld` | `view.toScreen` / `view.toWorld`; popup and pointer coordinates are frame-local |
| `viewKey()` | the view pan/zoom tuple the surfaces poll for transient popup redraws |
| `snapshotView` / `restoreView` | the view camera `{ cx, cy, zoom, tw }`, which a host preserves across a mode flip |
| `zoomFit(excludeLayer?)` | `view.fit`; the named layer or layer list is held off while extents are measured |
| `setSelection` / `selection` | `host.setSelection` wrapper; the wrapper reports every engine pick |
| `run` / `cancel` / `running` | `engine.run` / `engine.escape` / `engine.running` |
| `setOrtho` / `setOsnap` / `setSnapKind` | the frame's drafting settings |
| `setCommandLine` | shows the frame's command line and re-sizes the canvas |
| `setVisibleLayers(names)` | toggles layer visibility from a host palette; `null` shows every layer, an empty list hides every layer |
| `applyTheme()` | mirrors the app's surface, ink, border, primary and font tokens into the frame root, sets `data-space` to `paper`/`model`, and re-applies on the app theme's `html` class change |
| `onChange`, `onSelection`, `onCommand`, `onPointerDown`, `onPointerUp`, `onKeyDown` | surface subscriptions; the pointer and key listeners attach to the frame document |

The host owns the visible chrome: mount injects the embed stylesheet,
hides every edition child except the stage (and the command line the
embedding toggle reveals), and turns off the edition's first-run tour and
hint card.

The frame is same-origin by construction: `contentWindow.cadcraft` and the
frame's DOM events are the bridge. A cross-origin frame exposes neither.
Both surfaces set `data-cadcraft-ready="true"` on their mount container
once the frame is mounted and seeded; the E2E suite waits on it.

The frame reads the app's tokens: `applyTheme` resolves the app's surface,
ink, muted, border and primary values through a probe, writes them into the
frame's `documentElement`, and sets `data-space` from the app's `dark-mode`
class. Drawing text uses the mirrored `--font` (`view.colors.font`), so the
canvas keeps the app's typography.

The module proxy rewrites the surfaces' bare `cadcraft` import from the
organization's installed declaration snapshot. An install below
tech-drawing v9 / facade v40 carries the old dependency list and leaves
the specifier unresolved; apply the plugin upgrades when the executor
moves to a new listing version.

## Rebuild

1. Download `cadcraft-browser-edition-v0.7.0.zip` from the
   [release](https://github.com/getcadcraft/cadcraft/releases/tag/cadcraft-v0.7.0).
2. Replace `app/` with the zip's `cadcraft-browser-edition-v0.7.0/` folder.
   `host.mjs` and this README stay; reapply the embed-mode guard in
   `cadcraft.js` (skip autosave, add-ons and assistant tooling when
   `?embed=1`) and the drawing-font override in `view.js`
   (`this.colors.font || DRAWING_FONT` in the text draw) and `cadcraft.js`
   (`view.colors?.font || DRAWING_FONT` in the inline text editor) before
   bundling.
3. Run `npx perigram-plugin validate workers/tech-drawing/listing.json` and
   the surface smoke.

The edition uses relative URLs throughout and its own import map, so the
module proxy serves it under the plugin path without rewriting. Keep the
upstream `LICENSE`, `NOTICE`, `THIRD_PARTY.md`, `PROVENANCE.md` and
`TRADEMARKS.md` files in `app/`.

Parent: [tech-drawing README](../../../README.md). Consumer:
[facade cassette designer](../../../../facade/README.md).

## Bundled entry

`app/index.html` loads `app/assets/apps/cadcraft/0.7/cadcraft-bundle.js`, a
single ESM bundle of the app's static module graph. It keeps `three`,
`pdfjs-dist`, `manifold-3d`, `proj4`, `laz-perf`, `web-e57`, `@noble`,
`liberation-sans`, `cc-workspace`, `app-help` and `geotiff` external for
the edition's import map; dynamic imports of local modules inline.

The bundle exists because the module proxy serves one authenticated
request per module; the app's two hundred modules make a first mount
slower than the host's ready window. One bundle plus the external
libraries mounts in seconds.

`app/index.html` also carries the embed stylesheet and loading spinner:
they hide the edition's chrome from the first paint and keep the frame
blank until `host.mjs` removes the spinner on ready. `workspace-cadcraft.js`
imports its shell input relatively so the bundle resolves it under the
plugin path.

Rebuild after replacing `app/`:

```bash
cd app/assets/apps/cadcraft/0.7
node_modules/.bin/esbuild cadcraft.js --bundle --format=esm \
  --platform=browser --target=es2022 --outfile=cadcraft-bundle.js \
  --external:three --external:pdfjs-dist --external:manifold-3d \
  --external:proj4 --external:laz-perf --external:'web-e57/*' \
  --external:'@noble/*' --external:'liberation-sans/*' \
  --external:cc-workspace --external:app-help --external:geotiff \
  --external:./ws3d.js
```

`ws3d.js` stays external: the 3D tab's Three runtime and its view module
load the first time the tab opens, so the 2D editor's bundle carries no
Three import.

Set `workspace-cadcraft.js`'s `/assets/js/app-workspace-input.js` import to
`../../../js/app-workspace-input.js`, point `index.html` and
`manifest.json` at `cadcraft-bundle.js`, and restore the embed stylesheet
and `#perigram-cadcraft-loading` element in `index.html`.
