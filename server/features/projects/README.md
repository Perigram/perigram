# COMPONENT: Projects

A project is an organization-owned production container. It has structured
`lineage.organization`, normal Status, safe project data, and queue summary
previews. Queues are children through the domain `project.queues` containment
relation.

Project libraries demonstrate non-owning relationships:

```js
relations: {
  libraries: [
    { entityType: 'library', entityId, revisionId? }
  ]
}
```

Linked libraries remain top-level library entities; they are rendered in the
project relation group and are not hidden as children. Creation accepts
`libraryIds` as ids or typed references and normalizes them into the root
relations block.

Generated top-level queue lists exclude queues with project lineage. Project
detail screens load those children through the same domain containment filter.
`listPreviewByProjects()` supplies queue identity/status/revision previews but
does not roll up stale sheet totals across nesting attempts.
