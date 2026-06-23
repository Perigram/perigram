# COMPONENT: Composables & Stores — v24 Standardized

Centralized frontend logic for state management, API interactions, and UI behaviors.

---

## useEntity — Primary Entity Composable

The single entry point for all entity data fetching, updates, status transitions, and **collection listing**.

```js
const result = useEntity(type, identifier?)
```

`type` is the entity type key (see endpoint map below). `identifier` is optional — can be set later via `fetch(id)`.

### Returned interface

| Property / Method | Type | Description |
|---|---|---|
| `entity` | `Ref<object>` | Raw entity JSON from API |
| `loading` | `Ref<boolean>` | True during any async op |
| `error` | `Ref<string\|null>` | Last error message |
| `isTransitioning` | `Ref<boolean>` | Status transition in progress |
| `name` | `ComputedRef<string>` | `entity.identity.name` |
| `slug` | `ComputedRef<string>` | `entity.identity.slug` |
| `serial` | `ComputedRef<string>` | `entity.identity.serial` |
| `reference` | `ComputedRef<string>` | `entity.identity.reference` |
| `state` | `ComputedRef<string>` | `entity.status.state` |
| `stateObject` | `ComputedRef<object>` | Structured v2 status state snapshot |
| `statusRegions` | `ComputedRef<array>` | Active region chips derived from `entity.status.state.regions` |
| `statusColor` | `ComputedRef<string>` | PrimeVue severity string |
| `statusTime` | `ComputedRef<Date>` | `entity.status.timestamp` |
| `statusMeta` | `ComputedRef<object>` | `entity.status.metadata` |
| `statusLifecycle` | `ComputedRef<object>` | Normalized `entity.status.lifecycle` |
| `lineage` | `ComputedRef<object>` | Full lineage block |
| `getAncestorId(type)` | `(type) => string` | `lineage[typeId]` |
| `specs` | `ComputedRef<object>` | Full specs block |
| `formattedDimensions` | `ComputedRef<string>` | `"1200×2400 mm"` |
| `formattedArea` | `ComputedRef<string>` | `"2.88 m²"` |
| `fetch(id?, options?)` | `async () => entity` | Load single entity; pass `{ silent: true }` for fallback lookups such as inline relation refs |
| `create(data?)` | `async (data) => entity` | POST to create entity |
| `update(data)` | `async (data) => entity` | PATCH entity |
| `remove(id?)` | `async () => void` | DELETE entity |
| `changeStatus(state, metaOrContext?)` | `async () => result` | State machine transition |
| `list(filters?)` | `async (filters?) => items[]` | Fetch collection (see below) |
| `items` | `Ref<array>` | Results from last `list()` call |

Entity JSON is strict block DTO data: root `_id` plus canonical blocks only.
`useEntity` exposes convenience computed refs for `identity`, `status`,
`lineage`, and `specs`, but it does not rely on root aliases such as
`entity.id`, `entity.name`, `entity.slug`, `entity.type`, or
`entity.parameters`.
`state` is the primary lifecycle string derived from structured
`status.state.primary`; `stateObject` and `statusRegions` expose the full v2
machine state when a surface needs region details.

### Fetching a single entity

```js
const { entity, fetch, name, state, changeStatus } = useEntity('project', slug);
onMounted(() => fetch());
```

### Fetching a collection (replaces useEntityList)

```js
const { items, list, loading } = useEntity('queue');
onMounted(() => list({ 'lineage.projectId': projectId }));
// items is a ref<array> updated after each list() call
// call list() again with new filters to refresh
```

### Endpoint map

Endpoint metadata is supplied by the injected CutKit domain UI adapter from
`plugins/cutkit-domain.js`; `useEntity` remains the app-facing compatibility
composable and does not import the CNC domain package directly.
During server-side rendering, `useEntity` forwards the incoming request cookie
to internal `$fetch` calls. Generated process screens can therefore load
authenticated entity sources during SSR without receiving false 401s from
server API routes.

| Type key | Single endpoint | List / create endpoint |
|---|---|---|
| `material` | `/api/materials/:id` | `/api/materials` |
| `project` | `/api/project/:id` | `/api/project` |
| `queue` | `/api/queue/:id` | `/api/queue` |
| `requisition` | `/api/requisitions/:id` | `/api/requisitions` |
| `materialPile` / `pile` / `batch` | `/api/material-piles/:id` | `/api/material-piles` |
| `sheet` | `/api/sheets/:id` | `/api/sheets` |
| `remnant` | `/api/remnants/:id` | `/api/remnants` |
| `cassette` / `cassetteTemplate` | `/api/cassettes/:id` | `/api/cassettes` |
| `cassetteInstance` | `/api/cassette-instances/:id` | `/api/cassette-instances` |
| `cassetteDesign` | `/api/cassette-designs/:id` | `/api/cassette-designs` |
| `sheetDesign` | `/api/sheet-designs/:id` | `/api/sheet-designs` |
| `artifact` | `/api/artifacts/:id` | `/api/artifacts` |
| `catalog` | `/api/catalogs/:id` | `/api/catalogs` |
| `color` | `/api/colors/:id` | `/api/colors` |
| `warehouse` | `/api/warehouses/:id` | `/api/warehouses` |
| `user` | `/api/users/:id` | `/api/users` |
| `organization` | `/api/organizations/:id` | `/api/organizations` |
| `nestingRun` | `/api/nesting-runs/:id` | `/api/nesting-runs` |

The domain UI adapter registers both design-system surface keys and backend
entity aliases, so `materialPile` and `material_pile` resolve to the same
endpoint. New UI code should use surface keys because they identify the
intended card contract.

> **Note:** Queue listing for a project should use the project-scoped
> sub-resource `/api/project/:slug/queues` when the screen is already inside a
> project workspace. Generated process screens that need an organization-level
> queue source use the canonical collection endpoint `/api/queue`; the app does
> not expose `/api/queues`.

---

## useBlocks — Low-level Block Composables

```js
import { useIdentity, useStatus, useLineage, useSpecs } from './useBlocks';
```

⚠️ **Restricted use**: Only imported by shared block components (`IdentityBlock.vue`, `EntityStatus.vue`, `SpecsBlock.vue`). Entity cards and pages **must not** import directly — use the block components or the computed refs from `useEntity` instead.

Exception: `useStatus` may be used in entity cards for a `v-if` conditional (not display).

---

## useStatusController

Direct bridge to the State Machine Engine. Used internally by `useEntity.changeStatus()`.
All standard workflow transitions go through `POST /api/status/transition`.
Interactive status controls load server-authorized actions from
`GET /api/status/actions`, so frontend components do not duplicate transition
permission checks.
After a successful transition, `useStatusController` emits a browser-local
entity-change event for the changed entity and any related entities returned in
transition `effects`. Transition responses normalize effects as grouped arrays
(`effects.entities`, `effects.tasks`, `effects.transitions`, and
`effects.events`); legacy array-shaped responses remain tolerated by the browser
event bridge.

```js
const { transition, fetchActions, isTransitioning } = useStatusController();
const actions = await fetchActions(type, id);
await transition(type, id, newState, metadata);
await transition(type, id, newState, {
  metadata: { note: 'Measured after milling' },
  lifecycle: { attachments: { geometry: geometryRef } }
});
await transition(type, id, newState, { intent: 'acceptNestingRun' });
await transition(type, id, newState, { region: 'qa' });
```

---

## useStatusHistory

Fetches and reactively manages the audit log (`status_events`) for an entity.

```js
const { events, fetch } = useStatusHistory(type, id);
```

Used by `<StatusHistory>` component.

---

## useGeneratedScreen

Loads process-compiled screen manifests for `pages/screens/[screenKey].vue`.
The composable normalizes the screen contract, checks source-level process
requirements against the active permission grants before fetching, and then
loads entity data through `useEntity()`. It supports list and single-entity
sources, assignment-bound filters/identifiers, and exposes source states to the
generated renderer.

Generated screens are UI composition only. They decide which regions, sources,
and action buttons are visible, while API routes still enforce real access.
Manual generated-screen actions post to the active process action endpoint,
which verifies the compiled action manifest before delegating to the relevant
entity, status, socket, or command runtime.
When a generated source comes from a role with several status-scoped grants for
the same entity feature, `useGeneratedScreen` derives a role-local
`primaryStatuses` list from the source requirement and passes it to
`useEntity.list()`. This keeps a multi-role user's role-specific screen from
showing records that are only visible through another assigned role.

---

## useTraceability

Resolves ancestry and descendants via the lineage block.

```js
const { ancestors, descendants, fetch } = useTraceability(entity);
```

Used by `<TraceChain>` component.

---

## State Management (Pinia) — stores/

| Store | Contents |
|---|---|
| `auth.js` | Session, user profile, global organization context |
| `queues.js` | Nesting jobs state |
| `cassettes.js` | User templates and designs |
| `global.js` | Layout, notifications, shared lookup lists |

`auth.js` prefers server-provided `effectivePermissions` and `navigation` when
the active organization has an active process definition. Membership
permissions remain the fallback for organizations that have not activated a
process.

---

## Usage Examples

```js
// Load and display a project
const { entity, fetch, name, state, changeStatus } = useEntity('project', slug);
onMounted(() => fetch());
const close = () => changeStatus('CLOSED', { note: 'Done' });
const mill = () => changeStatus('MILLED', {
  metadata: { note: 'Measured after milling' },
  lifecycle: { attachments: { geometry: geometryRef } }
});

// List all queues in a project
const { items: queues, list, loading } = useEntity('queue');
onMounted(() => list({ 'lineage.projectId': project.value._id }));

// Read computed block values
const { serial, specs, formattedArea } = useEntity('sheet', id);
// <span>{{ serial }}</span>  <span>{{ formattedArea }}</span>
```

## Related

- [server/core/blocks/README.md](../server/core/blocks/README.md) — Backend block classes
- [server/core/machines/README.md](../server/core/machines/README.md) — State machine definitions
- [components/shared/README.md](../components/shared/README.md) — Block display components
