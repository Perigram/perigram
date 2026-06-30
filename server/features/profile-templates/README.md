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
  Designer-created templates resolve `organizationId` from the active auth
  organization or the first organization membership so cassette-scoped grants
  can authorize list, save, update, and delete operations.
- `data.kind`: `hanger`, `extruded_profile`, or `generic_profile`.
- `data.process`: `extruded`, `roll_formed`, `brake_formed`, or `machined`.
- `data.parameters`: simple profile metadata such as sweep length.
- `data.sketch`: editable numeric point/polyline/circle graph with endpoint
  snaps, typed segment-distance drawing helpers, explicit `closed` state for
  in-progress profile drawing, and per-corner fillet modifiers stored as
  `{ type: 'fillet', vertexId, radius }`. The designer saves a profile after at
  least three boundary points exist; open drawn boundaries are closed in the
  saved sketch/profile snapshot.
- `data.occsProfile`: normalized OCCS `profile.section` and `profile.sweep` snapshot.

Profile templates are reusable library records. Cassette Designer v2 does not
insert them as independent cassette graph workpieces; hanger features load a
saved template by id and store a geometry snapshot for reproducible
cut-in-parent rendering. Saving a system profile template from the designer
creates an owned copy because system templates are read-only.
Profile-template API access derives from the `cassettes` feature grants on the
template lineage. Service DTOs preserve the storage `_id` rather than the
identity UID so selectors can use the returned id for subsequent patch/load
requests. Older user-scoped templates without organization lineage are
normalized to the active membership organization in read DTOs when they belong
to the current user, which keeps previously saved profiles visible to the
cassette designer without making system templates editable.
Designer list/save requests include the active `cassetteTemplateId` when one is
available. The service loads that cassette and authorizes against the real
cassette entity so entity-id-scoped cassette grants work for profile template
save and dropdown fetches.
Creating a profile template is always allowed for the authenticated owner and
returns the service DTO directly; cassette access only scopes organization
lineage and shared/template visibility, not the ability to save a user's own
profile library entry.

## Migrations

- `server/scripts/migrate-profile-template-fillets.js --dry-run` previews the
  one-shot migration from legacy multi-vertex fillet modifiers to per-corner
  `vertexId` modifiers. Run without `--dry-run` to rewrite existing
  `profile_templates` documents and their normalized `data.occsProfile`
  snapshots.

## Related

- [OCCS utilities](../../../utils/occs/README.md)
- [Cassette Designer components](../../../components/README.md)
