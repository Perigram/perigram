# COMPONENT: @perigram/facade

The facade fabrication domain plug-in (SPEC §21). This is the pack that
owns cassettes (OCCS files with the cassette designer), sheet designs,
facade designs, the nesting solver service, and the pack's command and
event contracts. `server/packs/facade` binds the declarations to server
services; the framework registry and the client type system consume the
data.

The package was mislabeled `@perigram/domain-cnc` by an earlier agent
session; the legacy entity/workflow/construction tables that rode beside
these declarations are deleted. What remains here is the whole of the
facade domain in the type system.

## Cassette previews

The cassette type's declared preview channel walks its renderable stored
shapes in order: the baked geometry preview (`data.geometry.preview`)
first, then the raw layer/polygon parts uploaded templates store
(`data.layerData`, `data.polygonParts`) as `previewSource`
`fallbackPaths`. Generated card previews therefore render whichever
construction path baked the record — OCCS-payload cassettes preview
through the payload channel, legacy baked records through the declared
one — without a cassette-specific branch in any generator surface (the
shared canvas's geometry normalizer accepts the parts lists handed as
the geometry value; see
[instance-display](../../utils/instance-shape.js) and
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
  resolved dimensions — json), plus a DXF payload trait. Records live in
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
  referenced on the created record. Construction-time means
  construction-time: template edits or source-file changes after
  construction never propagate to production pieces. The hand layer
  mapping (DXF layer names → canonical layers) remains the STANDARD
  cassette import pipeline's concern; these modes read canonical-named
  layers directly.
- Only OCCS parametric templates bake. STANDARD templates (the DXF import
  pipeline) carry their own geometry and are referenced directly, not
  baked.

## Modules

- `src/pack.js` — the browser-safe declaration data: `facadeFileTypes`
  (cassette, sheet-design — with declared states, transitions, render
  policies, and operators), `facadeEditors`
  (the canonical editor-binding contract served with the type view),
  `facadeServices` (the nesting solver's V→V registration, SPEC §8), and
  `facadeAttachmentKinds` (the OCCS upload kind).
- `src/commands.js` — the pack's command contracts:
  `saveCassetteTemplate`, `convertArtifact`, and `solveNestingValue`
  (the nesting service's command definition — its parameter sockets
  mirror the service signature one-to-one). Framework commands live in
  `server/core/commands/definitions.js`.
- `src/events.js` — the pack's trigger declarations (`facadeEvents`).
- `src/artifact-conversions.js` — the artifact conversion catalog
  (LAYOUT_DXF → DXF source → cassette).
- `src/index.js` — the public barrel plus `facadeDomain`: the server-side
  domain slice (commands, events, service identity table) the app
  registry mounts. Never an entity catalog — the CTS registry view is
  the catalog.

## The nesting service

`facadeServices` registers `nesting.solve` as a SPEC §8 s-species
operator: pure values in (typed job geometry and sheet parameters —
declared products per the value universe, never json-parked), values out
(layouts and a summary; the solver's raw layout payload is the one
true-external Json escape). The signature's field names match the
`solveNestingValue` handler's parameter sockets exactly, and the pack
mount binds the handler (`server/packs/facade/nesting/solve-value.js`)
beside it. See
[server/packs/facade/nesting README](../../server/packs/facade/nesting/README.md)
for the boundary contract.

## Related

- [server/packs/README.md](../../server/packs/README.md) — pack mounting.
- [server/packs/facade/index.js](../../server/packs/facade/index.js) — the server binding.
- [packages/cts/SPEC.md](../cts/SPEC.md) — §8 operator species, §21 packs.
