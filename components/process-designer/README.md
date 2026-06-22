# COMPONENT: Process Designer Nodes

Vue Flow node components for the organization process designer. The canvas is
moving toward executable process steps: action nodes describe creation, status
changes, command runs, and organization sends. Entity contracts, abstract
roles, and concrete user assignments are edited as process records in the
route-level side panel, then assigned onto action nodes, service/socket access
rules, and lifecycle transitions.

Each node type is visually and functionally distinct:

- `ProcessEntityNode.vue` represents an entity contract. It exposes access,
  service-input, and socket-projection handles and summarizes lifecycle mode,
  selected field policy count, inline lifecycle states, and transition count.
- `ProcessActionNode.vue` represents an executable process step. It exposes
  trigger, input, and output handles and summarizes action kind, trigger mode,
  assigned trigger role names, and exact typed I/O derived from
  entity/status/command settings.
- `ProcessServiceNode.vue` represents a command-backed service. It exposes
  run-role, typed input, and output handles and summarizes exact command inputs
  and outputs.
- `ProcessSocketNode.vue` represents cross-organization entity projection. It
  exposes entity-projection, transfer, and receiver-role handles and summarizes
  direction plus projected fields.

The node components remain display-only. The route-level designer owns the
process record mutation, role and user assignment records, action records,
inline lifecycle workflow mutation, compiler fields, and Vue Flow edge
persistence. Legacy role or user node components should not be added to the
palette; active drafts load without those nodes so roles can stay reusable
process metadata instead of layout objects.
Service and socket node components remain for compatibility with saved drafts,
but new process behavior should use `runCommand` and `sendToOrganization`
action nodes. Archive is represented as a `changeStatus` action targeting an
archive status, not as a separate preferred node type.
