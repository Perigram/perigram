# COMPONENT: @cutkit/processes

Declarative organization process compiler. It turns visual process definitions
into runtime contracts for role-derived permissions, navigation, entity
workflows, field policies, action nodes, services, and sockets.

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

Action records represent executable process steps on the visual canvas. The
compiler validates `createEntity`, `changeStatus`, `archiveEntity`, and
`runCommand` actions against the domain entity and command registries, preserves
their typed inputs/outputs, and emits trigger contracts. User-triggered actions
carry process role ids so runtime adapters can expose only the actions assigned
to the current user's process roles; system and event actions remain available
for backend orchestration.

Compiled field policies replace the base domain field set for an organization
when present. `read` fields are public display fields, `write` fields require
write grants, and `private` fields require admin grants. Socket definitions are
compiled as runtime contracts and can be used by the backend to project only
selected entity fields plus receiver lifecycle metadata for another
organization.
