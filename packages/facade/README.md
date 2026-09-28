# COMPONENT: @perigram/facade

The facade fabrication domain plug-in (SPEC §21). This is the pack that
owns cassettes (OCCS files with the cassette designer), sheet designs,
sheet materials, cassette designs, the nesting solver service, and the
pack's command and event contracts. `server/packs/facade` binds the
declarations to server services; the framework registry and the client
type system consume the data.

The package was mislabeled `@perigram/domain-cnc` by an earlier agent
session; the legacy entity/workflow/construction tables that rode beside
these declarations are deleted. What remains here is the whole of the
facade domain in the type system.

## Cassette previews

The cassette type's declared preview channel walks its renderable stored
shapes in order: the baked geometry preview (`data.geometry.preview`)
first, then the raw layer/polygon parts uploaded templates store
(`data.layerData`, `data.polygonParts`), then the OCCS template document
(`data.definition` — the graph-tree definition the cassette designer
edits, rendered through the canvas's `occs-cassette` source). Generated
card previews therefore render whichever construction path baked the
record — OCCS-payload cassettes preview through the payload channel,
legacy baked records and parametric templates through the declared
one — without a cassette-specific branch in any generator surface
(the OCCS-definition detector is single-homed in
[utils/drawingPreview.js](../../utils/drawingPreview.js); see
[components/shared/README.md](../../components/shared/README.md)).

## The cassette-design type and the bake construction

`cassette-design` is the production drawing: one concrete piece baked from
a parametric cassette template at a fixed set of parameter values. It is
a pack type, not org-authorable vocabulary, for one reason: org types
carry data shape and lifecycle, but baking is evaluation semantics — the
OCCS graph tree evaluated once at construction through the same pure
evaluator the template editor uses
(`evaluateOccsCassetteTemplate` in `utils/occs/evaluate.js`). The template
is the reusable library record; the cassette-design is what orders,
nesting inputs, and per-piece traceability reference.

- Class `file` (it carries the uploaded DXF payload, like cassette itself); fields: `template` (`ref`, accepts `cassette`), `source`
  (`ref`, accepts `dxf-source`), `parameters` (the applied values, json),
  `geometry` (the baked/extracted evaluation — polygons, layer data,
  resolved dimensions — json, never a construction input: every mode
  computes it), plus a DXF payload trait. Records live in
  the §13 per-class collections through the generic instance service; the
  pack registers no bespoke storage. Compact snapshots keep provenance
  only (`data.template`, `data.parameters`) — baked geometry never rides
  previews.
- Construction is exactly three modes, all pack-bound
  (`server/packs/facade/cassettes/cassette-design-construction.js`):
  **`upload`** — a DXF payload (the upload protocol's file) whose layers
  use the canonical OCCS vocabulary (`cut.outer` carries the nesting
  contour, other layers map by their own names); **`bake`** — an OCCS
  template ref plus parameter values evaluated once through the same
  pure evaluator the template editor uses; **`convertDxf`** — a
  `dxf-source` instance ref extracted the same way, with the source
  referenced on the created record. The bake/convertDxf operator inputs
  are record-shaped (`name?`, `template`/`source`, bake adds
  `parameters?`), so a graph construct in those modes wires exactly the
  operator's fields. Construction-time means
  construction-time: template edits or source-file changes after
  construction never propagate to production pieces. The hand layer
  mapping (DXF layer names → canonical layers) remains the STANDARD
  cassette import pipeline's concern; these modes read canonical-named
  layers directly.
- Only OCCS parametric templates bake. STANDARD templates (the DXF import
  pipeline) carry their own geometry and are referenced directly, not
  baked.

## The sheet-material type

`sheet-material` is the declared material (SPEC §16's `Material`): the
sheet stock a nesting run cuts from. Class `file` (value identity,
referenced — `code` is the identifier, `width`/`height`/`thickness` are
`mm` quantities). Instances are created through the generic machinery
(`genericCreate`) and ride an org-authored order container's children
edge; `nesting.solve` resolves its sheet parameters from the bound
instance.

## Modules

- `src/pack.js` — the browser-safe declaration data: `facadeFileTypes`
  (cassette, cassette-design, sheet-material, sheet-design — with
  declared states, transitions, render policies, and operators),
  `facadeEditors`
  (the canonical editor-binding contract served with the type view),
  `facadeServices` (the pack's registered V→V services, SPEC §8 — see
  below), and `facadeAttachmentKinds` (the OCCS upload kind).
- `src/commands.js` — the pack's command contracts:
  `saveCassetteTemplate`, `convertArtifact`, and the value-service
  handlers `readOrderRows`, `resolveCassetteNames`,
  `buildNestingItems`, `solveNestingValue`
  (each service's parameter sockets mirror its signature one-to-one).
  Framework commands live in `server/core/commands/definitions.js`.
- `src/events.js` — the pack's trigger declarations (`facadeEvents`).
- `src/artifact-conversions.js` — the artifact conversion catalog
  (LAYOUT_DXF → DXF source → cassette).
- `src/index.js` — the public barrel plus `facadeDomain`: the server-side
  domain slice (commands, events, service identity table) the app
  registry mounts. Never an entity catalog — the CTS registry view is
  the catalog.

## The nesting service and the value services

`facadeServices` registers `nesting.solve` as a SPEC §8 s-species
operator: pure values in, values out. `Ref` is a value (SPEC §2), so a
service signature may accept typed instance references and resolve them
through the instance services — that is how a graph reaches stored
payload data (order tables, baked geometry) without an entity leaking
into a value boundary. The registered services:

- **`nesting.solve`** — job items in (typed job geometry per the value
  universe; the solver's raw layout payload is the one true-external
  Json escape), `{ layouts, summary }` out. Sheet width/height resolve
  from the bound `sheet-material` ref; `space`/`sheetCount` are solver
  knobs with authored fallbacks (3 mm / 1 sheet). The signature's field
  names match the `solveNestingValue` handler's parameter sockets
  exactly, and the pack mount binds the handler
  (`server/packs/facade/nesting/solve-value.js`). See
  [server/packs/facade/nesting README](../../server/packs/facade/nesting/README.md)
  for the boundary contract.
- **`nesting.items`** — cassette-design refs → nesting job items: the
  baked geometry of each design read once, server-side (the p-extract
  seam of SPEC §16 — stored geometry never travels the graph as authored
  json paths). Output items carry exactly the `nesting.solve` item shape.
- **`orders.readRows`** — an `xlsx-workbook`/`csv-table` ref → typed
  order-line values `{ name, templateName, parameters }`. Column
  detection: an authored exact column name wins, else the
  case-insensitive defaults (`name`, `cassette`); every other column is
  a parameter cell (numeric-looking cells become numbers).
- **`cassettes.resolveByName`** — template names → cassette refs,
  order-preserving, so a bake construct consumes refs aligned with the
  rows that named them; unmatched names fail the call listing every
  missing name.

The composed flow these services exist for — an uploaded order table
becoming a container with baked children, materials, and saved nesting
runs — is proven end to end by the composed test process
(`server/packs/facade/order-process-fixture.js`, exercised by
`order-process.spec.js`).

## Related

- [server/packs/README.md](../../server/packs/README.md) — pack mounting.
- [server/packs/facade/index.js](../../server/packs/facade/index.js) — the server binding.
- [packages/cts/SPEC.md](../cts/SPEC.md) — §8 operator species, §21 packs.
