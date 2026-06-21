# COMPONENT: Process Definitions

Organization-owned process definitions store the visual process graph and the
compiled runtime contract for roles, user assignments, entity workflows, field
policies, service availability, sockets, and navigation.

Activation is the only path that affects runtime behavior. The service
validates and compiles the draft, archives the previous active process for the
organization, marks the selected process `ACTIVE`, and stores its id on the
organization.

Entity lifecycle profiles compile directly into normalized `@cutkit/workflows`
v2 machines. Runtime status resolution uses the active process workflow before
organization workflow overrides and domain defaults.
