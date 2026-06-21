# COMPONENT: Process Designer Nodes

Vue Flow node components for the organization process designer.

Each node type is visually and functionally distinct:

- `ProcessRoleNode.vue` represents an abstract process role. It exposes
  assignment, entity-access, and service-capability handles and shows explicit
  grant count.
- `ProcessEntityNode.vue` represents an entity contract. It exposes access,
  service-input, and socket-projection handles and summarizes lifecycle mode
  plus selected field policy count.
- `ProcessServiceNode.vue` represents a command-backed service. It exposes
  run-role, typed input, and output handles and summarizes command inputs and
  outputs.
- `ProcessSocketNode.vue` represents cross-organization entity projection. It
  exposes entity-projection, transfer, and receiver-role handles and summarizes
  direction plus projected fields.
- `ProcessUserNode.vue` represents a concrete assignment target. It connects to
  role nodes through the assignment handle and shows assigned role count.

The node components remain display-only. The route-level designer owns the
process record mutation, compiler fields, and Vue Flow edge persistence.
