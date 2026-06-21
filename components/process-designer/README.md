# COMPONENT: Process Designer Nodes

Vue Flow node components for the organization process designer. The canvas
contains process objects only: entities, services, and sockets. Abstract roles
and concrete user assignments are edited as process records in the route-level
side panel, then assigned onto nodes and lifecycle transitions.

Each node type is visually and functionally distinct:

- `ProcessEntityNode.vue` represents an entity contract. It exposes access,
  service-input, and socket-projection handles and summarizes lifecycle mode,
  selected field policy count, inline lifecycle states, and transition count.
- `ProcessServiceNode.vue` represents a command-backed service. It exposes
  run-role, typed input, and output handles and summarizes command inputs and
  outputs.
- `ProcessSocketNode.vue` represents cross-organization entity projection. It
  exposes entity-projection, transfer, and receiver-role handles and summarizes
  direction plus projected fields.

The node components remain display-only. The route-level designer owns the
process record mutation, role and user assignment records, inline lifecycle
workflow mutation, compiler fields, and Vue Flow edge persistence. Legacy role
or user node components should not be added to the palette; active drafts load
without those nodes so roles can stay reusable process metadata instead of
layout objects.
