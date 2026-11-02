# COMPONENT: Partnerships

Organization-to-organization partner relations. A partnership is a
directed request between two tenant roots that becomes a symmetric
relation on acceptance; it is bookkeeping only — entity access flows
through the ordinary grant/process machinery.

Parent: [server/features](../README.md).

## Capability Module

`partnerships` is a capability module backed by the `partnerships`
collection: `repository.js` owns raw MongoDB access, `service.js` owns
authorization and orchestration. Organization names resolve through
the organizations feature service.

## Data Structure

Collection: `partnerships`

- `organizationIds`: the two sides as canonical string ids, sorted. Stored
  as plain strings so membership queries stay independent of the
  ObjectId/UID duality of organization `_id`s.
- `requesterOrganizationId` / `requesterUserId`: who asked.
- `status`: the partnership state.
- `createdAt`, `respondedAt`, `terminatedAt`.
- Audit trail rides the shared status-events service
  (`initializeStatus`/`addStatus` on the `partnerships` collection); each
  transition writes the collection status and its `status_events` row in the
  same service call.

| From | Event / guard | To |
|---|---|---|
| — | request | `pending` |
| `pending` | partner-side admin accepts | `active` |
| `pending` | partner-side admin declines | `declined` |
| `pending` | requester-side admin cancels | `declined` |
| `active` | either side's admin terminates | `terminated` |

`declined` and `terminated` are terminal; a repeated response or termination
reads as already closed.

## Authorization

- Listing requires active membership in the active organization
  (`GET /api/partnerships` is active-org scoped).
- Requesting, accepting, declining, cancelling, and terminating require
  `organizations:admin` on the respective side: the requester's admin
  asks, the partner side's admin responds, either side's admin may
  terminate an active partnership.
- Duplicate pending/active partnerships between the same two
  organizations are rejected with 409.

## Serialization

Responses carry the partnership document plus resolved display context:
`partnerOrganization` (directory-level `{ _id, name, type }` from the
organizations service) and, relative to the caller's active organization,
`direction: 'incoming' | 'outgoing'` and `canRespond`/`canManage` admin
flags. Serialization lives here because partnerships sit outside the
declared-CTS-type field-access policy.

## Service API

- `listForActiveOrganization(auth)` — partnerships of the caller's active
  organization.
- `request({ partnerOrganizationId, auth })` — create a pending
  partnership from the active organization.
- `respond(partnershipId, auth, action)` — `accept` or `decline` by the
  partner side's admin.
- `terminate(partnershipId, auth)` — cancel (pending, requester) or
  terminate (active, either side).

## API

| Endpoint | Responsibility |
|---|---|
| `GET /api/partnerships` | Active organization's partnerships with display context. |
| `POST /api/partnerships` | Request a partnership (`{ partnerOrganizationId }`). |
| `POST /api/partnerships/:id/accept` | Partner-side admin accepts. |
| `POST /api/partnerships/:id/decline` | Partner-side admin declines. |
| `DELETE /api/partnerships/:id` | Cancel (requester, pending) or terminate (either, active). |

## Client Surfaces

- `/organization/partners` is the partner management route (incoming /
  outgoing / active lists plus directory search to find new partner
  organizations) — see
  [organization pages](../../../pages/organization/README.md).
- The organization directory page `/organizations/:id` exposes partner
  actions for the viewed organization relative to the caller's active
  organization.

## Related

- [organizations](../organizations/README.md) — tenant roots and admin permission source
- [directory](../directory/README.md) — partner discovery through global search
- [API routes](../../api/README.md)
