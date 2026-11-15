# COMPONENT: Server Features — Entity Modules

Business logic modules following the Service-Repository-Model pattern.
Persisted entity modules are self-contained vertical slices. Capability modules
that are not entities may live under `server/features/` for now, but they are
classified separately and are not forced into fake entity files.

Parent: [server](../README.md).
Target law: [SPEC.md](./SPEC.md).

## Required File Structure

Every feature module in `server/features/[name]/` **must** contain:

| File | Purpose |
|---|---|
| `model.js` | Class extending `BaseEntity`. Defines constructor and `toJSON()`. |
| `repository.js` | Raw MongoDB access only. Uses `toFlexibleId()`. No business logic. |
| `service.js` | All business logic and cross-module calls. Uses the access engine for authorization. |
| `index.js` | **Public API.** Exports `service` namespace only — never `repository` or `model`. |

`node scripts/check-arch.js` derives the entity feature set from the CTS
registry view (framework declarations) and verifies the classification
table below against the live directory listing. Run before every
commit.

### Entity vs Capability Modules

The strict Golden Path applies to persisted entities with a stable block DTO.
Support capabilities are documented and classified, but do not need empty
`model.js` files just to satisfy the checker.

| Kind | Modules |
|---|---|
| Entity modules | [instance-revisions](./instance-revisions/README.md), [organizations](./organizations/README.md), [process-definitions](./process-definitions/README.md), [users](./users/README.md) |
| Capability modules | [agent-bots](./agent-bots/README.md), [billing](./billing/README.md), [connections](./connections/README.md), [cts-types](./cts-types/README.md), [directory](./directory/README.md), [files](./files/README.md), [instance-events](./instance-events/README.md), [instance-overlays](./instance-overlays/README.md), [instances](./instances/README.md), [invitations](./invitations/README.md), [livekit](./livekit/README.md), [llm](./llm/README.md), [meetings](./meetings/README.md), [notifications](./notifications/README.md), [pages](./pages/README.md), [partnerships](./partnerships/README.md), [plugins](./plugins/README.md), [sessions](./sessions/README.md), [states](./states/README.md), [support](./support/README.md), `system-settings`, [transcription](./transcription/README.md), [views](./views/README.md), [web-search](./web-search/README.md), [workflow-overrides](./workflow-overrides/README.md) |

This directory is framework-only: domain implementations (the facade
fabrication domain — cassettes, nesting, sheet designs) live under their
installed facade plugin (see [plugins](./plugins/README.md)) and reach the
app only through the plugin install seam.

Types without a feature module — the documents/tech-drawing pack
types and every org-authored type — are served entirely by the generic
instance machinery ([instances](./instances/README.md)); check-arch keeps
their names on the generic list so no feature directory is expected.

---

## Public API Contract

The **only** way to consume a feature from outside its directory is via its `index.js`:

```js
// ✅ Correct — goes through service layer
import * as organizationsService from '~/server/features/organizations/index.js';

// ❌ Forbidden — bypasses business logic and permissions
import * as repository from '~/server/features/organizations/repository.js';
```

### index.js pattern

```js
// server/features/[name]/index.js
export * as service from './service.js';
// Never export repository or model
```

---

## Service Layer Contract

Every service function must:
1. Accept `(params, event)` or structured `authContext` — never raw `req`/`res`
2. Call `requireAuth(event)` or `requireLineagePermission(event, lineage, type, level)` before any data access
3. Return `Model.toJSON()` output — never raw MongoDB documents or model instances

Common service signatures:
```js
getById(id, event)
list(filters, event)
create(params, event)
update(id, params, event)
delete(id, event)
```

Services are registered explicitly in `server/runtime/app-registry.js`; feature
services must not self-register through hidden globals.

---

## Design Rules

- **No cross-module DB access**: Services call other services through the explicit app registry or local imports approved by the feature boundary, never foreign repositories.
- **Access boundary**: Entity services, workflow transitions, and command handlers use `server/core/access/` for permission decisions.
- **Blocks import path**: `~/server/core/blocks/index.js`
- **toJSON() rules**: spread `super.toJSON()`; do not re-emit `name`, `slug`, `serial`, `reference`
- **data vs identity**: `serial` and `reference` live in `identity` only; feature-specific state goes in `data`
- **summary**: computed aggregates (counts, totals) — always a separate field, never mixed into `data`
- **entity synchronization**: successful mutations that should update other
  open sessions publish typed invalidation events through
  `server/features/instance-events`; do not create per-feature polling loops when
  the shared event bus can feed the browser-local `instance-events.js` contract.
- **organization billing**: prepaid service tokens are organization-owned;
  [billing](./billing/README.md) owns the token-cost contract.

## Persistence Ownership

Persistence follows the owning capability, not the API route that happens to
trigger a write. The repository (or explicitly documented storage adapter)
owns the durable representation; services authorize and orchestrate writes.

| Durable data | Persistence owner | Write authority / entry path |
|---|---|---|
| Typed instances in per-class collections | `features/instances/repository.js` | Generic instance transports and process effects, both gated by the compiled instance access engine |
| Lifecycle snapshots and `status_events` | `core/machines/repository.js` | Machine transition/initialization boundary; legacy `features/states/repository.js` delegates to this owner |
| Command runs | `core/commands/repository.js` | Command service after command access and process-service gates |
| Task runs | `core/tasks/repository.js` | Task service; HTTP worker endpoints require worker credentials |
| Idempotency keys | `core/idempotency/repository.js` | Idempotency middleware/service |
| Agent subscriptions and agent runs | `features/agent-bots/repository.js` | Agent-bot service after organization capability and conversation-participant checks |
| Organization records and role assignments | `features/organizations/repository.js` | Organization service after active-tenant permission checks |
| User records and memberships | `features/users/repository.js` | User service; membership writes are owned by the users repository |
| Sessions | `features/sessions/repository.js` | Authenticated session lifecycle; logout revokes the presented session |
| Avatars and file blobs | `features/files/service.js` (GridFS storage adapter) | Authenticated upload transports and trusted internal payload/attachment writers |
| Invitations | `features/invitations/repository.js` | Invitation service; administrators create/revoke, invitees consume token or targeted invitations |
| CTS declarations | `features/cts-types/repository.js` | Organization-admin CTS routes; pages may seed its fixed Page declaration |
| Instance overlays and revisions | `features/instance-overlays/repository.js`, `features/instance-revisions/repository.js` | Overlay/source-instance grants and revision source-read gates |
| Pages and saved views | `features/pages/repository.js`, `features/views/repository.js` | Active-organization membership, as specified by each feature README |
| Partnerships | `features/partnerships/repository.js` | Active-organization administrators on both sides of the partnership lifecycle |
| Plugin catalog, installs, assets, and service cache | `features/plugins/repository.js` | Platform-operator credential for catalog publishing; organization administrators for installs/settings/upgrades |
| Billing accounts, invoices, payments, and ledger | `features/billing/repository.js` | Organization read/admin gates; payment-provider callbacks are verified before synchronization |
| Support messages, groups, read state, preferences, and transcripts | `features/support/repository.js` | Support service conversation-context and participant/admin checks |
| Notification subscriptions | `features/notifications/repository.js` | Authenticated user owns the subscription endpoint |
| Process definitions | `features/process-definitions/repository.js`; durable process runs/events use `features/process-definitions/run-store.js` | Process-definition read/write/admin gates; run/event writes occur through the process runtime and scanner |
| Workflow overrides | `features/workflow-overrides/repository.js` | Machine-resolution persistence seam; currently read by the machine engine |
| Upload sessions/chunks | `features/files/repository.js` | Session owner is checked on every read, append, and completion |

Two deliberate cross-cutting adapters remain distinct: the machine repository
writes lifecycle snapshots into the relevant entity collection, while the
instance repository owns ordinary entity CRUD; and the files service owns
GridFS streams while its repository owns resumable-session documents. The
pages repository owns the Page type's migration and member-authored document
operations over the shared `items` collection.

`features/states/repository.js` is a compatibility adapter only: it performs
no database access. The users collection is written through the users
repository; organization role assignments remain in the organizations
repository. The process run store is an explicit persistence adapter, not a
second generic process-definition repository.

## Related

- [server/core/blocks/README.md](../core/blocks/README.md) — Block class API
- [server/core/machines/README.md](../core/machines/README.md) — Lifecycle engine
- [server/utils/README.md](../utils/README.md) — Permissions API
- [server/features/_template/README.md](./_template/README.md) — Golden Path template
- [server/features/billing/README.md](./billing/README.md) — organization billing account and token ledger
- [server/features/directory/README.md](./directory/README.md) — cross-tenant user/organization search and directory cards
- [server/features/partnerships/README.md](./partnerships/README.md) — organization-to-organization partner relations
- [server/features/workflow-overrides/README.md](./workflow-overrides/README.md) — organization-owned lifecycle overrides
- [workers/facade/README.md](../../workers/facade/README.md) — the facade plugin's executor and listing
