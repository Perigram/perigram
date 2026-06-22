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

Process lifecycle profiles compile directly to normalized `@cutkit/workflows`
v2 state machines. Runtime adapters must not treat lifecycle data as visual-only
metadata.

`src/templates.js` contains starter process templates for organization
bootstrap. They create process graphs and role assignments; runtime behavior is
driven only by the activated process definition, not by organization type
branching.

Role access is compositional and graph-derived. Process role records represent
human responsibilities and store identity/labels only; they do not own
navigation routes or hand-maintained grant JSON. The compiler derives role
grants from entity-profile `allowedRoles`, action access grants, and screen
`required` contracts.
Assignments compile against those derived roles and produce effective
permissions, screens, and navigation for each user. Services use separate
service identities stored in `servicePrincipals` plus
`access.runPrincipals` / `access.viewPrincipals`; those service identities are
not selectable as manual user triggers.
At runtime those compiled permissions are the organization's active access
source.

Action records represent executable process steps on the visual canvas. The
compiler validates `createEntity`, `updateEntity`, `changeStatus`,
`runCommand`, and `sendToOrganization` actions against the domain entity,
field-policy, and command registries, preserves their typed inputs/outputs,
preserves completion events, and emits trigger contracts. `trigger.mode` is only the execution mode:
`manual` means a user starts the action from UI, and `event` means another
node's completion event starts it automatically. Role ids and access levels are
stored under `action.access` and compile into grants plus manual action
availability. Designers select from process roles directly when authoring
action grants; pre-existing entity-profile grants are an independent grant
source, not a filter for action grant creation. Entity creation exposes an
optional parent input socket and
domain-declared data sockets from `cncEntityCreateInputs`; the visual designer
derives the parent from the incoming edge instead of a parent-type selector.
Update actions consume an entity from the incoming data socket, expose one data
input socket per selected mutable field, validate those fields against the
active domain field-access policy, and compile into write/admin grants on the
concrete incoming entity feature.
Change-status actions consume their entity from the incoming data socket and
only require a target status; they do not need a separate entity-type selector.
Their access grants are entity-type grants conditioned by the resulting state:
the designer derives the entity type and source status from the incoming graph
socket, carries the type to the output socket, and stores
`action.access.statusFrom` / `action.access.statusTo` from that graph context
and target status input. Compilation emits transition metadata plus a
`primaryStatus = statusTo` rule on that concrete entity feature. Manual
execution remains controlled by the action availability contract; the access
grant itself describes which entity type the role may access after the status
change.

Screen records are route-level UI entries attached to roles and are the source
for process-composed app navigation. They compile into generated screen
manifests, not arbitrary Vue component names. A screen declares a fixed
template (`entityList`, `entityDetail`, `workspaceLanes`, `table`, or
`formAction`), typed entity sources, template regions, required access, and
manual process action ids. Assignment bindings replace `$assignment.*`
placeholders in screen routes, scopes, source identifiers, and source filters,
so one user can receive overloaded copies of the same screen for different
projects or entities. Screens with incomplete bindings are skipped with
compiler warnings. User-specific compiled screens use canonical generated
routes under `/screens/:screenKey`; the original semantic route is preserved as
`sourceRoute` for audit/debug context. Navigation is compiled from the screen
manifest only; process role records are not a route source.

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
