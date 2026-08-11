# COMPONENT: Artifact Template UI

`ArtifactTemplateCard.vue` is the design-system card for the
`artifact_template` entity. It delegates identity/chrome to `EntityCard` and
DTO-backed fields to `EntitySurfaceContent`; management actions are supplied by
the owning page through the footer slot.

`pages/assets/templates.vue` owns the organization template workflow: list,
DXF/PDF upload, source download, layout editor dialog, and the shared
access-derived delete action. `components/ArtifactLayoutEditor.vue` is reused
for both template layout revisions and generated artifact layout revisions. It
edits exact translation values, deletion state, and typed text variables without
performing persistence itself.

## Related

- [Artifact template backend](../../../server/features/artifact-templates/README.md)
- [Shared design system](../../shared/README.md)
