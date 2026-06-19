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
- `data.parameters`: expression defaults used by the sketch.
- `data.sketch`: editable point/line/circle/modifier graph.
- `data.occsProfile`: normalized OCCS `profile.section` and `profile.sweep` snapshot.

## Related

- [OCCS utilities](../../../utils/occs/README.md)
- [Cassette Designer components](../../../components/README.md)
