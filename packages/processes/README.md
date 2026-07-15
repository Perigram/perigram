# COMPONENT: @cutkit/processes

Declarative organization process compiler. It turns visual process definitions
into runtime contracts for graph-derived role permissions, screen manifests,
navigation, entity workflows, field policies, action nodes, services, and
sockets.

Process definitions use canonical semantic records as the editing source of
truth. `definitionToCanvas()` projects those records into deterministic Vue
Flow nodes and `canvasToDefinition()` writes canvas layout/edges back while
preserving role, service-identity, lifecycle, action, service, socket, and
assignment records.
`validateRoundTrip()` verifies that `definition -> canvas -> definition` does
not change process semantics before activation. Vue Flow node positions are
presentation data; runtime behavior must come from the semantic records.

Process lifecycle profiles and action nodes compile directly to normalized
`@cutkit/workflows` v2 state machines. Entity profiles may provide a full
workflow, but action-only graphs also synthesize workflows: create actions add
their target status as a state, and status-mutating `updateEntity` actions add
transitions with the process role ids and entity access requirements from the
action grant.
Runtime adapters must not treat lifecycle data as visual-only metadata.

`src/templates.js` contains starter process templates for organization
bootstrap. They create process graphs and role assignments; runtime behavior is
driven only by the activated process definition, not by organization type
branching.

Role access is compositional. Process role records represent human
responsibilities and may store explicit access grants, but they do not own
navigation routes. The compiler combines explicit role grants with grants
derived from entity-profile `allowedRoles`, action access grants, and screen
`required` contracts.
Assignments compile against those derived roles and produce effective
permissions, screens, and navigation for each user. Services use separate
service identities stored in `servicePrincipals` plus
`access.runPrincipals` / `access.viewPrincipals`; those service identities are
not selectable as manual user triggers.
Service records may also carry billing metadata. `billing.mode:
prepaidTokens` with a positive `tokenCost` compiles into the runtime service
contract, and the command runtime debits the active organization's billing
account after successful command execution. Token package prices stay outside
process definitions in runtime billing configuration.
At runtime those compiled permissions are the organization's active access
source.
When an assignment contains multiple role ids, generated and authored screens
from every selected role are merged into that user's screen manifest. Explicit
screen records that name several roles still compile to one shared screen key;
compiler-inferred role/entity screens stay separate per role and entity so a
multi-role user receives every matching operational screen. Each inferred
role/entity list screen also gets a paired `entityDetail` screen with the same
required access and action set, so generated collection names can open an
entity page through `screen.scope.entityId`. Grant-only inferred screens are
still valid destinations, and inferred `auto_*` list surfaces also seed the
synthesized process `home` screen so the active process opens on a stable home
surface instead of jumping directly into the first inferred entity list.
Domain entities marked `meta: true` are excluded from this inference because
they represent organization configuration, administration, or provenance
rather than operational work. Their grants still compile into effective
permissions, and an authored/system screen may expose them explicitly.

Action records represent executable process steps on the visual canvas. The
compiler validates `createEntity`, `updateEntity`, `runCommand`, and
`sendToOrganization` actions against the domain entity,
construction, field-policy, status-definition, value-input, and command
registries, preserves their typed inputs/outputs, preserves completion events,
and emits trigger contracts. `trigger.mode` is only the execution mode:
`manual` means a user starts the action from UI, and `event` means another
node's completion event starts it automatically. Role access is stored under
`action.access.grants` as `{ roleId, level }` rows and compiles into entity
grants plus manual action availability. `write` permits create/edit/update/run
actions, while `admin` includes write/read and is required for destructive or
approval-style operations. `read` grants describe access to the resulting entity
window but must not expose a runnable manual create/update/run action. Manual
action availability uses the same
status-scoped access window as grants: a status-mutating update action with
unmodified access inherits role-level grants from the incoming action output,
so a status step placed after a create step appears for users who received
access to the created state. For status-mutating updates, run availability is
derived from the incoming entity window: roles with write/admin access to the
current state can execute the transition, while the action's grant rows define
access after the target state is reached. The compiled workflow transition uses those same
incoming run roles in `processRoleIds`; the status engine treats that process
role match as the transition authority. The target-state entity grant is not
also written into the workflow transition, because that grant describes access
after the transition has happened. It must not use the target-state grant level
as the execution permission: a status node can grant admin access after the
transition without requiring admin access before it. Designers select from process roles directly when authoring
action grants; pre-existing
entity-profile grants are an independent grant source, not a filter for action
grant creation. Entity creation exposes an
optional parent input socket plus domain-declared construction sockets from
`cncEntityConstruction`; the visual designer derives the parent from the
incoming edge instead of a parent-type selector. Generated screens prompt for
construction fields declared by `action.inputPolicy` and post those values to
the active process action endpoint. Derived entities must use typed
construction modes. For example, `cassette_design` creation compiles as
`bakeCassetteDesignFromTemplate` and runtime execution delegates to the
cassette template construction service, preserving baked geometry and editor
contracts instead of creating a generic row.
Legacy stored `changeStatus` action records are normalized to status-mutating
`updateEntity` actions at the compiler boundary so old activated processes can
still compile during registration, assignment, auth hydration, and command
execution.
Graph edges are validated through exported typed port helpers:
`normalizePortSpec()`, `portSpecsCompatible()`, `resolveNodePort()`, and
`validateProcessEdges()`. The v1 contract covers existing process values only:
entities, entity lists, canonical blocks, data values, statuses, events,
organization projections, attachments, and task outputs. It prevents clear
kind/entity mismatches while keeping generic authoring sockets, such as
create-action parent inputs, available for later compiler lineage validation.
The resolver treats the `input:parent` handle as a generic parent socket even
when a saved action record still contains stale concrete parent metadata, so old
`label: cassette` or `parentEntityType: cassette` values do not make every
parent wire validate as cassette-only. Command outputs that produce an entity
collection may feed same-entity row actions through `input:entity`; the entity
type still has to match.
Legacy saved edges that embedded handles only in the generated edge id are
normalized back to explicit `sourceHandle` and `targetHandle` fields before
validation or compilation. This preserves old wires such as
`...-output:nesting_run-...-input:entity-...` and prevents them from falling
back to stale generic record ports.
When a graph edge connects an action output to another action's `parent` input,
that edge is authoritative over stale stored `parentEntityType` or parent input
metadata. This keeps detail-screen child regions aligned with the visual graph
after entity types are changed on existing nodes.
Root create actions may still carry a generic optional parent socket for canvas
connectability. Compilation treats a parent as semantic only when it resolves to
a real parent entity type. Stale same-entity parent values from older graphs are
stripped unless the domain summary registry declares that entity as its own
parent relation, so a root create action remains a list-level action instead of
being hidden on entity detail screens.
Parent contracts are valid only when the domain declares a child lineage
relation for the created entity. Entity-typed construction inputs are not
parents: for example, cassette-design `templateId` stays a constructor data
input rather than a cassette parent socket. Stale unrelated parent values are
stripped during compilation; for example, `cassette -> queue` is not valid when
the domain declares queues under projects. A create action is always compiled
onto its target entity screen so users can create the target from that list with
a parent selector when needed. The parent entity detail screen may also receive
the action as contextual chrome when the parent contract is a valid lineage
relation. Entity detail screens do not inherit root create actions for their own
entity type; detail actions are for the opened entity, such as status/update
transitions, plus valid contextual parent-child creation.
If a create action targets an entity that can have a domain lineage parent but
the graph contains no valid parent, compilation strips the stale parent and
exposes a root create action. The runtime entity service decides whether
organization-root creation is valid for that entity. Queue creation supports
this path: a stale `cassette -> queue` parent compiles to a root queue create,
and the queue service creates organization-root lineage instead of requiring a
project concept that the process graph did not define.
Compilation hydrates create-action construction and prompt policy from the
domain construction contract. A sparse visual action for `cassette_design`
therefore still compiles with required `name` and `templateId` prompt fields,
so generated screens open the input dialog even when the draft did not persist
`construction.inputs` or `inputPolicy.fields`. `cassette` creation actions
compile to `createDefaultOccsTemplate`, prompt for a template name, and create
a complete OCCS template. When stored actions carry a construction mode that no
longer belongs to the selected entity type, compilation normalizes the mode to
the current domain default and the process-construction migration persists that
normalization before recompiling active runtime contracts.
Domain construction contracts own structural input metadata during compilation:
field id, label, path, type, accepted entity types, and `required` status come
from the current domain registry, not from stale action snapshots. Stored graph
inputs may keep non-structural values such as defaults, but they cannot make a
now-optional domain input required again. Queue creation relies on this rule so
old processes that stored `jobItems.required: true` compile to an empty queue
shell action instead of blocking on cassette-design selection.
The compiler fallback construction mode is only `genericCreate`; any
entity-specific constructor such as baked cassette designs or OCCS template
creation must be declared by the domain construction registry. This keeps the
process compiler reusable and prevents hidden domain behavior from living in the
generic package.
Update actions consume an entity from the incoming data socket, expose one data
input socket per selected mutable field, validate those fields against the
active domain field-access policy, and compile into write/admin grants on the
concrete incoming entity feature. Manual generated screens prompt for the
selected mutation fields through `action.inputPolicy`, while event-driven
updates can receive the same field payload from wired value/data nodes.
Process value inputs are canonical block values, not detached notes. A value
input may identify `identity`, `data`, `specs`, `summary`, `attachments`, or
status metadata, carries the exact path and optional default, and compiles that
metadata for round-trip editing. When a value input is connected to a
construction socket, the socket's construction field id/path wins so the active
runtime receives domain payload keys such as `name`, `templateId`, and
`parameters`. When a value input is connected to an update action, its block
path becomes a mutation field and a non-prompt `inputPolicy` field, so generated
screens submit the graph-provided default without adding useless dialog chrome.
Process algebra nodes are canonical non-effect records under `processNodes`.
They cover the first source/transform layer from the process algebra note:
`entityRef`, `fieldRead`, `blockRead`, `stringOp`, `compare`, `logic`, and
`collection`. `fieldRead` is the entity decomposition node: it consumes an
entity and produces canonical block sockets. `blockRead` consumes one canonical
block and produces a scalar/json value from a field path. These records preserve
kind, operation/mode, entity contracts, block ids, field paths, inputs, and
outputs through `definitionToCanvas()`, `canvasToDefinition()`, validation, and
compilation. They do not mutate persistent state and they do not replace effect
actions; create/update/status mutation/command/send behavior remains owned by
action records. Runtime action execution may consume their typed edges only after an
effect node declares the corresponding input contract.
Status-mutating update actions consume their entity from the incoming data
socket and only require a target status; they do not need a separate
entity-type selector.
The target may be a literal `action.status.to` or a `statusRef` produced by a
status-definition node. Status definitions compile into workflow state metadata
(`label`, `color`, `severity`, `icon`) and into the compiled action target
state, so runtime execution and UI status rendering use the same value and
visual metadata. They also carry lifecycle evidence schema
(`description`, `attachments`, and `snapshots`) onto the generated workflow
state. Runtime status actions use that state schema to require operator notes,
store proof files as entity attachments, and capture declared relation
snapshots when the transition enters the state. Status definitions are entity
agnostic by default: when a referenced action creates or transitions a concrete
entity type, the compiler adds that target state to the entity workflow and
applies the referenced severity/icon/color/label and lifecycle schema there.
The same display metadata is preserved on each compiled role action manifest
entry, because generated screens read `role.actions[].status` when filtering
and rendering process action buttons.
Status-mutating update action labels are also derived from that target status
definition label, or the target state id when no label exists, whenever the
authored label is only a generic palette placeholder such as `Action`, `status`,
or the raw action kind.
Their access grants are entity-type grants conditioned by the resulting state:
the designer derives the entity type and source status from the incoming graph
socket, carries the type to the output socket, and stores
`action.access.statusFrom` / `action.access.statusTo` from that graph context
and target status input. Compilation emits transition metadata plus a
`primaryStatus = statusTo` rule on that concrete entity feature, and the same
transition is written into the compiled workflow with `processRoleIds`. Manual execution remains controlled by the action
availability contract; the access grant itself describes which entity type the
role may access after the status change. Create-action access grants are
conditioned by the created status in the same way, so `admin` on "create project
as NEW" means admin over `project` entities whose current primary status is
`NEW`, not global project admin.
Action access compiles through status-scoped access windows. A create action
opens the first window for the created entity state. A status-mutating update
action inherits the incoming entity window until its `action.access.modified`
flag is set; once modified, the selected role grant rows on that node become
the complete grant set for the target state. Removing a role from a modified
status-mutating update node therefore removes that role's access to entities in
the resulting status instead of leaving an older additive grant behind. Parent-scoped
windows carry lineage scope forward: a queue created from a project window scoped to
`$assignment.projectId` receives a `scope.projectId` grant, so access for one
project branch does not apply to queues under another project branch.
Command actions inherit the incoming entity window for their domain-declared
output entities unless the command action explicitly defines its own access
grants or marks access as modified. Output entity types come from the domain
command `output.entities` contract, not from frontend assumptions. When the
domain summary registry declares an output as a child of the input entity, the
compiler carries lineage scope through that parent relation; for example,
`solveNesting` outputs `nesting_run` and `sheet_design` records under the
source queue, so those results receive the same role window as the queue unless
a later graph node changes it.
Action graph compilation preserves all incoming edges for a node and uses the
first already-resolved upstream output window. This matters for lifecycle loops:
a queue status node can have both a create input and a later reject/retry input,
and the compiler must not let the loop edge overwrite the resolvable source
edge that feeds downstream command output grants.
Workflow synthesis also preserves those repeated incoming entity edges. If a
single status-mutating update action is reused from several source states, such as
`Создано -> Отправлено` and `Отклонено -> Отправлено`, the compiled workflow
emits one transition per source state while keeping the same target status
definition and using the executable role window from each source edge.
At runtime, a command output wired into a downstream status-mutating update node
receives that process-authored target state after the command returns its entity refs.
The state projection is derived from graph edges and typed output handles such
as `output:nesting_run`; it is not a domain-specific queue rule.
Manual command actions preserve `commandId` in each compiled user action
manifest entry. Generated entity tools use that id to place domain-specific
command panels, such as the queue nesting panel, while execution still goes
through the active process action endpoint.
Manual command actions are placed on generated screens by their input entity
feature, not by the command output feature. A `solveNesting` button belongs on
the queue detail because the user executes it against a queue, while the same
graph window still grants access to produced `nesting_run` and `sheet_design`
records through command output windows.
Stored active process definitions keep compiled runtime contracts in MongoDB.
After compiler changes that alter generated screens, action exposure, workflow
output, or grants, run
`server/scripts/migrate-process-compiled-runtime.js` to recompile existing
active definitions from their canonical process data.
After runtime changes that introduce command-output status projection, run
`server/scripts/migrate-process-command-output-statuses.js` so existing command
outputs are moved into the active process status windows derived from the
current graph.
After compiler/runtime changes that separate process-role transition authority
from target-state entity grants, run
`server/scripts/migrate-process-transition-role-access.js` to remove stale
compiled workflow `access.permissions` from process-role transitions in stored
process definitions.

Screen records are route-level UI entries attached to roles and are the source
for process-composed app navigation. They compile into generated screen
manifests, not arbitrary Vue component names. A screen declares a fixed
template (`home`, `entityList`, `entityDetail`, `workspaceLanes`, `table`,
`formAction`, or app-owned system templates such as `route`,
`organizationOverview`, and `organizationAccount`), typed
entity sources, template regions, required access, and manual process action
ids. A source describes an entity type plus list/single loading mode; a region
binds a template slot to one source and a domain display surface. The
`supporting` slot is reserved for generated/system templates with secondary
accounting or history regions. Assignment bindings replace `$assignment.*`
placeholders in screen routes, scopes, source identifiers, and source filters,
so one user can receive overloaded copies of the same screen for different
projects or entities. Screens with incomplete bindings are skipped with
compiler warnings. User-specific compiled screens use canonical generated
routes under `/screens/:screenKey`; the original semantic route is preserved as
`sourceRoute` for audit/debug context. Manual screen actions execute through the
active process action runtime, which verifies the user's compiled action
manifest before delegating to entity, status, socket, or command services.
Each user assignment also receives a compiler-synthesized `home` screen when
that user has generated list screens. The home screen is prepended to the
user's screen and navigation manifests so it becomes the process start screen.
It is not an editable semantic screen record: it is a projection of the user's
effective access. Home sources are top-level entity-list sources only. If the
domain summary registry says one accessible list is a child of another
accessible list, the child list is suppressed from the home screen and remains
reachable through its own generated route or parent detail context. The home
regions keep the target list route and the list-level manual action ids for
that entity, so generated UI can show one horizontal section per top-level
entity with its matching process action buttons.
Auth hydration may append app-owned system screens beside compiled process
screens. Organization overview, billing, team, and process-designer entries use
the same generated screen manifest shape and effective access rules as process
screens. Billing `systemActions` execute fixed organization workflows instead
of the active process action endpoint, while team and process designer entries
are route screens. App-owned system templates are valid screen contracts for
rendering/normalization, but the process designer keeps them out of ordinary
process screen authoring.
When a role can read both a parent entity and a child entity, inferred parent
detail screens receive child collection sources for relations declared in the
domain summary registry. Create-action ownership is not required to see the
child region; parent-bound create actions are attached to that region only when
the same role can execute them. The graph input alone is not enough to create a
child collection: it may be construction context, not lineage. For example, a
project-to-create-queue graph compiles the project detail screen with a queue
source filtered by the domain relation key
`projectId: '$screen.scope.entityId'`, and the create-queue action is attached
to that child region instead of the unscoped queue list screen. A role with
only read access to libraries and cassettes still receives a library detail
cassette child region filtered by `libraryId`, but no cassette create action.
A project-to-create-cassette graph does not create a cassette child collection
unless the domain summary registry explicitly declares cassette as a project
child.
Entity-typed construction inputs do not create parent-context actions. The
compiler keeps those fields in the create dialog or wired data sockets, and
does not attach them to unrelated parent `entityDetail` screens. For example, a
cassette-to-create-cassette-design graph compiles cassette design creation as a
target-list action with a `templateId` constructor input, not as a cassette
detail action.
Incoming graph parent edges are validated against lineage contracts. If an edge
connects an unsupported parent, such as `queue -> create cassette_design`, the
compiler ignores that parent edge and compiles the action as an unparented
target-list create. Queues link to baked designs as consumers through
`queue.data.job.items[]`, not by parenting the design creation action.
Navigation is compiled from the screen manifest. When a role has access grants
but no authored screen for that entity feature, the compiler creates a generated
entity-list screen for that role/feature so process-active users do not fall
back to static app routes. Role-level compiled screens keep role-prefixed ids
for audit and designer previews, but user-specific screen manifests merge
generated screens by entity/template/scope into one effective screen such as
`auto_cassette` or `auto_cassette_detail`. If one assigned role grants read
access to cassettes and another grants admin/create access to the same
cassettes, the user sees one cassette list/detail route with merged status
windows and merged runnable actions, not duplicated role-specific cassette
routes. If a role has multiple grants for the same entity feature, for example
access to `project` in both `CREATED` and `NEW`, the inferred screen aggregates
them into one feature-level read source instead of pinning the source to the
first status rule or lifting the whole screen to the maximum grant level. The
generated source keeps applicable grant rules as `rule.any`; frontend loading
turns those rules into `primaryStatuses` filters. The entity API still enforces
the individual status-scoped grants when it filters returned records, while
edit/admin affordances come from action and field grants rather than the
route-level screen requirement.

Compiled field policies replace the base domain field set for an organization
when present. `read` fields are public display fields, `write` fields require
write grants, and `private` fields require admin grants. Socket definitions are
compiled as runtime contracts. Outbound sockets consume a concrete entity and
produce a projected payload for another organization. Inbound sockets represent
receiver inputs from another organization and produce a received entity into the
local process graph with the socket receiver lifecycle contract.

Compiled-only runtime contracts are not editable process sources. If a stored
process definition has `data.compiled` but no canonical semantic records, the
designer and activation path fail clearly instead of inferring a visual design
from runtime output.
