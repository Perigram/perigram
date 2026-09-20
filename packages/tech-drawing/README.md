# COMPONENT: @perigram/tech-drawing

The technical-drawing reference pack (SPEC §21): the drawing/CAD
vocabulary as declarations — pen templates, layer standards, the color
catalog, the freehand sketch, and the drawing exchange formats. Pure,
browser-safe declaration data; mounting is by composition — the pack
appears in [server/packs/README.md](../../server/packs/README.md)
and carries no service bindings. The CNC pack `requires` it; any other
fabrication domain (laser, vinyl, plotter) can require it without CNC.

## Types

- `pen-template` (file class): `name` plus the `stroke` record —
  `color` (hex string; the color-picker is render policy, not a value
  base), `weight: Quantity(mm)`, `pattern: Enum(solid|dashed|dotted)`.
  Replaceable reference values; no payload, no lifecycle beyond
  `archivable`. Catalog inks are not strings: the declared
  `palette: [color]` relation (`onRemove: detach`) is the R2-legal home
  for references into the color catalog, while `stroke.color` remains
  the arbitrary-ink literal.
- `layer-standard` (file class): `code` (the shadow key for org
  overrides), `category`, `group`, `kind`, `purpose`, `description`,
  `production`, `allowedGeometry`, `aliases`, `parameters`,
  `parameterSchema`, `defaultExport`, `i18n`, `source` — and the
  declared relation `defaultPen: one pen-template` (`onRemove:
  restrict`), the R2-legal home of the legacy `defaultPenId`.
- `color` (file class): the drawing palette catalog — `code` (the
  org-shadow key), `name`, `hex`. Seeded as §3 system instances
  (`organizationId: null`) by
  `server/scripts/seed-palette-colors.js`; org customization shadows by
  `code`. The legacy material-`color` entity (catalog children with
  texture URLs) is a different domain concern and re-declares under the
  materials domain later, under its own id.
- `dxf-source` (file class): the CAD drawing exchange document —
  `application/dxf` payload (50 MB), preview mode `dxf` (renders through
  the shared drawing canvas). Home is here, not in documents: DXF is
  drawing vocabulary, and the nesting/cassette pipelines consume it as
  their drawing input.
- `svg-file` (file class): the vector drawing document —
  `image/svg+xml` payload (10 MB), preview mode `svg`. Kept with the
  vector-drawing family for drawing-canvas coherence.
- `sketch` (file class): freehand annotation scenes — the draw-over-image
  document (`{ version, background: { fileId, url } | null, strokes: [...] }`,
  the scene contract owned by `utils/sketch.js`). Payload is the JSON
  scene (`application/json`, 25 MB limit) with preview mode `sketch`, so
  instances render through `DrawingCanvas` in generated detail previews
  (see [components/generated/README.md](../../components/generated/README.md)).
  The type declares `revisions: 'scene'`, which makes the instance
  payload replaceable: the editor surface (`sketch-editor`, `edit` mode,
  creation protocol `editor`) saves scenes through
  `PUT /api/instances/sketch/:id/payload`, each save
  recording an immutable scene revision. The editor starts a blank scene
  on payload-less instances, so creation without an upload creator is
  simply first-save. The legacy artifact-bound `SketchEditor` component
  keeps serving `SKETCH`-kind artifacts through the same scene contract
  with an artifact-backed persistence adapter.

## Management surfaces

There are no bespoke pack pages. Instance management is declaration-
composed: a `typeList` screen over `pen-template` / `layer-standard`
with generic create/update actions, authored in the process designer
and rendered by the generator. The pen color field carries
`render.control: 'ColorPicker'`, which pins the generator's color
control (edit variants); pattern stays on the enum contract
(`EnumSelect`), display variants stay shape-derived.

## Instances

System pens/standards are seeded as §3 docs with `organizationId: null`
(system catalog, read-admitted in every org view). Org customization is
an org-authored `layer-standard` shadowing a system row by `code`;
consumers resolve org-shadow-before-system. Seeds are produced by the
server seed scripts (`server/scripts/seed-system-pens.js`,
`seed-layer-standards.js`) and the one-way legacy migration
(`migrate-tech-drawing-instances.js`).

## Validation

`npx vitest run packages/tech-drawing` — declaration compatibility with
the real CTS registry (compile + R1–R6) and the shadow-by-code
resolution contract.

## Related

- [packages/cts/SPEC.md](../cts/SPEC.md) §21 — pack contract,
  requirements, system instances.
- [server/packs/README.md](../../server/packs/README.md) — mount points.
- [stores/README.md](../../stores/README.md) — the client catalog
  accessors over the generic instance transport.
