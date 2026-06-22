# COMPONENT: @cutkit/processes

Declarative organization process compiler. It turns visual process definitions
into runtime contracts for role-derived permissions, navigation, entity
workflows, field policies, action nodes, services, and sockets.

Process definitions use canonical semantic records as the editing source of
truth. `definitionToCanvas()` projects those records into deterministic Vue
Flow nodes and `canvasToDefinition()` writes canvas layout/edges back while
preserving role, lifecycle, action, service, socket, and assignment records.
`validateRoundTrip()` verifies that `definition -> canvas -> definition` does
not change process semantics before activation. Vue Flow node positions are
presentation data; runtime behavior must come from the semantic records.

Process lifecycle profiles compile directly to normalized `@cutkit/workflows`
v2 state machines. Runtime adapters must not treat lifecycle data as visual-only
metadata.

`src/templates.js` contains compatibility starter process templates for legacy
organization labels such as contractor, manufacturer, customer, and service
provider. These templates create process graphs and role assignments; they do
not reintroduce organization-type branching at runtime.

Role access is compositional. Explicit `role.grants` remain supported, but the
compiler also enriches roles from entity-profile `allowedRoles` and service
`access.runRoles` / `access.viewRoles` so the visual graph can produce runtime
permissions without hand-maintained grant JSON. Assignments compile against the
enriched roles and produce effective permissions plus navigation for each user.
At runtime those compiled permissions are the organization's active access
source. Membership/user permissions remain compatibility fallback data; they
are not a second process model.

Action records represent executable process steps on the visual canvas. The
compiler validates `createEntity`, `changeStatus`, `runCommand`, and
`sendToOrganization` actions against the domain entity, field-policy, and
command registries, preserves their typed inputs/outputs, and emits trigger
contracts. User-triggered actions carry process role ids so runtime adapters can
expose only the actions assigned to the current user's process roles; system and
event actions remain available for backend orchestration. Entity creation can
declare a `parentEntityType`, which compiles as an explicit parent input instead
of being inferred silently.

Navigation records are currently route-level screen entries attached to roles.
They let an assignment compose several role menus and scoped bindings, but the
Nuxt app still resolves those entries against its known route registry. A fully
process-composed screen model should promote actions, services, and entity views
into canonical screen records during compilation, then let the client render
that screen manifest instead of hardcoded hub and tab lists.

Compiled field policies replace the base domain field set for an organization
when present. `read` fields are public display fields, `write` fields require
write grants, and `private` fields require admin grants. Socket definitions are
compiled as runtime contracts and can be used by the backend to project only
selected entity fields plus receiver lifecycle metadata for another
organization.

Compiled-only runtime contracts are not editable process sources. If a stored
process definition has `data.compiled` but no canonical semantic records, the
designer and activation path fail clearly instead of inferring a visual design
from runtime output.
