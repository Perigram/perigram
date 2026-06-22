# COMPONENT: Process Designer Nodes

Vue Flow node components for the organization process designer. The canvas is
moving toward executable process steps: action nodes describe creation, status
changes, command runs, and organization sends. Entity contracts, abstract
roles, and concrete user assignments are edited as process records in the
route-level side panel, then assigned onto action nodes, service/socket access
rules, and lifecycle transitions.

Each node type is visually and functionally distinct. All node components render
the Vue Flow selected state as a primary border/ring, and each process node type
uses a compact colored top stripe plus matching icon tint so the canvas can be
scanned without adding explanatory chrome:

- `ProcessEntityNode.vue` represents an entity contract. It exposes access,
  service-input, and socket-projection handles and summarizes lifecycle mode,
  selected field policy count, inline lifecycle states, transition count, and
  the explicit public/write data contract exposed by the entity profile.
- `ProcessActionNode.vue` represents an executable process step. It exposes
  event trigger input, data input/output, and completion event output handles on
  the node sides. The node owns inline editing for action access level,
  access-granted roles, trigger mode, command selection, target status,
  creation target, and projection fields. The action kind is fixed by the
  palette item that created the node and is displayed as a compact verb such as
  `create` or `service`. Create actions derive their parent from the incoming
  data socket instead of a parent-type selector, status-change actions consume
  an incoming entity without selecting an entity type, command actions show
  command entity inputs/outputs, and organization-send actions show the
  projected output fields.
- `ProcessServiceNode.vue` represents a command-backed service. It exposes
  service-identity access, typed input, and output handles and summarizes
  exact command inputs and outputs as labeled sockets in the same
  expected/produced visual contract as action nodes.
- `ProcessSocketNode.vue` represents cross-organization entity projection. It
  exposes entity-projection, transfer, and receiver-role handles and summarizes
  direction plus the expected entity input and produced projected field set.

Entity, service, and socket nodes remain process-resource surfaces, while
action nodes are directly editable because most process behavior belongs on the
executable step itself. The route-level designer still owns process record
mutation, role and user assignment records, inline lifecycle workflow mutation,
compiler fields, and Vue Flow edge persistence. Role or user node components
should not be added to the palette; roles stay reusable process metadata
instead of layout objects.
Input and output data is not rendered as a detached summary and nodes do not
label columns as "inputs" or "outputs". Data flow is left-to-right: expected
data is labeled on left handles, and produced data is labeled on right handles.
Event flow also uses side sockets: an `event` trigger enters the left side of
an action and the action completion event leaves the right side in a separated
bottom band. Action nodes expose only two trigger modes: `manual`, which creates
a user-facing action for roles granted through `action.access`, and `event`,
which runs automatically from another node's event edge. Service identities
remain service access records, not manual trigger choices. Multi-socket command
nodes derive handle ids from the socket contract.

Status action grants use the same access row as create actions. The grant is
conditioned by the incoming entity status and target status: the designer stores
`action.access.statusFrom` and `action.access.statusTo` from the graph or
explicit status fields, and the compiler emits transition metadata plus a
target-status access rule. The access row grants access to the resulting entity
status, not to the trigger. The role selector lists process roles directly
because selecting a role on an action creates the grant; entity-profile grants
must not hide roles from action grant authoring. Action nodes also render
compact effective-access chips for roles that already have matching entity
access from entity profiles or other status/action grants.

Command sockets should expose abstract domain contracts when a command is
polymorphic. For example, `generateAttachment` presents one `Attachment source`
socket with `attachments.generate` capability and accepted source types instead
of separate `sheet_design` and `nesting_run` sockets.

New process behavior should use `runCommand` and `sendToOrganization` action
nodes. Archive is represented as a `changeStatus` action targeting an archive
status, not as a separate node type.
