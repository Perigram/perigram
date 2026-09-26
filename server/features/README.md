# COMPONENT: Server Features — v24 Entity Modules

Business logic modules following the v24 Service-Repository-Model pattern.
Persisted entity modules are self-contained vertical slices. Capability modules
that are not entities may live under `server/features/` for now, but they are
classified separately and are not forced into fake v24 entity files.

## Required File Structure

Every feature module in `server/features/[name]/` **must** contain:

| File | Purpose |
|---|---|
| `model.js` | Class extending `BaseEntity`. Defines constructor and `toJSON()`. |
| `repository.js` | Raw MongoDB access only. Uses `toFlexibleId()`. No business logic. |
| `service.js` | All business logic and cross-module calls. Uses the access engine for authorization. |
| `index.js` | **Public API.** Exports `service` namespace only — never `repository` or `model`. |

`node scripts/check-arch.js` derives the entity feature set from the CTS
registry view (framework + mounted pack declarations). Run before every
commit.

### Entity vs Capability Modules

The strict Golden Path applies to persisted entities with a stable block DTO.
Support capabilities are documented and classified, but do not need empty
`model.js` files just to satisfy the checker.

| Kind | Modules |
|---|---|
| Entity modules | `artifact-templates`, `artifacts`, `cassette-designs` (legacy-live until the cassette-design cut), `cassettes`, `instance-revisions`, `organizations`, `process-definitions`, `sheet-designs`, `users` |
| Capability modules | `artifact-conversions`, `billing`, `connections`, `cts-types`, `files`, `instance-events`, `instances`, `invitations`, `livekit`, `nesting`, `notification`, `notifications`, `parametric-cassettes`, `sessions`, `states`, `support`, `system-settings`, `workflow-overrides` |

Types without a feature module — the documents/tech-drawing/facade pack
types and every org-authored type — are served entirely by the generic
instance machinery ([instances](./instances/README.md)); check-arch keeps
their names on the generic list so no feature directory is expected. The
legacy catalogue features (machines, pen-templates, layer-standards,
profile-templates, tool-profiles) and the queue-era aggregates (projects,
queues, nesting-runs, sheets, remnants, requisitions, warehouses,
catalogs, libraries, cassette-instances, geometry-captures) are deleted;
their §3 instances and seeds live on the generic path.

---

## Public API Contract

The **only** way to consume a feature from outside its directory is via its `index.js`:

```js
// ✅ Correct — goes through service layer
import * as projectService from '~/server/features/projects/index.js';

// ❌ Forbidden — bypasses business logic and permissions
import * as repository from '~/server/features/projects/repository.js';
import { Project } from '~/server/features/projects/model.js';
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

## Core Feature Modules

| Module | Entity | Key lineage fields |
|---|---|---|
| `cassettes` | OCCS cassette templates (the cassette file type's service) | `organizationId`, `libraryId` |
| `cassette-designs` | Baked template geometry (legacy-live until the cassette-design cut) | `organizationId`, `projectId`, `queueId` |
| `sheet-designs` | Sheet design layouts (the sheet-design file type's service) | `organizationId`, `runId` |
| `artifacts` | Generated files (DXF/SVG/PDF) | mirrors parent lineage |
| `artifact-templates` | Organization-owned DXF/PDF generation layouts | `organizationId` |
| `organizations` | Tenant root | — |
| `users` | User accounts | `organizationId` (via memberships) |
| `instance-revisions` | Immutable scoped content snapshots | mirrors source lineage plus source entity id |
| `process-definitions` | Organization process graph and compiled runtime contract | `organizationId` |

---

## Design Rules

- **No cross-module DB access**: Services call other services through the explicit app registry or local imports approved by the feature boundary, never foreign repositories.
- **Access boundary**: Entity services, workflow transitions, and command handlers use `server/core/access/` for permission decisions.
- **Blocks import path**: `~/server/core/blocks/index.js` — never `~/server/utils/blocks.js` (deprecated)
- **toJSON() rules**: spread `super.toJSON()`; do not re-emit `name`, `slug`, `serial`, `reference`
- **data vs identity**: `serial` and `reference` live in `identity` only; feature-specific state goes in `data`
- **summary**: computed aggregates (counts, totals) — always a separate field, never mixed into `data`
- **entity synchronization**: successful mutations that should update other
  open sessions publish typed invalidation events through
  `server/features/instance-events`; do not create per-feature polling loops when
  the shared event bus can feed the browser-local `instance-events.js` contract.
- **organization billing**: prepaid service tokens live in
  `server/features/billing` and are owned by organizations. Command-backed
  process services may declare prepaid token cost in the compiled service
  contract; user documents must not be used as spendable balance accounts.

## Related

- [server/core/blocks/README.md](../core/blocks/README.md) — Block class API
- [server/core/machines/README.md](../core/machines/README.md) — Lifecycle engine
- [server/utils/README.md](../utils/README.md) — Permissions API
- [server/features/_template/README.md](./_template/README.md) — Golden Path template
- [server/features/billing/README.md](./billing/README.md) — organization billing account and token ledger
- [server/features/workflow-overrides/README.md](./workflow-overrides/README.md) — organization-owned lifecycle overrides
- [packages/facade/README.md](../../packages/facade/README.md) — facade fabrication pack (types, editors, services)
