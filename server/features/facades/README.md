# FEATURE: Facades

`facade` is the project-scoped source of truth for a modeled building facade.
It references one immutable `FACADE_MODEL_SOURCE` GLB or self-contained GLTF
artifact and stores the selected source-model parts plus pattern assignments.

## Contract

- `lineage` is the canonical containment context supplied by the caller.
  Process creation composes `lineage.projectId` through the declared
  `project -> facade` containment relation. The facade service validates that
  context exists but neither infers nor rewrites it.
- `relations.sourceModel` is an artifact reference. The artifacts feature
  validates GLB bytes and rejects GLTF files with external buffers or images.
  Source files are immutable after upload.
- `data.parts[]` records the stable mesh keys discovered by the editor.
- `data.partAssignments[]` binds a part key to a `facade_pattern`, optional
  library/cassette references, mapping mode (`uv` or `planar`), parameters,
  and generated placement records.
- Each create or update resolves an immutable `entity_revision` with
  `scope: "layout"`. Facades do not create cassette designs, nesting runs, or
  production outputs.

## API and UI

`/api/facades` exposes ordinary authenticated CRUD. `FacadeDesigner` is the
entity-detail overload: it loads the immutable model in `ThreeViewport`, lets
the operator select a mesh part, and persists its facade-pattern assignment.
The component uses the shared `DesignerWorkspace` contract; it owns facade
semantics but not shell or renderer lifecycle behavior.

Process authors create a Facade with the generic Create Entity node. To place
the action in a project context, they compose the facade `lineage` block with
the declared `projectId` containment reference and connect that block to Create
Entity. The process compiler resolves this shared containment contract; facade
construction itself does not declare or infer a parent. The action prompts only
for a facade name. A source model is an ordinary `relations.sourceModel` artifact
reference, assigned through the facade API; it is not a process-construction input.

## Related

- [facade-patterns](../facade-patterns/README.md)
- [artifacts](../artifacts/README.md)
- [components/designers](../../../components/designers/README.md)
