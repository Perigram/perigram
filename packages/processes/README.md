# COMPONENT: @cutkit/processes

Declarative organization process compiler. It turns visual process definitions
into runtime contracts for role-derived permissions, navigation, entity
workflows, field policies, services, and sockets.

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

Compiled field policies replace the base domain field set for an organization
when present. `read` fields are public display fields, `write` fields require
write grants, and `private` fields require admin grants. Socket definitions are
compiled as runtime contracts and can be used by the backend to project only
selected entity fields plus receiver lifecycle metadata for another
organization.
