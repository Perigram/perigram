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
| `service.js` | All business logic and cross-module calls. Uses the access engine for authorization and registers with the entity service registry. |
| `index.js` | **Public API.** Exports `service` namespace only — never `repository` or `model`. |

`node scripts/check-arch.js` enforces this structure for the declared entity
feature set. Run before every commit.

### Entity vs Capability Modules

The strict Golden Path applies to persisted entities with a stable block DTO.
Support capabilities are documented and classified, but do not need empty
`model.js` files just to satisfy the checker.

| Kind | Modules |
|---|---|
| Entity modules | `artifacts`, `cassette-designs`, `cassette-instances`, `cassettes`, `catalogs`, `colors`, `material-piles`, `nesting-runs`, `organizations`, `projects`, `queues`, `remnants`, `requisitions`, `sheet-designs`, `sheets`, `users`, `warehouses` |
| Capability modules | `files`, `invitations`, `layer-standards`, `material-options`, `materials`, `nesting`, `notification`, `parametric-cassettes`, `payment`, `pen-templates`, `results`, `sessions`, `statuses`, `support`, `system-settings`, `tool-profiles` |

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

Services are registered in the global service registry on module load:
```js
registerEntityService('project', { getById, list, create, update });
```

---

## Core Feature Modules

| Module | Entity | Key lineage fields |
|---|---|---|
| `projects` | Root production container | `organizationId` |
| `queues` | Nesting job / batch | `organizationId`, `projectId` |
| `sheets` | Physical sheet or digital design | `organizationId`, `projectId`, `queueId` |
| `material-piles` | Inventory batch | `organizationId`, `warehouseId` |
| `cassette-designs` | Master CAD template | `organizationId` |
| `cassette-instances` | Manufactured part (digital twin) | `organizationId`, `projectId`, `queueId`, `cassetteDesignId` |
| `nesting-runs` | Nesting engine output | `organizationId`, `projectId`, `queueId` |
| `remnants` | Leftover material | `organizationId`, `projectId`, `queueId` |
| `requisitions` | Procurement workflow | `organizationId`, `projectId` |
| `artifacts` | DXF/SVG/PDF files | mirrors parent lineage |
| `organizations` | Tenant root | — |
| `users` | User accounts | `organizationId` (via memberships) |
| `warehouses` | Material storage locations | `organizationId` |
| `catalogs` | Material specifications | `organizationId` |

---

## Design Rules

- **No cross-module DB access**: Services call other services through the explicit app registry or local imports approved by the feature boundary, never foreign repositories.
- **Access boundary**: Entity services, workflow transitions, and command handlers use `server/core/access/` for permission decisions.
- **Blocks import path**: `~/server/core/blocks/index.js` — never `~/server/utils/blocks.js` (deprecated)
- **toJSON() rules**: spread `super.toJSON()`; do not re-emit `name`, `slug`, `serial`, `reference`
- **data vs identity**: `serial` and `reference` live in `identity` only; feature-specific state goes in `data`
- **summary**: computed aggregates (counts, totals) — always a separate field, never mixed into `data`

## Related

- [server/core/blocks/README.md](../core/blocks/README.md) — Block class API
- [server/core/machines/README.md](../core/machines/README.md) — Lifecycle engine
- [server/utils/README.md](../utils/README.md) — Permissions API
- [server/features/_template/README.md](./_template/README.md) — Golden Path template
- [packages/domain-cnc/README.md](../../packages/domain-cnc/README.md) — CNC entity/workflow definition pack
