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
their target status as a state, and change-status actions add transitions with
the process role ids and entity access requirements from the action grant.
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
At runtime those compiled permissions are the organization's active access
source.
When an assignment contains multiple role ids, generated and authored screens
from every selected role are merged into that user's screen manifest. Explicit
screen records that name several roles still compile to one shared screen key;
compiler-inferred role/entity screens stay separate per role and entity so a
multi-role user receives every matching operational screen. Each inferred
role/entity list screen also gets a paired `entityDetail` screen with the same
required access and action set, so generated collection names can open an
entity page through `screen.scope.entityId`.

Action records represent executable process steps on the visual canvas. The
compiler validates `createEntity`, `updateEntity`, `changeStatus`,
`runCommand`, and `sendToOrganization` actions against the domain entity,
construction, field-policy, status-definition, value-input, and command
registries, preserves their typed inputs/outputs, preserves completion events,
and emits trigger contracts. `trigger.mode` is only the execution mode:
`manual` means a user starts the action from UI, and `event` means another
node's completion event starts it automatically. Role access is stored under
`action.access.grants` as `{ roleId, level }` rows and compiles into entity
grants plus manual action availability. `write` permits create/edit/update/run
actions, while `admin` includes write/read and is required for destructive or
approval-style operations. Manual action availability uses the same
status-scoped access window as grants: a change-status action with unmodified
access inherits role-level grants from the incoming action output, so a status
step placed after a create step appears for users who received access to the
created state. For status-change actions, run availability is derived from the
incoming entity window: roles with write/admin access to the current state can
execute the transition, while the action's grant rows define access after the
target state is reached. The compiled workflow transition uses those same
incoming run roles in `processRoleIds` and requires write access on the source
entity, so generated process actions and the status engine enforce the same
rule. It must not use the target-state grant level as the execution
permission: a status node can grant admin access after the transition without
requiring admin access before it. Designers select from process roles directly when authoring
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
Change-status actions consume their entity from the incoming data socket and
only require a target status; they do not need a separate entity-type selector.
The target may be a literal `action.status.to` or a `statusRef` produced by a
status-definition node. Status definitions compile into workflow state metadata
(`label`, `color`, `severity`, `icon`) and into the compiled action target
state, so runtime execution and UI status rendering use the same value and
visual metadata. Status definitions are entity agnostic by default: when a
referenced action creates or transitions a concrete entity type, the compiler
adds that target state to the entity workflow and applies the referenced
severity/icon/color/label there.
Status-change action labels are also derived from that target status
definition label, or the target state id when no label exists, whenever the
authored label is only a generic palette placeholder such as `Action`, `status`,
or the raw action kind.
Their access grants are entity-type grants conditioned by the resulting state:
the designer derives the entity type and source status from the incoming graph
socket, carries the type to the output socket, and stores
`action.access.statusFrom` / `action.access.statusTo` from that graph context
and target status input. Compilation emits transition metadata plus a
`primaryStatus = statusTo` rule on that concrete entity feature, and the same
transition is written into the compiled workflow with `processRoleIds` and
`access.permissions`. Manual execution remains controlled by the action
availability contract; the access grant itself describes which entity type the
role may access after the status change. Create-action access grants are
conditioned by the created status in the same way, so `admin` on "create project
as NEW" means admin over `project` entities whose current primary status is
`NEW`, not global project admin.
Action access compiles through status-scoped access windows. A create action
opens the first window for the created entity state. A status-change action
inherits the incoming entity window until its `action.access.modified` flag is
set; once modified, the selected role grant rows on that node become the
complete grant set for the target state. Removing a role from a modified
status-change node therefore removes that role's access to entities in the
resulting status instead of leaving an older additive grant behind. Parent-scoped
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
Stored active process definitions keep compiled runtime contracts in MongoDB.
After compiler changes that alter generated screens, action exposure, workflow
output, or grants, run
`server/scripts/migrate-process-compiled-runtime.js` to recompile existing
active definitions from their canonical process data.

Screen records are route-level UI entries attached to roles and are the source
for process-composed app navigation. They compile into generated screen
manifests, not arbitrary Vue component names. A screen declares a fixed
template (`entityList`, `entityDetail`, `workspaceLanes`, `table`, or
`formAction`), typed entity sources, template regions, required access, and
manual process action ids. A source describes an entity type plus list/single
loading mode; a region binds a template slot to one source and a domain display
surface. Assignment bindings replace `$assignment.*`
placeholders in screen routes, scopes, source identifiers, and source filters,
so one user can receive overloaded copies of the same screen for different
projects or entities. Screens with incomplete bindings are skipped with
compiler warnings. User-specific compiled screens use canonical generated
routes under `/screens/:screenKey`; the original semantic route is preserved as
`sourceRoute` for audit/debug context. Manual screen actions execute through the
active process action runtime, which verifies the user's compiled action
manifest before delegating to entity, status, socket, or command services.
When a create action is wired from a parent entity input, the inferred parent
detail screen receives a child collection source and region only when the
domain summary registry declares that created entity as a child of the parent
entity. The graph input alone is not enough to create a child collection: it
may be construction context, not lineage. For example, a
project-to-create-queue graph compiles the project detail screen with a queue
source filtered by the domain relation key
`projectId: '$screen.scope.entityId'`, and the create-queue action is attached
to that child region instead of the unscoped queue list screen. A
project-to-create-cassette graph does not create a cassette child collection
unless the domain summary registry explicitly declares cassette as a project
child.
Parent-bound create actions that do not have a domain child relation are still
valid parent-context actions. The compiler attaches them to the parent
`entityDetail` main region instead of dropping them or inventing a child list.
For example, a cassette-to-create-cassette-design action can render on the
cassette detail page even though cassette designs are constructed from a
template rather than listed as cassette lineage children.
Navigation is compiled from the screen manifest. When a role has access grants
but no authored screen for that entity feature, the compiler creates a generated
entity-list screen for that role/feature so process-active users do not fall
back to static app routes. If that role has multiple grants for the same entity
feature, for example access to `project` in both `CREATED` and `NEW`, the
inferred screen aggregates them into one feature-level read source instead of
pinning the source to the first status rule or lifting the whole screen to the
maximum grant level. The generated source keeps the role-local grant rules as
`rule.any`; frontend loading turns those rules into `primaryStatuses` filters
so a multi-role user does not see another role's states inside this role's
screen. The entity API still enforces the individual status-scoped grants when
it filters returned records, while edit/admin affordances come from action and
field grants rather than the route-level screen requirement.

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
