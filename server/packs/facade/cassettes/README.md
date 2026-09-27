# COMPONENT: Cassette Templates (v24 Standardized)

Manages cassette templates (Standard and Parametric). A cassette is the single
geometry-bearing record: the editable logic, the immutable geometry revision
chain, and — for uploaded templates — the extracted nestable contour and
semantic layers all live on the cassette document. There is no separate baked
design record; evaluation and export render from the template.

## Core Files
- `repository.js`: Database operations on `cassettes` collection.
- `service.js`: Template management and permission handling.
- `operations.js`: Domain operation handler for process-invoked cassette saves.
- `evaluation.js`: PARAMETRIC template geometry evaluation and simple DXF rendering.

## Evaluation

PARAMETRIC templates evaluate on demand — there is no baked record and no
separate evaluation feature. `evaluateTemplate(id, dimensions)` loads the
cassette through the feature's own repository, unwraps the stored
definition container, and, when it is an OCCS document, delegates to the
OCCS evaluator (`#utils/occs/evaluate.js`) — the OCCS graph tree is the
one construction contract, evaluated in pure JS under a serial evaluation
lock. A definition that is not an OCCS document is legacy data: the
evaluation refuses it (422) with a recreate-as-OCCS message instead of
falling back to a removed engine. `generateSimpleDxf(polygons)` renders
the flat AC1015 polyline DXF used when a definition carries no layered
`layerData`; layered exports render through the same service's
`generateLayeredDxf`.

## Data Structure (v24)

- **`identity`**: `{ slug, name, serial, reference }`
- **`status`**: Current snapshot [StatusBlock].
- **`origin`**: Creation snapshot [StatusBlock].
- **`lineage`**: `{ organizationId, libraryId? }`
- **`data.type`**: `PARAMETRIC` | `STANDARD`
- **`data.definition`**:
    - Parametric templates store either the legacy designer graph
      `{ params, extrusions }` or an OCCS v2 template document with
      `extensions.perigram.graphTree`.
    - Standard uploaded templates store layer mapping data such as `{ mapping }`.
- **`data.parameters`**: Array<String> of configurable variable names.
- **`data.polygonParts` / `data.layerData`**: (STANDARD uploads) the extracted
  closed `cut.outer` contour and mapped semantic layer curves. These are the
  nestable geometry and the preview/export source of truth.
- **`data.revisions.geometry`**: Current immutable geometry revision pointer
  `{ currentId, number, contentHash }` maintained by the service after template
  create/update/upload.

`Cassette.toJSON()` hoists `type`, `definition`, and `parameters` for frontend compatibility. Frontend cards, thumbnails, and editors read those hoisted fields first. Older records may also carry `data.params` / `data.extrusions` directly; the model normalizes that legacy graph into `definition`.

## Key Workflows

### Digital Intent and Geometry on One Record
Templates in the `cassettes` collection do NOT store DXF files or physical
tracking data.
- **Parametric**: `data.definition` contains the editable legacy designer graph
  or an OCCS v2 template document; geometry is evaluated on demand by this
  feature's `evaluation.js` (see Evaluation below) for export.
- **Standard**: `data.definition.mapping` contains the DXF-to-OCCS semantic
  layer mapping; the extracted `data.polygonParts` and `data.layerData` are the
  template's own geometry.

Every template save resolves an `entity_revision` with `scope: "geometry"` from
`data.type`, `data.definition`, and `data.parameters`. The template stores only
the current pointer under `data.revisions.geometry`; the immutable source
snapshot lives in `entity_revisions`.
Revision identities include the cassette source id, so separate templates can
each create geometry revision 1 without colliding.

### Template Export
`GET /api/cassettes/:id/export` is the DXF export boundary for both template
kinds. Parametric exports evaluate the template (evaluated `layerData` when
available, so folds, marks, dimensions, and cut layers are preserved instead of
emitting only the nestable contour). STANDARD exports render the template's own
`layerData`/`polygonParts` through the layered DXF writer and 404 when the
template carries no geometry.

### Process Construction
Process `createEntity` actions target the ordinary cassette service; cassette
creation has no alternate process construction mode. The service stores the
supplied OCCS definition or creates the default OCCS v2 graph-tree document
from `utils/occs/templates.js`,
including the standard parameter list and geometry revision pointer. A
process-created template therefore opens in `CassetteDesignerV2` with an
editable OCCS document instead of `data.definition: null`.
Supplied definitions are validated as OCCS before persistence; arbitrary data
objects cannot create a cassette record that the designer cannot open.
If the graph action has a `library` parent input, process execution passes
`libraryId` into the typed constructor and the cassette service persists it
under `lineage.libraryId`. A parent-scoped process action must provide that
parent id; the process runtime rejects the action before calling this service
when the compiled parent input is missing.

`GET /api/cassettes` is the generated-screen list boundary for cassette
templates. It must forward lineage filters such as `libraryId` to
`cassetteService.list()`; the service normalizes them to `lineage.*` repository
filters and then applies per-entity access pruning. A library detail child
region therefore requests `/api/cassettes?libraryId=<library-id>` and receives
only templates whose `lineage.libraryId` matches that opened library.
`listPreviewByLibraries()` is the library-card summary snapshot path used by
generated screens. Those `summary.cassettePreview[]` entries must include the
thumbnail-critical cassette fields that `CassetteThumbnail` consumes:
`data.definition`, `data.layerData`, and
`data.polygonParts`, in addition to identity/status metadata. Returning only an
id plus light summary data breaks inline cassette previews inside library child
galleries because `InstanceInlineRef` intentionally reuses the provided entity
snapshot before issuing another fetch.

### DXF Upload
`POST /api/cassettes/upload` (multipart file) and `POST /api/cassettes/import`
(JSON `artifactId`, the two-step companion used by the sheet editor's upload
dialog) both call `importFromArtifact()`. One mapped DXF layer must resolve to
`cut.outer`: the service extracts closed polygons from that layer into the
created cassette's `data.polygonParts`, and other mapped layers are extracted
as open or closed curve `data.layerData`, so nesting and sheet-design previews
consume the template directly. Both endpoints return the created template DTO.

### Update Operations
- The generated designer mounts persist through the instance transport
  (see [components/generated/README.md](../../../../components/generated/README.md)):
  the OCCS document is the file payload, and the designer emits its document
  to the mounting surface. The legacy direct-REST designer path died with the
  cassette manager. These routes remain for the pack-internal pipeline
  (export, DXF upload/import) and the sheet editor's cassette upload dialog.
- **`updateLayerMapping`**: Updates the mapping between DXF layers and production tools/standards.
- **`updateParameters`**: Updates the list of configurable parameters for the template.

### Permission Model
Access is governed by `lineage.organizationId` and status-scoped process
grants. Multi-tenant isolation is enforced at the service layer using
`hasLineagePermission` with the full cassette DTO, not only its lineage block,
so rules such as `primaryState = ACTIVE` apply to both collection and detail
reads. `GET /api/cassettes` accepts the generated-screen `primaryStates`
filter and then prunes results through the same read check used by
`GET /api/cassettes/:id`; a generated list must not show a template whose
detail page would return 403. Single-template reads must also pass the full
cassette entity to the access evaluator; passing only `cassette.lineage` drops
status data and breaks process grants scoped to statuses such as `CREATED2`.
Lineage query aliases such as `libraryId` are normalized to `lineage.*`
filters before repository access.
This keeps generated or authored screen filters scoped to actual lineage
fields instead of accidentally matching root-level compatibility fields.
Mutation paths such as template update, layer mapping, parameter update, and
delete must pass the full cassette DTO/model to `hasLineagePermission()`, not
only `cassette.lineage`, because process grants can be scoped by current
status. A generated cassette designer save for a `CREATED` template therefore
uses the same status-scoped grant as the detail read.
Creation evaluates the candidate lineage together with the initial process
status, so a role granted cassette writes in `NEW` can create or Save As a
template through the cassette entity endpoint.

## Related
- [instance-revisions](../../../features/instance-revisions/README.md) - Immutable source revision snapshots.
- [artifact-conversions](../../../features/artifact-conversions/README.md) - DXF-source artifact to cassette conversion.
