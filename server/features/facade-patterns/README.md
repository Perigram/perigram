# FEATURE: Facade Patterns

`facade_pattern` is an organization-owned reusable geometric-pattern source.
It stores a safe typed graph document, never executable user JavaScript.

## Contract

- `data.graph` uses schema version 1 with unique node ids and acyclic edges.
- Supported nodes cover scalar/vector sources, transforms, series/grid/stagger
  layout, clipping and surface mapping, mesh-part input, cassette selection,
  and placement output.
- The service validates the graph before persistence and records its immutable
  `algorithm` revision. A facade assignment pins the chosen pattern revision.
- Pattern graphs describe visual placement only. They do not bake cassette
  designs or initiate nesting.

## API and UI

`/api/facade-patterns` exposes organization-scoped CRUD. Its entity detail
overload opens `FacadePatternDesigner`, a Vue Flow editor built on the shared
`DesignerWorkspace` canvas layout. The browser editor persists graph nodes,
edges, and positions; server validation remains authoritative.

## Related

- [facades](../facades/README.md)
- [components/designers](../../../components/designers/README.md)
