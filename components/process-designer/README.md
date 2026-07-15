# COMPONENT: Process Designer Nodes

Vue Flow node components for the organization process designer. The canvas is
centered on executable process steps: action nodes describe creation, unified
entity mutation, and command runs. Entity contracts, transfer ports, abstract
roles, and concrete user assignments are edited as process records in the
route-level side panel, then assigned onto action nodes, service/socket access
rules, and lifecycle transitions.

Each node type is visually and functionally distinct. All node components render
the Vue Flow selected state as a primary border/ring, and each process node type
uses a compact colored top stripe plus typed socket handles so the canvas can
be scanned without adding explanatory chrome. Socket row backgrounds stay on
theme surfaces; handle colors carry the contract distinction: entity sockets
are blue, canonical block sockets are cyan, data/value sockets are green,
status sockets are amber, event sockets are violet, projected transfer payloads
are fuchsia, attachments are orange, and task outputs are neutral.

- `ProcessEntityNode.vue` represents an entity contract. It exposes left-side
  standard block/status sockets that can accept status and block nodes, and
  right-side entity/block sockets that downstream action nodes can consume. The
  node summarizes lifecycle states, transition count, and the explicit
  public/write data contract exposed by the entity profile.
- `ProcessActionNode.vue` represents a compact executable process step. It exposes
  event trigger input, data input/output, and completion event output handles on
  the node sides. Detailed editing belongs to the focused route-level inspector;
  the canvas node shows only its identity, typed sockets, access/status summary,
  and trigger contract. The action kind is fixed by the
  palette item that created the node and is displayed as a compact verb such as
  `create`, `mutate`, or `service`. Create actions derive their parent from the incoming
  data socket instead of a parent-type selector. The optional parent socket is
  always visible so it can be connected; root create actions keep it generic and
  compile without a parent until a concrete entity edge is wired. Mutation actions consume an
  incoming entity and expose live domain fields as left-side sockets; only
  connected sockets are persisted. An optional Status socket on the same action
  performs the workflow transition through the Status runtime. Command actions
  show command entity inputs/outputs. Create actions
  derive their left-side data sockets from the domain construction contract:
  promptable constructor inputs become generated-screen dialog fields, and
  typed derived entities such as `cassette_design` keep their construction mode
  on the action record instead of pretending they are generic inserts.
  A parent wire is accepted as a canvas authoring socket, but the compiler only
  treats it as semantic when the connected entity is a valid domain lineage
  parent. Constructor entity inputs such as a cassette-design `templateId`
  remain data/constructor sockets, not create-action parents.
  Mutation actions derive promptable editor fields from selected domain field
  policy entries, so a manual modify action collects values for concrete fields
  instead of free-form paths before it calls the active process action runtime.
  Status-targeting mutations use the target status definition label, or the target
  state id when no label exists, as the node's primary title. Generic palette
  labels such as `status` or stale `Action` values are ignored in this mode so
  the canvas reads as the actual transition being authored.
- `ProcessStatusDefinitionNode.vue` represents an entity-agnostic reusable
  status value for the same canvas. The node renders the same PrimeVue status
  tag shape that the resulting status uses, and its inspector edits status id,
  optional label, severity, icon, and lifecycle evidence requirements. New
  status nodes start from a neutral `STATUS` id and no label rather than
  inventing a domain state such as `Created`. Connecting it to an entity node
  adds the state to that entity lifecycle; connecting it to a create or
  status-targeting mutation writes the action target state and lets the compiler
  apply status label/color/severity/icon metadata plus lifecycle evidence schema
  to the generated workflow, compiled action status, and runtime
  `status.metadata.display` payload used by generated screens. Evidence
  requirements are stored on the status definition as `lifecycle.description`,
  `lifecycle.attachments`, and `lifecycle.snapshots`; runtime status actions
  collect descriptions/proof files and capture declared snapshots when entering
  that state. The inspector does not render the generic node label for
  status-definition nodes; the explicit status label field is the only display
  label, and the node itself renders a single badge with no separate socket
  text.
- `ProcessValueInputNode.vue` represents a canonical block value
  (`identity`, `data`, `specs`, `summary`, `attachments`, or status metadata).
  Wiring it into an entity node adds that canonical path to the entity field
  policy. Wiring it into a construction data socket binds that value to the
  matched construction field, while wiring it into an update action adds the
  block path as a concrete mutation field. Empty update actions expose a generic
  field socket until the first block is connected; after that the node displays
  exact mutation sockets using domain field labels.
- `ProcessNode.vue` represents non-effect process algebra records. Entity
  reference nodes traverse entity relations. Blocks nodes decompose an incoming
  entity into canonical DTO block sockets (`identity`, `status`, `lineage`,
  `relations`, `data`, `specs`, `summary`, and `attachments`). Block/field read
  nodes expose typed values; block/entity assemble nodes reconstruct canonical
  values using the selected entity definition. Whole blocks use object/JSON
  sockets, never free-text placeholders. Text, comparison, logic, and collection
  nodes transform typed values without mutating persistent state; mutations and
  external work stay on action nodes. Each node keeps the palette icon on the
  canvas, while socket handle colors come from the socket data type rather than
  the node kind.
- `ProcessServiceNode.vue` represents a command-backed service. It exposes
  service-identity access, typed input, and output handles and summarizes
  exact command inputs and outputs as labeled sockets in the same
  expected/produced visual contract as action nodes.
- `ProcessSocketNode.vue` represents cross-organization entity transfer.
  Outbound socket nodes consume an entity on the left and produce a projected
  payload on the right. Inbound socket nodes represent receiver inputs from
  another organization and produce the received entity on the right. Direction
  decides whether send-role or receive-role access is summarized as chips on
  the node; access is not a graph socket.

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
Sockets render a single contract label; required/multiple/path metadata belongs
to the semantic record and generated runtime contract, not duplicate second-line
canvas text.
Event flow also uses side sockets: an `event` trigger enters the left side of
an action and the action completion event leaves the right side in a separated
bottom band. Action nodes expose only two trigger modes: `manual`, which creates
a user-facing action for roles granted through `action.access`, and `event`,
which runs automatically from another node's event edge. Service identities
remain service access records, not manual trigger choices. Multi-socket command
nodes derive handle ids from the socket contract.

Status-targeting mutation grants edit access for the exact entity type carried by
the incoming data edge, not generic entity access and not status access. During
node sync the designer derives the entity type and existing status from the
wired source socket, stores `action.access.statusFrom` and
`action.access.statusTo`, carries that same entity type to the output socket,
and labels both data sockets with the concrete type. By default the node
inherits role-level grants from the incoming entity-producing node; editing
the access controls marks the node as explicitly modified, and the reset button
restores the inherited parent access. Each action access row is a process-role
dropdown plus an access level (`read`, `write`, or `admin`), so one action can
grant different levels to different roles without promoting all roles to the
highest level. Unwired mutation nodes do not invent a generic access
target. The compiler emits transition metadata plus a target-state rule on the
entity grant. The role selector lists process roles directly because selecting
a role on an action creates the entity grant;
entity-profile grants must not hide roles from action grant authoring. Action
nodes also render compact role/level chips for inherited access and roles that
already have matching entity access from entity profiles or other status/action
grants.

Node components must not embed concrete domain entity names. Domain-specific
construction modes, entity lists, feature keys, and stale-label cleanup are
owned by the route-level domain registry and process compiler. Status-definition
nodes only decide whether to display the authored label or the status id; they
do not know which entity types exist.

The route-level process designer computes a live compiled preview from the
current graph after node, edge, role, and screen edits. The service-identity
editor is not a top-level tab; service principals remain internal records edited
only where command-backed service nodes need them. The screens tab shows the
actual compiled screens, including compiler-inferred role/entity screens, before
the lower authored-screen editor. `ProcessScreenPreview.vue` renders those
compiled screens as simplified role-grouped layouts: it shows the screen
template, regions, sources, filters, and actions from the normalized manifest,
but it must not fetch live entities or mount the runtime generated-screen
renderer.

The canvas and inspector are deliberately separated: graph nodes stay compact
enough to scan and wire, while one selected-node inspector owns forms for
fields, access, construction, and lifecycle metadata. Large form controls must
not be reintroduced inside every node.

Canvas wires are selectable curved edges. `Delete` / `Backspace` removes the
selected node or selected wire, and runtime edge selection styling is stripped
before process serialization. Palette-created nodes are positioned at the
center of the active viewport so adding a node while zoomed or panned does not
drop it back near the original canvas origin.
Wires are checked against the process package's typed port contract before they
are persisted. Clear type mismatches, such as event-to-entity, status-to-data,
or different concrete entity types, are rejected with a localized toast. Generic
authoring sockets such as create-action parent inputs stay connectable so the
compiler can apply domain lineage validation afterward. Stale labels or saved
parent entity metadata on a create action do not narrow the visual `parent`
handle during edge validation. Command outputs that return collections can feed
same-entity row actions through the standard `entity` input.

Command sockets should expose abstract domain contracts when a command is
polymorphic. For example, `generateAttachment` presents one `Attachment source`
socket with `attachments.generate` capability and accepted source types instead
of feature-specific source sockets.

New process behavior should use `createEntity`, `mutateEntity`,
`runCommand`, status-definition nodes, value-input nodes, and inbound/outbound
socket nodes. Archive is represented as a `mutateEntity`
action targeting an archive status, not as a separate node type. Entity naming
is a construction input: generated create actions prompt for the domain
contract's name field or consume a connected block/value default. A block node
wired to a named construction socket uses that socket's contract path (`name`,
`templateId`, `parameters`, etc.) instead of the block node's display path, so
typed constructors such as cassette-design baking receive the domain payload
they require. They should not create unnamed records unless the entity contract
explicitly allows it.
Generic process-algebra nodes now exist for the semantic records that
`@cutkit/processes` can round-trip and type-check: entity references,
entity/block disassembly, block/entity assembly, string operations,
comparisons, logic, and basic collection transforms.
Guard and switch nodes are still not palette nodes because they need explicit
runtime control-flow semantics rather than only value ports.
