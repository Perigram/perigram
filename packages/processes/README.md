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
