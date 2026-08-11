# COMPONENT: Facade

`FacadeCard` presents a project-scoped facade and its persisted loose-part and
pattern-assignment counts. The operational editor is `FacadeDesigner`.

The card expects the v24 facade DTO, including `data.parts`,
`data.partAssignments`, the project lineage, and an optional immutable source
model relation. It does not infer manufacturing output from assignments.
