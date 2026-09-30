# COMPONENT: Cassette Templates

Cassette is a file type, full stop (SPEC §13 / the facade SPEC): records
ride the generic per-class instance service in the `files` collection —
CRUD, tenancy, payload storage, access gating, and the geometry revision
chain are the generic machinery's contract. The OCCS template document is
the payload (§3 blob home, GridFS `files` bucket) and the only home.
PARAMETRIC templates carry an OCCS payload; STANDARD templates carry the
uploaded DXF payload plus their extracted geometry fields.

## Module map

- `service.js` — the pack's domain operations over the generic service:
  `importFromArtifact` (a `DXF_SOURCE` artifact → STANDARD template: the
  DXF becomes the payload, the extracted cut contour and mapped semantic
  layers become stored fields), `exportDxf` (PARAMETRIC evaluates its
  payload once under the serial evaluation lock; STANDARD exports its
  stored layers), and `cassetteDefinition` (the payload read every
  consumer shares — bake, evaluation, previews).
- `operations.js` — the `saveCassetteTemplate` command: create patches
  through the generic service with the OCCS document uploaded as the
  payload; updates patch fields and replace the payload (revisioned by the
  generic `revisions: 'geometry'` machinery).
- `evaluation.js` — OCCS payload evaluation (`evaluateTemplate` under a
  serial lock) and `generateSimpleDxf` (flat AC1015 polyline DXF).
- `cassette-design-construction.js` — the cassette-design construction
  modes (upload/bake/convertDxf); the bake resolves its template through
  the generic service and reads the OCCS document from the payload.

## Stored shape (§3)

Per-class `files` collection, `type: 'cassette'`, declared fields:
`name` (identifier), `templateType` (`PARAMETRIC`/`STANDARD`), `parameters`
(parameter names), `mapping`/`polygonParts`/`layerData` (STANDARD import
outputs, `constructible: false`), payload slot = the OCCS/DXF document,
`revisions: 'geometry'` on payload replacement.

Legacy `cassettes`-collection documents migrate one-way through
`server/scripts/migrate-cassette-instances.js` (ids preserved; inline
definitions upload to the payload bucket).

## Construction

Creation protocol `editor` (the generic editor mode): blank-create opens
the cassette designer; the first save fills the payload. STANDARD
templates also arrive through the artifact conversion
(`convertArtifact` `dxfSourceToCassette`) and `POST /api/cassettes/import`.
