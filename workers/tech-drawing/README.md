# CONTAINER: Tech-Drawing Plugin Executor

The tech-drawing domain as a third-party plugin (SPEC §Plugin
marketplace): `listing.json` is the whole declaration surface (pen
templates, layer standards, colors, DXF/SVG sources, the sketch type,
and the sketch editor binding). The plugin is declarations-only — no
services, no compute: its types ride the generic instance machinery, and
this process exists to serve the sketch editor surface module and its
vendored runtime dependencies as static GETs. The platform's module
proxy streams them to browsers same-origin; orgs connect the executor
through the install's `surfaceOrigin`.

- Listing: `workers/tech-drawing/listing.json` (validate with
  `npx perigram-plugin validate workers/tech-drawing/listing.json`).
- Editor surface: `surfaces/sketch-editor.mjs` (surface contract 3 — the
  capability mount; background images upload through the host file
  channel, undo/redo over scene snapshots inline).
- Scene model: `surfaces/lib/sketch.js` — the plugin's editing copy of
  the sketch scene contract; the host's `utils/sketch.js` keeps the
  DrawingCanvas preview adapter over the same stored shape.
- Vendored runtime: `perfect-freehand` (declared dependency, MIT;
  rebuilt with `perigram-plugin vendor --listing listing.json`).

Runs from the repo mount (compose `tech-drawing-executor`, port 8792) —
nothing here imports platform code.

## Publish, install, migrate

- Deploy + seed: `node server/scripts/seed-plugin-catalog.js` publishes
  the built-in listing; organizations install explicitly from the
  Plugins section — install this before the facade, whose `requires`
  names it.
- Existing orgs: `server/scripts/migrate-tech-drawing-pack-to-plugin.js`
  (type ids unchanged).
- Upgrades apply through the
  [plugins feature](../../server/features/plugins/README.md)
  (diff preview plus migration steps).

Parent: [workers README](../README.md). Platform consumer:
[plugins feature](../../server/features/plugins/README.md).
