# COMPONENT: Layer Standards

This feature manages the v24 layer-standard catalogue used by DXF imports,
drawing previews, cassette exports, and organization-level pen overrides.

## Scope

- Core files: `service.js`, `repository.js`, `model.js`
- Entry point: `index.js`
- Persistence: `layer_standards` and `layer_standard_overrides`
- Seed source: [docs/specs/Cassette spec/layers.json](../../../docs/specs/Cassette%20spec/layers.json)

## Data Contract

Layer standards are v24 entities. Canonical fields live under `data.*`; root
`code`, `category`, `defaultPenId`, and `orgPenId` are compatibility aliases
only when an older caller still emits them.

Important `data` fields:

| Field | Purpose |
|---|---|
| `code` | Canonical OCCS layer id such as `fold.route` or `contour.flat_pattern.face_and_returns`. |
| `category` / `group` | Uppercase UI category and raw OCCS group. |
| `kind`, `purpose`, `production` | OCCS semantic metadata used by export and tooling decisions. |
| `allowedGeometry` | Geometry types allowed on this layer. |
| `aliases`, `defaultExport` | CAD/export labels such as Russian DXF layer names and SVG classes. |
| `parameters`, `parameterSchema` | Names and raw OCCS parameter metadata for generated layer names. |
| `defaultPenId`, `orgPenId` | System pen default and organization override. These use the pen DTO id exposed by `/api/templates/pens` (`identity.uid` when present), not the raw Mongo `_id`. Overrides are merged into `data.orgPenId` by the API. |
| `source` | Registry version/id proving where seeded records came from. |

## Key Functions

- `getAll()`: Returns all standards as serialized `LayerStandard` DTOs.
- `seed(standards)`: Upserts standards by `data.code`; existing records are updated from the supplied source.
- `getByCategory(category)`: Filters by `data.category`.
- `getByCode(code)`: Finds a standard by `data.code`.
- `generateLayerName(standard, parameters, locale)`: Builds `{code}_{localizedName}` from a DTO or raw data object.
- `setOrgOverride()` / `removeOrgOverride()`: Manage per-organization pen overrides in `layer_standard_overrides`.

## Patterns

- System layer standards are marked public-read with `lineage.scope: "system"`,
  `lineage.public: true`, and `data.visibility.public: true`. The shared access
  engine reads that marker directly; process/user roles do not need
  `layer_standards` grants just to view the catalogue.
- `GET /api/layer-standards` is public-read. Unauthenticated callers receive
  the system/default catalogue without organization pen overrides; authenticated
  organization users receive the same standards with their org override merged
  into `data.orgPenId`.
- `repository.findByCode()` and the unique database index use `data.code`.
- Services return `Model.toJSON()` results and do not expose raw Mongo documents.
- Default layer standards are seeded from the OCCS registry through
  `server/scripts/occs-layer-standards.js`; do not duplicate hardcoded layer
  lists in feature code.
- Default pens are also assigned in that seed mapper: exact OCCS codes such as
  `cut.outer`, `fold.route`, and `dimension.cassette` get distinctive pens,
  with group-level fallback only for unknown future codes.
- Visual drawing code resolves pens from layer standards through canonical DTO
  fields first: `standard.data.code`, `standard.data.defaultPenId`,
  `standard.data.orgPenId`, and `pen.data.stroke`.

## Related

- [Pen Templates](../pen-templates/) - Default and override drawing pens.
- [Parametric Cassettes](../parametric-cassettes/) - Emits OCCS layer codes in generated DXF data.
- [Shared DrawingCanvas](../../../components/shared/README.md#drawingcanvasvue) - Resolves preview layers through this catalogue.
