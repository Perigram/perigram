# COMPONENT: @perigram/tech-drawing

The technical-drawing reference pack (SPEC §21): the OCCS/DXF drawing
vocabulary as declarations — pen templates and layer standards. Pure,
browser-safe declaration data; mounting is by composition — the pack
appears in [server/packs/declarations.js](../../server/packs/README.md)
and carries no service bindings.

## Types

- `pen-template` (file class): `name` plus the `stroke` record —
  `color` (hex string; the color-picker is render policy, not a value
  base), `weight: Quantity(mm)`, `pattern: Enum(solid|dashed|dotted)`.
  Replaceable reference values; no payload, no lifecycle beyond
  `archivable`.
- `layer-standard` (file class): `code` (the shadow key for org
  overrides), `category`, `group`, `kind`, `purpose`, `description`,
  `production`, `allowedGeometry`, `aliases`, `parameters`,
  `parameterSchema`, `defaultExport`, `i18n`, `source` — and the
  declared relation `defaultPen: one pen-template` (`onRemove:
  restrict`), the R2-legal home of the legacy `defaultPenId`.
- `sketch` (file class): freehand annotation scenes — the draw-over-image
  document (`{ version, background: { fileId, url } | null, strokes: [...] }`,
  the scene contract owned by `utils/sketch.js`). Payload is the JSON
  scene (`application/json`, 25 MB limit) with preview mode `sketch`, so
  instances render through `DrawingCanvas` in generated detail previews
  (see [components/generated/README.md](../../components/generated/README.md)).
  The type declares `revisions: 'scene'`, which makes the instance
  payload replaceable: the editor surface (`sketch-editor`, `edit` mode)
  saves scenes through `PUT /api/instances/sketch/:id/payload`, each save
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
