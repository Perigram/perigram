# COMPONENT: Process Definitions

Organization-owned process definitions store the visual process graph and the
compiled runtime contract for roles, user assignments, entity workflows, field
policies, service availability, sockets, and navigation.

Activation is the only path that affects runtime behavior. The service
requires canonical semantic process records, validates the draft, verifies the
process transpiler round-trip, compiles the runtime contract, archives the
previous active process for the organization, marks the selected process
`ACTIVE`, and stores its id on the organization.

The compiled runtime contract is not a design source. Stored definitions that
only contain `data.compiled` without semantic records are rejected during
validation and activation so operators do not edit a guessed reconstruction.
Current process edits should fork the active definition into a draft and
activate that draft when validation succeeds.

Entity lifecycle profiles compile directly into normalized `@cutkit/workflows`
v2 machines. Runtime status resolution uses the active process workflow before
organization workflow overrides and domain defaults.

`createActiveFromTemplate()` is the organization-bootstrap path used by signup
and organization creation. It creates the starter process, assigns the creator
to the process admin role, compiles it, activates it, and stores the active
process id on the organization.

Active process assignment changes are allowed through
`assignUserToActiveProcess()`. This updates `data.assignments`, recompiles the
active process in place, and makes the new effective permissions/navigation
available on the next auth hydration. Memberships remain the tenant
relationship; process assignments are the runtime role source.

Socket projection is exposed as a runtime operation. The socket API loads the
source entity through the app registry, enforces read access, copies only the
socket projection fields, applies excluded fields, and returns receiver
lifecycle metadata for the target organization to interpret.
