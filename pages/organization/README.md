# COMPONENT: Organization Pages

Organization pages manage the current tenant context.

`index.vue` is a thin route wrapper around the generated organization overview
screen from auth hydration. The server stores that screen in the user's screen
manifest with `template: "organizationOverview"` and a list of accessible
organization system screens. The page does not decide which organization
sections exist; it renders the hydrated screen contract.

`billing.vue` renders the generated organization billing screen from auth
hydration. Billing packages are loaded from
`/api/organizations/:id/billing/packages`, account state from
`/api/organizations/:id/billing/account`, and checkout/payment sync through the
same organization billing route group. User profile routes do not buy or hold
credits. Billing checkout is a billing-screen action gated by
`organizations:admin`; team management and process design are separate route
screens gated by their own effective permissions.
The account panel explains token use in compute-intensive services. It never
exposes runtime-configuration implementation wording, and it shows a current
tariff tag only when deployment billing mode is `tariff` and a current tariff
is configured.

`users.vue` is the team management route for invitations, membership approval,
user creation, and process role assignment. The page reads roles from the
active process definition, and writes assignments through
`/api/process-definitions/active/assignments`. It is the operational owner for
assigning actual users to abstract process roles. It does not expose membership
role labels as process roles. Invites, user creation, and assignment editing all
preserve multiple selected process role ids. The role dialog derives typed
assignment binding fields from every canonical `$assignment` use in selected
role/action grants, screen routes, scopes, bindings and requirements, and source
identifiers and filters. Preview as Assignment runs the package assignment
compiler and shared evaluator with edited role ids, bindings, and optional
entity/status/lineage context. It shows allowed, denied, or unresolved entities,
fields, transitions, actions, and screens; fields also consume compiled field
policies. The role review is the shared annotated
summary from `shared/role-access-summary.js`: it covers entity profiles,
screens, actions, and workflow transitions (read from the compiled workflow
contract of the active process), and every rendered line names the record that
contributed it: an authored grant, a screen requirement consuming separate
capability, a status-window rule, or a level fallback. Missing bindings come
from the edited candidate assignment. Active owner membership is a separately
attributed organization/team recovery overlay, never a process-role grant.
The route expects `/api/users` to return canonical user DTO blocks with
`identity.name`, `data.email`, and membership summary fields visible under
`users:read`; it derives the active organization id from the loaded organization
store first and falls back to the auth membership list.

`types.vue` is the registry browser: a read-only projection canvas of the
organization's merged type view (system pack types + org declarations)
rendered as type/field/state nodes with declares wires, transition wires
carrying intents, and type-to-type children wires. It compiles nothing —
declaration authoring lives in the process designer tree
(`process.vue`). The browser owns registry management only: org-type
deletion and surfacing registry compile errors. The pure projection
(`composables/useTypeCanvas.js`, `canvasFromDeclarations`) is proven by
`shared/type-canvas.spec.js`.

`process.vue` is the visual process-designer surface. It edits organization
process definitions with Vue Flow, persists drafts through
`/api/process-definitions`, validates them through the process compiler, and
activates compiled runtime contracts for access, screen manifests, navigation,
entity workflows, services, sockets, and field policies. The checkmark apply
button saves or forks the visible graph, activates the resulting process
definition, and records activation warnings/errors in the centered canvas
validation feedback so operators can inspect the result without a persistent
canvas panel. When the next contract removes workflow states still held by
live instances, Apply pauses in the migration dialog: the author maps each
removed state to a retained target, and activation re-targets the affected
instances (the canonical Apply migration contract lives in
[server/features/process-definitions/README.md](../../server/features/process-definitions/README.md)).

The designer authors the graph protocol v5 (SPEC §20): palette items are
species kinds (`cts.construct`/`mutate`/`transition`/`remove`/`command`,
`cts.read` by select, the structure family), node records carry CTS type
ids and constructors, and stored v4 graphs are migrated one-way on load —
`operationKindOf` is the single seam kind matching routes through, so the
canvas vocabulary is the type system's. The server accepts both
vocabularies at one boundary (`compiler-adapter.js` lowers v5 for
compile/validate/preview/runs; saves persist the authored vocabulary).

The designer consumes exactly one domain source: the organization's CTS
registry view projected through `projectDomainFromView` (see
[packages/cts/SPEC.md](../../packages/cts/SPEC.md) §19 "Source flip").
The view is framework party declarations plus the mounted pack types plus
the organization's authored declarations (stored by
`server/features/cts-types`); the projection synthesizes every contract
from those declarations — there is no legacy entity passthrough. Palette
options, field lists, statuses, construction, and containment all derive
from that projection — the canvas composes instances of types, and since
the one-tree flip it also declares them: Class, Field, and State nodes
author declarations in the same tree (`types.vue` is the read-only
registry browser). Field inspectors edit the full V grammar
through `DescriptorEditor` (units, ref targets, enum values, variant tags,
list/map item types, nested record fields), class inspectors own payload
traits and operator facets (species signatures with triggers), class→class
wires declare children edges with `onRemove`, and state→state wires are
transitions with intents. Declaration wires are legality-gated
(`declarationWireLegality`) and persist as `role: 'type'` edges; saving the
tree compiles them through `compileTreeDeclarations` (exactly one initial
state per declared lifecycle — R4 — never a silent default) and posts them
to the registry before the process saves. Before save/apply, declarations
referenced by the graph are checked against the same registry view
(`checkDeclarationsAgainstCts`), so a wire naming an unknown type or an
undeclared state fails before the compiler runs.

The route uses the authenticated app layout with a full canvas workspace and
the shared `DesignerSurface` plus `DesignerWorkspace layout="canvas"` shell. The
dock is supplied through the shell's dock slot, matching the shared designer
contract used by Cassette, Facade, and Facade Pattern; the palette and
inspector render as PrimeVue `Drawer` side panels inside the canvas workspace.
The graph palette is the type catalog by class (File types, Items,
Groups, Processes — dragging a type drops a bound construct) followed by
the operation, value, and list groups. Its framework
metadata comes from `createProcessDesignerContract(projectDomainFromView(...))`;
the route supplies the CTS-projected domain as the active domain
implementation rather than importing separate CNC field/construction
registries. The palette is deliberately not
the exhaustive runtime catalog: casts, patches, predicates, ambient current
entity reads, and trigger-payload plumbing cannot be added as unexplained empty
nodes. Value input selects its type in one node. Logic/comparison, text, math,
and date each select their operation in one node. Grasshopper-style list/tree
operations provide selection and structure work without a second entity-query
language. The persistent drawer renders those operations as a readable
two-column grid; the full job description is a tooltip, not permanent panel
prose.
The palette and inspector are non-modal, non-dismissable drawers (left and
right, `closeOnEscape` disabled so canvas Escape keeps clearing graph
selection); each drawer owns its vertical scrolling so long entity lifecycle
and role forms remain reachable without moving the canvas, and either closes
independently to recover the canvas. The bottom dock is PrimeVue `Dock`
wrapped by `components/process-designer/ProcessDesignerDock.vue`:
`process.vue` maps the page actions into its item API, and
`ProcessDesignerDockItem.vue` keeps proximity magnification and hover labels
on the GSAP motion patterns while honoring reduced motion. Dock items are
grouped by concern with separators: drawer toggles, direct canvas view
controls, Save and Apply, and the Folder. Process selection and New Draft live
in the Folder's click-anchored popover. Unsaved work is signaled by the active
save control and a dot rather than a text badge.
Saved graphs containing legacy role/user layout nodes have those non-canvas
nodes filtered out at load, and entity/service/socket nodes are reconstructed
from the process records so active definitions do not open to a blank canvas.
Truly empty processes render compact canvas add controls for the same three
object types.
Route process round-tripping delegates to `@cutkit/processes`: canonical
semantic records project into Vue Flow nodes through
`definitionToCanvas()`, and saving writes the visible canvas back through
`canvasToDefinition()`. Canvas layout is therefore presentation state; roles,
entity lifecycles, action definitions, services, organization sends, screens,
and assignments remain the process source of truth. If a stored process contains
only compiled runtime data and no semantic records, the designer shows a clear
validation error instead of guessing a canvas.
Palette captions are presentation-only and are localized when the canvas is
rendered. Persisted process-node labels keep the canonical operation kind, so
the locale used while authoring cannot leak into generated action buttons.
Entity-producing operation sockets create their producer-output contracts from
the operation node and output socket identity. The designer does not create
detached entity profiles when a command is selected; command entity outputs are
owned by their emitting process node.
On load, the route fetches the active process and the current process list,
selects the active process first, and falls back to the newest usable draft or
saved definition only when active is unavailable. Empty canvases show a passive
current-process state; they do not propose starter action buttons over the
workspace.
The screens tab authors the generated UI manifest for operational user screens:
fixed templates, one or more typed entity sources, one or more display regions,
entity display surfaces, required access, assignment binding, and process
action ids. It does not expose raw JSON as the normal authoring surface. When
activated, compiled user screens are routed through `/screens/:screenKey`; the
semantic route entered in the designer is retained as process metadata.
Screen feature choices, new screen defaults, and new canvas entity/action/socket
defaults are derived from the domain entity registry. The designer must not
hardcode app navigation routes or concrete CNC entity names as generic process
defaults; concrete starter graphs belong in process templates.

The inspector edits secondary configuration for the selected canvas record.
Derived input/output socket specifications remain on the node rails and their
hover/focus metadata; the inspector does not duplicate them as a table. The
remaining inspector surfaces are:

- the roles tab edits labels and base grants through the shared typed builder,
  and shows the same annotated summary as Team;
- the service access tab owns service runtime identities;
- entity nodes own entity type, lifecycle mode, inline status-machine
  states/transitions, transition role access, node role access, and
  public/write/private field policy;
- the action-node inspector owns fixed action kind, trigger mode, per-role
  access level, target entity or command, target status, update fields,
  projection fields, derived typed data sockets, and the completion event
  socket;
- process algebra nodes expose selected domain fields directly as sockets;
  generic value/list/tree nodes infer transported type and structure from
  incoming wires;
- Relations block entries own only their storage key, with entity type and
  one/many cardinality inferred from the connected socket. Manual generic
  Create actions prompt for an unwired identity name and accept canonical
  field-path values;
- artifact Relations entries show the upload-backed attachment kinds allowed
  by that Link action (empty selection allows every upload-backed domain
  kind; explicit selection narrows the creator), from the domain
  attachment-kind creation contract;
- service nodes own command selection, run/view service identities, prepaid
  token billing metadata, and command-derived inputs/outputs;
- socket nodes own direction, entity type, projected/excluded fields,
  send/receive roles, and receiver lifecycle.

The screens tab owns screen identity, generated UI template, route, placement,
role ids, required access, source and region rows, typed bindings, and action
ids. It exposes the complete canonical authored shape from the
[`@cutkit/processes` screen contract](../../packages/processes/README.md), while
the focused screen composable owns its mutations and mode normalization. Each
required access record gates the screen against capability authored elsewhere;
screen editing never writes role grants. Each display region keeps an
independent action list: new regions start empty, sync
never copies screen-level action ids into regions or overwrites region actions,
and region actions are edited only through that region's row.

Role and user assignment records are intentionally not Vue Flow nodes. Roles are
reusable human process responsibilities assigned onto entity access rules,
action access grants, screens, socket access rules, and status-machine
transitions. They do not own navigation routes or raw grant JSON. The role tab
therefore edits labels and shows a derived access summary from the graph.
Service execution identities are edited as separate service identities and
are assigned to service run/view access; they are not user roles and cannot
trigger manual actions. Concrete user assignment editing belongs to Team
management, not the process designer.
Action nodes are the preferred process-design surface for new behavior because
they describe what happens. Entity profiles remain process resources for
lifecycle and field-policy contracts, while action nodes reference those
resources and compile into runtime trigger contracts.
Entity creation actions have no generic parent input socket. Ancestry is
authored by composing typed entity references through a Lineage block; the
compiler derives containment bindings only from those graph edges. Relations
blocks remain non-owning associations and can feed Create or Modify effects
without becoming lineage or generic parent selectors.
Update-entity actions consume their entity from the incoming edge, expose one
left-side data socket per selected mutable field, and compile those selected
fields against the domain field policy for the concrete incoming entity type.
Change-status actions do not select an entity type; the entity arrives through
the left data socket and only the target status is configured on the node.
Archive is modeled as that target status, and cross-organization transfer is
modeled as a send-to-organization action with projection fields.
The node title for a change-status action is the actual target status label
from the connected status definition, falling back only to the target state id.
Designer sync treats generic action labels such as `Action` or `status` as
empty for status actions so generated screens and the canvas do not show
placeholder verbs where a lifecycle state is required.
Inbound organization socket nodes model receiver inputs from other
organizations and produce received entities into the local graph. Outbound
socket nodes consume local entities and produce projected payloads for another
organization.
Canvas nodes show explicit expected input and produced output socket labels
instead of input/output counts: action and service node handles are labeled
with typed entity/status contracts, socket node handles are labeled with the
transfer input and projected output fields, and entity nodes render their field
policy as the process data contract. Socket rows are unboxed structural rails;
the shared semantic mapping gives each source handle and its wire the same
contract tone for entity, block, data, status, event, projection, attachment,
and task ports. The canvas keeps only the contract label visible so
path/required metadata does not duplicate the socket name. New palette nodes
are placed at the nearest unoccupied grid position around the current viewport
center so a later node cannot cover an earlier node's socket hit targets. Wires
use curved Vue Flow edges rather than orthogonal step routing.
Open input sockets do not display error badges: they show where composition is
possible. Required-input failures belong to explicit graph validation.
The designer resolves the source and target handle contracts before saving a
wire. Incompatible concrete ports are rejected immediately with a localized
toast and are also reported by process compiler validation when stale persisted
graphs contain them. Generic parent sockets remain connectable; the compiler
continues to decide whether the connected entity is a valid domain lineage
parent. Entity-typed construction inputs are separate data sockets, not create
parent sockets. Saved create-action parent labels are not used as the edge
contract, so an old `cassette` label on the parent input does not make the
canvas reject queue or library parent wires before compiler lineage checks run.
Command collection outputs can connect to same-entity row actions through the
standard entity handle.
The canvas keeps data and event contracts visually separate. Left and right data
handles are not headed with literal "inputs" or "outputs"; the socket label
itself is the contract. Event-triggered actions receive the event on the left
side of a separated bottom band and emit completion from the right side of that
same band. Action nodes expose only `manual` and `event` trigger modes.
`manual` means the action is user-started; access level and role grants live
under `action.access` and decide which process roles see the user-facing
action. `event` runs automatically from another node's event output. Service
identities stay in service access controls rather than manual trigger
selectors. Change-status action grants also store the status transition
condition under `action.access.statusFrom/statusTo`, derived from the incoming
entity socket and target status.
Entity decomposition and value composition use the complete canonical block
vocabulary exported by `@cutkit/core`. The selected domain entity narrows which
blocks exist, while core block entries plus domain field access/field groups
drive the editable field choices. Typed construction modes expose their
mode-specific inputs on create nodes, so derived constructors do not render an
empty generic input contract. Typed constructors augment, rather than replace,
the canonical constructible block sockets and the initial-status socket. A
connected block is applied after the constructor creates its complete derived
entity, preserving constructor-owned geometry and provenance unless that block
is explicitly authored. The mode selector is shown only when the selected
derived entity genuinely has multiple construction strategies; ordinary entity
creation, including cassette creation, exposes blocks without a meaningless
single-option selector.
Status-definition nodes are entity agnostic. They render the final status tag
directly on the node, edit status id, label, severity, icon, and lifecycle
evidence requirements, and apply to whichever entity lifecycle or action target
they are wired into. Evidence requirements are stored on the status definition
as `lifecycle.description`, `lifecycle.attachments`, and
`lifecycle.snapshots`; the process compiler copies them to the generated
workflow state so runtime status actions can collect descriptions/proof files
and capture relation snapshots when that state is entered. New status nodes
start from a neutral `STATUS` id with no label, so lifecycle meaning is authored
by the process designer rather than guessed by the palette.
When normalizing stale status-node labels, the designer only compares against
entity types from the active domain registry. It does not keep a baked list of
domain names in the Vue surface.

Loading an active process is read-only. Saving changes forks the current graph
into a draft first, because active process definitions cannot be patched
directly.
Drafts created from active processes keep `sourceProcessDefinitionId` so the
activation path can replace the current runtime contract without mutating the
active source in place.
