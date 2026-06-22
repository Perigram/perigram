# COMPONENT: Process Definitions

Organization-owned process definitions store the visual process graph and the
compiled runtime contract for roles, user assignments, entity workflows, field
policies, service availability, sockets, screen manifests, and navigation.
Runtime role permissions are derived from the graph during compilation:
entity-profile access and screen requirements create grants, screen manifests
create navigation, and service run/view access uses service identities
instead of user roles.

Activation is the only path that affects runtime behavior. The service
requires canonical semantic process records, validates the draft, verifies the
process transpiler round-trip, compiles the runtime contract, archives the
previous active process for the organization, marks the selected process
`ACTIVE`, and stores its id on the organization.
Process definition management also accepts the active organization membership's
admin/owner/creator role labels, or the sole active organization member, as a
narrow recovery path. This prevents the only tenant operator from being locked
out when the currently active process no longer grants `organizations:admin`;
the fallback is local to process definition operations and does not grant
general entity access.

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
active process in place, and makes the new effective permissions, screens, and
navigation available on the next auth hydration. Assignment updates preserve the
process status value object and only touch its audit metadata, so repository
serialization continues through the shared entity model. Memberships remain the
tenant relationship; process assignments are the runtime role source.

Manual generated-screen actions execute through the active process definition,
not through client-selected entity routes. `executeActiveProcessAction()` loads
the active compiled action, verifies that the user's compiled role assignment
contains that action id, and then delegates by action kind: entity creation,
entity update, status transition, command execution, or outbound organization
projection. The process graph remains the source for whether the button exists;
the delegated entity/status/command service remains the access and business
logic boundary.

Socket projection is exposed as a runtime operation for outbound sockets. The
socket API loads the source entity through the app registry, enforces read
access, copies only the socket projection fields, applies excluded fields, and
returns receiver lifecycle metadata for the target organization to interpret.
Inbound sockets are receiver contracts in the active process graph and cannot
be used by the outbound projection API.
