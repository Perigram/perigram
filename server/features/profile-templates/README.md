# COMPONENT: Profile Templates

Reusable OCCS profile-section templates for cassette hangers and extruded
profiles.

## Core Files

- `service.js`: validates sketch/profile payloads and exposes CRUD operations.
- `repository.js`: MongoDB access for `profile_templates`.
- `model.js`: `BaseEntity` DTO wrapper.
- `index.js`: public service namespace export.

## Data Structure

Collection: `profile_templates`

Key fields:
- `identity.name`: display name.
- `lineage.userId` / `lineage.organizationId`: owner scope; both null means system profile.
- `data.kind`: `hanger`, `extruded_profile`, or `generic_profile`.
- `data.process`: `extruded`, `roll_formed`, `brake_formed`, or `machined`.
- `data.parameters`: simple profile metadata such as sweep length.
- `data.sketch`: editable numeric point/polyline/circle graph with endpoint
  snaps, typed segment-distance drawing helpers, explicit `closed` state for
  in-progress profile drawing, and per-corner fillet modifiers stored as
  `{ type: 'fillet', vertexId, radius }`. The designer saves or inserts a
  profile after at least three boundary points exist; open drawn boundaries are
  closed in the saved sketch/profile snapshot.
- `data.occsProfile`: normalized OCCS `profile.section` and `profile.sweep` snapshot.

## Migrations

- `server/scripts/migrate-profile-template-fillets.js --dry-run` previews the
  one-shot migration from legacy multi-vertex fillet modifiers to per-corner
  `vertexId` modifiers. Run without `--dry-run` to rewrite existing
  `profile_templates` documents and their normalized `data.occsProfile`
  snapshots.

## Related

- [OCCS utilities](../../../utils/occs/README.md)
- [Cassette Designer components](../../../components/README.md)
