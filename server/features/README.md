# COMPONENT: Server Features — v24 Entity Modules

Business logic modules following the v24 Service-Repository-Model pattern.
Persisted entity modules are self-contained vertical slices. Capability modules
that are not entities may live under `server/features/` for now, but they are
classified separately and are not forced into fake v24 entity files.

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
| Capability modules | [agent-bots](./agent-bots/README.md), [billing](./billing/README.md), [connections](./connections/README.md), [cts-types](./cts-types/README.md), [directory](./directory/README.md), [files](./files/README.md), [instance-events](./instance-events/README.md), [instances](./instances/README.md), [invitations](./invitations/README.md), [livekit](./livekit/README.md), [llm](./llm/README.md), [meetings](./meetings/README.md), [notifications](./notifications/README.md), [partnerships](./partnerships/README.md), [plugins](./plugins/README.md), [sessions](./sessions/README.md), [states](./states/README.md), [support](./support/README.md), `system-settings`, [transcription](./transcription/README.md), [web-search](./web-search/README.md), [workflow-overrides](./workflow-overrides/README.md) |

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
