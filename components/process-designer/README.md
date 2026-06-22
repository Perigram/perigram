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
  selected field policy count, inline lifecycle states, transition count, and
  the explicit public/write data contract exposed by the entity profile.
- `ProcessActionNode.vue` represents an executable process step. It exposes
  trigger, input, and output handles and summarizes action kind, trigger mode,
  assigned trigger role names, and exact typed socket labels derived from
  entity/status/command settings. Create actions show parent inputs when
  configured, status-change actions show source and target status contracts,
  command actions show command entity inputs/outputs, and organization-send
  actions show the projected output fields.
- `ProcessServiceNode.vue` represents a command-backed service. It exposes
  run-role, typed input, and output handles and summarizes exact command inputs
  and outputs as labeled sockets in the same expected/produced visual contract
  as action nodes.
- `ProcessSocketNode.vue` represents cross-organization entity projection. It
  exposes entity-projection, transfer, and receiver-role handles and summarizes
  direction plus the expected entity input and produced projected field set.

The node components remain display-only. The route-level designer owns the
process record mutation, role and user assignment records, action records,
inline lifecycle workflow mutation, compiler fields, and Vue Flow edge
persistence. Legacy role or user node components should not be added to the
palette; active drafts load without those nodes so roles can stay reusable
process metadata instead of layout objects.
Input and output data is not rendered as a detached summary and nodes do not
label columns as "inputs" or "outputs". Data flow is left-to-right: expected
data is labeled on left handles, and produced data is labeled on right handles.
Trigger/access/event flow is top-to-bottom: user/system/event triggers,
service run access, and receiver access are labeled on top handles. Single data
socket nodes keep `input`/`output` handle ids for saved-edge compatibility;
multi-socket command nodes derive handle ids from the socket contract.

Command sockets should expose abstract domain contracts when a command is
polymorphic. For example, `generateAttachment` presents one `Attachment source`
socket with `attachments.generate` capability and accepted source types instead
of separate `sheet_design` and `nesting_run` sockets. Concrete runtime inputs
may remain in the command definition for compatibility, but the designer should
prefer abstract socket metadata.

Service and socket node components remain for compatibility with saved drafts,
but new process behavior should use `runCommand` and `sendToOrganization`
action nodes. Archive is represented as a `changeStatus` action targeting an
archive status, not as a separate preferred node type.
