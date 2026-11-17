# CONTAINER: Tech-Drawing Plugin Executor

The tech-drawing domain as a third-party plugin (SPEC §20): `listing.json` is the declaration surface (pen
templates, layer standards, colors, DXF/SVG sources, the sketch type,
the sketch editor binding, and the fill construction). The
types ride the generic instance machinery; the process serves the DXF
placement service, the sketch editor surface module, and its vendored
runtime dependencies — static GETs through the platform's module proxy,
same-origin. Orgs connect the executor through the install's
`surfaceOrigin`.

- Listing: `workers/tech-drawing/listing.json` (validate with
  `npx perigram-plugin validate workers/tech-drawing/listing.json`).
- Service: `place-dxf` (`services.js`, provider-dispatched service, construction
  `fill` on `dxf-source`). Input `{ refs: { template, parts }, draft }`
  — template and part refs arrive with `payloadBase64`; output
  `payload: { base64, mime: 'application/dxf', name }` (the composed
  file named for the operator's typed create name, `draft.data.name`,
  over the template's own name), or
  `{ failures: [{ name, message }] }` on refusal.
- Editor surface: `surfaces/sketch-editor.mjs` (surface contract 3 — the
  capability mount; background images upload through the host file
  channel, undo/redo over scene snapshots inline). Its read-only
  presentation (mount `mode: 'read'`, SPEC §4) is the scene svg alone,
  inert.
- DXF template editor: `surfaces/dxf-editor.mjs` (surface contract 2,
  bound to `dxf-source` edit). Marker-first: the template opens in the
  CadCraft canvas (the declared `cadcraft` dependency), the
  `{spot:<name>}` anchors list beside it — add (a canvas click picks the
  insertion point into the X/Y form), rename, delete — and every edit
  re-opens the spliced DXF so the canvas shows the saved truth. The
  document name and save ride the host header through the `pageChrome`
  channel (SPEC §4). Under
  mount `mode: 'read'` (SPEC §4) the canvas and the anchor rows render
  view-only. The
  canvas reads the layer-normalized copy (`withLayerTable`: every
  entity-referenced layer plus layer 0 gains a LAYER record and the
  CONTINUOUS linetype, so strict viewers draw the whole template);
  saves ride the authored bytes through the revisioned payload channel.
  [`assets/vendor/cadcraft/host.mjs`](./assets/vendor/cadcraft/README.md)
  owns the same-origin iframe, chrome and first-run-tour suppression,
  entity mapping, the derived annotation layer and the
  selection/pointer subscriptions. The pair
  model and the marker operations live in `dxf-markers.js`, shared with
  the placement engine; `spotNamesOf` (the anchor read the fill dialog's
  spot-parts row consumes through the served surface module) homes there
  too.
- Scene model: `surfaces/lib/sketch.js` — the plugin's editing copy of
  the sketch scene contract; the host's `utils/sketch.js` keeps the
  DrawingCanvas preview adapter over the same stored shape.
- Vendored runtimes: `perfect-freehand` (declared dependency, MIT;
  rebuilt with `perigram-plugin vendor --listing listing.json`) and the
  CadCraft browser edition
  ([`assets/vendor/cadcraft`](./assets/vendor/cadcraft/README.md)) — the
  base for DXF editing; facade's cassette designer consumes the same host
  through its declared cross-plugin dependency.
- `dxf-source` and `svg-file` declare the `geometry` revision scope and
  `sketch` the `scene` scope: the revisioned payload channel serves
  replace-in-place for drawing templates (SPEC §24).

Runs from the repo mount (compose `tech-drawing-executor`, port 8792) —
nothing here imports platform code.

## DXF placement law (SPEC §24)

A DXF template marks each placement anchor with a TEXT/MTEXT entity whose
whole text is `{spot:<name>}`. A part ref either carries an explicit
`spot` assignment (the fill dialog's per-spot pairing — any part into any
anchor, names irrelevant) or matches by instance name — the zero-config
default, never a gate. The service translates each part's ENTITIES so its
extents minimum lands on the marker's insertion point, removes the marker
entity, and splices the translated entities into the template's ENTITIES —
everything else in the template (header, tables, blocks) is preserved
verbatim. Unmatched markers, unassigned parts, a part assigned to an
anchor the template does not carry, and double assignments all answer the
structured refusal — `{ failures: [{ name, message }] }` naming each
offender — which the create dialog renders as the list. The fill
operator's `parts` input carries the `spot-parts` control pin (SPEC §4
naming facet): the dialog lists the picked template's anchors and picks a
part per anchor, name-equal parts prefilled.

Translation covers coordinate pairs 10–18 (x) and 20–28 (y) and rounds
to six decimals. Header `$EXTMIN`/`$EXTMAX` values stay as authored;
viewers recompute extents from entities.

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
