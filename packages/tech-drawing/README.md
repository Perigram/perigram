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
