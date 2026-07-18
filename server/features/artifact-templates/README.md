# COMPONENT: Artifact Templates

Organization-scoped, revision-backed templates used to generate typed artifact
files. `artifact_template` is master data; generated files remain `artifact`
entities. A template never doubles as a generated artifact.

## Contract

- `attachments.source` owns the uploaded DXF or PDF in the
  `artifactTemplates` GridFS bucket.
- `data.format` is `DXF` or `PDF`.
- `data.layout` contains normalized pages and stable items with positions,
  optional translation, deletion state, and an optional typed variable for text.
- `data.variables` projects declared variables for command and manual forms.
- `data.activeRevisionId` and `data.revisions.layout` point to the immutable
  `entity_revision` snapshot for the current layout.

DXF ingestion records stable entity handles and preview geometry. Rendering
applies translation, deletion, and text substitution to matching source records,
so unrelated or unsupported DXF records are preserved. PDF ingestion extracts
positioned text items. Rendering preserves every uploaded page and masks/redraws
only text items that were moved, deleted, or declared as variables.

## Service Boundary

The feature owns persistence, source-file access, parsing, layout replacement,
revision creation, and rendering. Artifacts call its public service to render a
pinned revision; they do not access the template collection or bucket directly.

Layout replacement validates item ids and variable types before creating the
revision, then updates layout and revision pointer in one repository write.
Template deletion removes the entity first and treats subsequent blob cleanup
as best effort, avoiding a live entity that points at a deliberately deleted
file.

## APIs

- `GET /api/artifact-templates`
- `POST /api/artifact-templates` — multipart DXF/PDF upload
- `GET /api/artifact-templates/:id`
- `PUT /api/artifact-templates/:id` — replace normalized layout
- `DELETE /api/artifact-templates/:id`
- `GET /api/artifact-templates/:id/source`

All operations use `artifact_templates` process-derived access. Starter process
templates grant their administrator role management access; organization
process definitions remain the authority for custom roles.

## Related

- [Artifacts](../artifacts/README.md)
- [Entity revisions](../entity-revisions/README.md)
- [API routes](../../api/README.md)
- [Artifact template UI](../../../components/entities/ArtifactTemplate/README.md)
