# CONTAINER: Tech-Drawing Plugin Executor

The tech-drawing domain as a third-party plugin (SPEC §Plugin
marketplace, owner decision 2026-10-17 — the pack retired into this
listing): `listing.json` is the whole declaration surface (pen
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
  the built-in listing; new organizations install it by default
  (`organizations/default-plugins.js`, before the facade — the facade's
  `requires` names this plugin).
- Existing orgs: `server/scripts/migrate-tech-drawing-pack-to-plugin.js`
  installs the listing per organization (type ids unchanged, so
  instances, the color system catalogue, and process bindings resolve
  continuously; the pack's code mount is gone, so no disablement is
  written).
- Deploys bump `version` and re-publish — installed organizations then
  see the available-version tag and upgrade through the Plugins page.

Parent: [workers README](../README.md). Platform consumer:
[plugins feature](../../server/features/plugins/README.md).
