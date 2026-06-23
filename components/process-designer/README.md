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
  creation target, update fields, and projection fields. The action kind is fixed by the
  palette item that created the node and is displayed as a compact verb such as
  `create`, `update`, or `service`. Create actions derive their parent from the incoming
  data socket instead of a parent-type selector, update actions consume an
  incoming entity and expose selected mutable data fields as left-side data
  sockets, status-change actions consume
  an incoming entity without selecting an entity type or editing the existing
  status, command actions show command entity inputs/outputs, and
  organization-send actions show the projected output fields. Create actions
  derive their left-side data sockets from the domain construction contract:
  promptable constructor inputs become generated-screen dialog fields, and
  typed derived entities such as `cassette_design` keep their construction mode
  on the action record instead of pretending they are generic inserts.
  Update actions derive promptable editor fields from the selected mutation
  paths, so a manual modify action can collect the new data values before it
  calls the active process action runtime.
- `ProcessStatusDefinitionNode.vue` represents a reusable status value for the
  same canvas. Connecting it to a create or status-change action writes the
  action target state and lets the compiler apply status label/color/icon
  metadata to the generated workflow.
- `ProcessValueInputNode.vue` represents a scalar/object default value. Wiring
  it into a construction data socket binds that value as the generated action
  prompt default for the matching construction field.
- `ProcessServiceNode.vue` represents a command-backed service. It exposes
  service-identity access, typed input, and output handles and summarizes
  exact command inputs and outputs as labeled sockets in the same
  expected/produced visual contract as action nodes.
- `ProcessSocketNode.vue` represents cross-organization entity transfer.
  Outbound socket nodes consume an entity on the left and produce a projected
  payload on the right. Inbound socket nodes represent receiver inputs from
  another organization and produce the received entity on the right. Direction
  decides whether send-role or receive-role access is summarized.

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

Status-change action grants edit access for the exact entity type carried by
the incoming data edge, not generic entity access and not status access. During
node sync the designer derives the entity type and existing status from the
wired source socket, stores `action.access.statusFrom` and
`action.access.statusTo`, carries that same entity type to the output socket,
and labels both data sockets with the concrete type. By default the node
inherits access level and roles from the incoming entity-producing node; editing
the access controls marks the node as explicitly modified, and the reset button
restores the inherited parent access. Unwired status-change nodes do not invent
a generic access target. The compiler emits transition metadata plus a
target-state rule on the entity grant. The role selector lists process roles
directly because selecting a role on an action creates the entity grant;
entity-profile grants must not hide roles from action grant authoring. Action
nodes also render compact role/level chips for inherited access and roles that
already have matching entity access from entity profiles or other status/action
grants.

Canvas wires are selectable edges. `Delete` / `Backspace` removes the selected
node or selected wire, and runtime edge selection styling is stripped before
process serialization.

Command sockets should expose abstract domain contracts when a command is
polymorphic. For example, `generateAttachment` presents one `Attachment source`
socket with `attachments.generate` capability and accepted source types instead
of separate `sheet_design` and `nesting_run` sockets.

New process behavior should use `createEntity`, `updateEntity`, `changeStatus`,
`runCommand`, `sendToOrganization`, status-definition nodes, value-input nodes,
and inbound/outbound socket nodes. Archive is represented as a `changeStatus`
action targeting an archive status, not as a separate node type. Entity naming
is a construction input: generated create actions prompt for the domain
contract's name field or consume a connected value-input default; they should
not create unnamed records unless the entity contract explicitly allows it.
