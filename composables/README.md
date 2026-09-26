# COMPONENT: Composables & Stores — v24 Standardized

---

## Entity data access — the instances store

The `useEntity` composable and the delegated entity store were deleted:
all entity reads, mutations, and caching live on the instances store
(`stores/instances.js` — see [stores/README.md](../stores/README.md) for
the canonical contract). Reads use `fetchInstance`/`listInstances`
(`resolveReadableReference` for optional refs); direct feature CRUD uses
`createInstance`/`updateInstance`/`removeInstance`, which carry the shared
entity-event emission contract; process actions run through `runAction`.
Block-computed conveniences (`name`, `state`, `specs`) became plain
computeds over the cached wire DTO at their (few) call sites. During
server-side rendering, `useGeneratedScreen` and page-level loaders forward
the incoming request cookie to internal `$fetch` calls so authenticated
sources load without false 401s.

---

## useBlocks — Low-level Block Composables

```js
import { useLineage } from './useBlocks';
```

⚠️ **Restricted use**: Only imported by the shared state/trace primitives
(`TraceChain.vue`). Instance cards and pages **must not**
import directly. See [components/shared/README.md](../components/shared/README.md#critical-architectural-rule-blocks-vs-composables).

---

## useStatePolicy — the flat state vocabulary source

The flat state vocabulary's one client-side source (SPEC §7): it derives the
per-type state policy map from the compiled producer workflows the auth
hydration payload already carries (`statePolicyByType` over
`processPayload.producerOutputs`). Every state surface — generated screens
and the shared instance chrome (`InstanceState`, `StateHistory`,
`InstanceCard` visibility, `InstanceInlineRef` compact chips) — resolves
labels, severities, icons, and terminal flags through it; the resolver
contract itself is canonical in
[shared/ui-mapping](../shared/ui-mapping/README.md).

```js
const { policyByType, policyFor } = useStatePolicy();
const policyByValue = policyFor(() => props.typeId); // reactive per-type map
```

---

## useMotion — GSAP motion patterns

```js
import { loadGsap, useFollowValue, useEnterExit, useStateTransition } from './useMotion.js';
```

GSAP is the project animation engine, loaded lazily: `loadGsap()` dynamic-imports
it once per session, and every pattern below only touches the engine from client
lifecycle hooks, so GSAP never enters the SSR critical path. There is no second
motion library and no application motion token layer; the preset's
`--p-transition-duration` still owns generic component states.

| Pattern | Use |
|---|---|
| `useFollowValue(initial, { duration, ease })` | Smoothed numeric follow for continuously recomputed targets (pointer proximity, dock magnification). Call `set(target)` as often as input fires; `jump(target)` snaps without animation and is the reduced-motion switch. |
| `useEnterExit(elRef, active, { y, duration })` | Single-element presence (tooltips, drawers, message rows). The element stays mounted; visibility animates opacity plus a vertical offset; reduced motion resolves to immediate show/hide with no spatial movement. |
| `enterOnce(el, { y, duration })` | One-shot enter for freshly appended rows (streamed chat messages, live list items). Fire-and-forget from the live-update path; reduced motion is a no-op. |
| `riseAndFade(el, { y, duration })` | Transient badge motion (floating call reactions): rises and fades once, returns a completion promise for caller cleanup; reduced motion resolves immediately. |
| `useStateTransition(containerRef, { duration, scale })` | Parameter-to-state animation. Call `capture()` while the previous rendered state is still in the DOM, apply the reactive update, then `play()` — a clone of the real previous state crossfades out over the new one. The animation always starts from the actual previous state, never from defaults. The container owns `position: relative` and clipped overflow; reduced motion skips the overlay. |

Every pattern consumes `useReducedMotion()`. Consumers today:
`ProcessDesignerDockItem` (magnification follow + tooltip enter/exit) and the
queue editor cassette parameter preview (`useStateTransition` on
`CassetteThumbnail` re-renders).
JavaScript motion that PrimeVue cannot provide stays inside its owning derived
composition per the components motion policy.

---

## useConnections — realtime connections layer

```js
const { status, onlineUserIds, subscribe } = useConnections();
const unsubscribe = subscribe('conversation:support:123', (payload) => { ... });
```

One module-scoped `EventSource` per browser tab carries every realtime topic:
`user:<id>` self pings, `org:<id>` presence snapshots, `admin-support`, and
feature topics such as `conversation:<key>`. The server enforces topic
admission; `subscribe` returns an unsubscribe function and drops the server
subscription when the last handler goes away. After every (re)connect the
composable resynchronizes the active topic set, so consumers never handle
reconnects themselves. `status` is `idle | connecting | open | error`;
`onlineUserIds` is a reactive Set of user ids with a live connection in the
active organization. Contract details live in
[the connections feature](../server/features/connections/README.md).

---

## useReducedMotion

```js
const reducedMotion = useReducedMotion();
```

Returns a readonly boolean ref for the operating system's
`prefers-reduced-motion` setting. Shared design-system primitives that use
JavaScript motion must consume it to remove spatial movement while retaining
the control's state and keyboard behavior. CSS duration overrides live beside
the same media query in `assets/css/main.css`; do not add a separate page-level
preference implementation.

---

## useStateController

Direct bridge to the State Machine Engine. Used internally by `useEntity.changeStatus()`.
All standard workflow transitions go through `POST /api/state/transition`.
Interactive status controls load server-authorized actions from
`GET /api/state/actions`, so frontend components do not duplicate transition
permission checks.
After a successful transition, `useStateController` emits the same
browser-local entity sync event for the changed entity and any related entities
returned in transition `effects`. Transition responses normalize effects as
grouped arrays (`effects.entities`, `effects.tasks`, `effects.transitions`, and
`effects.events`); legacy array-shaped responses remain tolerated by the browser
event bridge.

```js
const { transition, fetchActions, isTransitioning } = useStateController();
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

## Offline Mutations & Outbox

On the client, `useEntity` CRUD, `useStateController.transition`, and
generated screen actions post through the outbox store (`stores/outbox.js`,
backed by the IndexedDB queue and typed `OfflineQueuedError` in
`utils/outbox.js`). Online calls pass through unchanged but carry an
`Idempotency-Key` header (see
[server/core/idempotency](../server/core/idempotency/README.md)). When the
browser is offline — or the network fails mid-flight — the operation is
queued in IndexedDB and the caller receives `OfflineQueuedError`: entity
composables surface its message through their `error` ref without faking
local state, and generated action dialogs treat it as accepted (info toast,
no result application). When connectivity returns, the store replays
operations sequentially through the same endpoints and emits the shared
entity-event contract with `source: 'outbox'`, so open screens apply snapshots
or schedule debounced reloads exactly like local mutations. Replayed 4xx
responses park the operation as failed in the `OfflineOutboxBadge` panel for
manual retry/discard; network and 5xx failures stop the flush and retry
later. Reads need no app code: the service worker serves cached
`GET /api/**` responses when the network is unavailable (root README, PWA
section).

---

## useBrowserNotifications

```js
const { permission, enabled, busy, canEnable, enable, disable, show } = useBrowserNotifications();
```

Owns desktop-notification consent and delivery: the persisted
`perigram.browserNotifications` setting, the `Notification.requestPermission`
flow (invoked only from the profile preferences toggle, never on load), the
Web Push subscribe/unsubscribe round-trip through the registered service
worker, and the guarded `show()` used by `plugins/notifications.client.js`.
The plugin derives the three notification kinds from the connections stream
(`support.inbox` messages, `call.invite` calls with a WebAudio ring loop,
`entityChanged` status transitions on the org topic) and respects visibility:
status and message notifications fire only while the tab is hidden, calls
fire everywhere except `/chats`. Closed-tab delivery is Web Push (see
[the notifications feature](../server/features/notifications/README.md)).

---

## useStateHistory

Fetches and reactively manages the audit log (`status_events`) for an entity.

```js
const { events, fetch } = useStateHistory(type, id);
```

Used by `<StateHistory>` component.

---

## useGeneratedScreen

Generated home sources retain raw access-filtered list results and derive their
visible top-level rows after every source has loaded. Runtime filtering reads
the active process's compiled `lineageBindings` and matches their exact
ancestor keys against the entities loaded by other Home sources. Process mode
has no alias, arbitrary-`*Id`, or static-containment fallback; an active
definition must be reapplied after a Lineage/compiler contract change.
The derived source state retains `rawItems` so the renderer can distinguish an
empty top-level source from a child source whose rows were all suppressed. A
child is hidden when any readable non-organization ancestor identified by a
compiled binding is present in another home source; with no readable ancestor
it remains top-level. Non-home sources are never root-filtered.

The organization process page delegates process catalog selection, persistence,
graph selection/editing, connection inference, palette filtering, inspector
records, roles, screens, and dock/panel state to focused
`useProcessDesigner*` composables. Node selection is authoritative at click
time: `selectNode`/`selectEdge` synchronize the canvas `selected` flags, so
a stale flag left by a palette drop or a finished rubber-band can never
redirect deletion onto a node other than the one clicked
(`useProcessDesignerCanvasModel.spec.js` drives the full lifecycle —
declaration authoring, wiring, renames, deletions — against this invariant). The page remains the view composition root;
these composables own mutations for their concern and are behavior-tested
without reading Vue source text.
`useProcessDesignerLiveGraph` is the designer's realtime evaluation loop: one
semantic signature over authoring state (nodes minus presentation, edges,
draft records) re-runs `interpretDeclarationEdges`
([`@perigram/processes`](../packages/processes/README.md)) and the page's sync
pass on every change, so declaration wires re-bind descendants live while
position drags and selection churn never re-evaluate.
`useProcessDesignerNodeSync` keeps the record-level access shapes disjoint:
effect and `cts.*` records always carry the grant object (`{ level,
roleIds, grants }`) that compiles into action access, while the Item/List/Tree
socket-access string is written only onto pure value-algebra records
(`useProcessDesignerNodeSync.spec.js` pins both).
`useProcessDesignerScreens` mutates complete semantic screen sources, regions,
lineage rows, and typed binding/filter maps, then normalizes through the
[`@perigram/processes` screen contract](../packages/processes/README.md). Source
mode changes discard fields that are invalid for the selected mode rather than
keeping a page-local shadow shape. `customize(station)` is the composable's
only creation verb (crystallization Phase 4): it duplicates a compiled
inferred station into an authored `data.screens` record — fresh id and route,
compile-derived keys and lineage bindings stripped, station kind preserved —
so the duplicate begins projection-equal to inference and the compiler's
redundancy guard refuses it at Apply until the author deviates.

Loads process-compiled screen manifests for `pages/screens/[screenKey].vue`.
The composable normalizes the screen contract, checks source-level process
requirements against the active permission grants before fetching, and then
loads entity data through `useEntity()`. It supports list and single-entity
sources, assignment-bound filters/identifiers, and exposes source states to the
generated renderer.
Generated screens listen to the shared browser-local entity sync event and
apply its complete entity snapshot directly to matching source state. A local
create, update, or delete therefore becomes visible immediately without a
polling request or a manual page reload. The patch is semantic, not
positional: a changed entity replaces the matching item in place and is
appended to a list source only when it satisfies that source's resolved
filters; a delete event removes the id from every list source of that entity
type. Single-mode sources patch only when the changed id matches the source's
resolved identifier. Filter matching is the pure `entityMatchesFilters`
contract in
[utils/generated-screen-source.js](../utils/README.md): bare declared
lineage keys read through the wire DTO's `lineage` block, so a created child
carrying its parent ref lands in the open parent detail's child region — the
generated hierarchy accumulates without a reload. Events without a complete
snapshot are the only case that
schedules a (debounced) source reload; API routes still enforce whether the
source may read the changed instance. `GeneratedScreen.applyActionResult` feeds
the same `applyInstanceSnapshot` path synchronously from the action response, so
a successful procedural action patches affected sources before any sync event
arrives.

Generated screens are UI composition only. They decide which regions, sources,
and action buttons are visible, while API routes still enforce real access.
`stores/auth.js` exposes generated screen manifests as effective user views:
auto-generated role/entity screens are merged by entity, template, and scope
before generated pages, menus, and breadcrumbs consume them. Breadcrumb sibling
menus use only generated hub/list screens; detail screens stay paired with
their list screen instead of appearing as duplicate top-level destinations.
Manual generated-screen actions post to the active process action endpoint,
which verifies the compiled action manifest before delegating to the relevant
entity, status, socket, or command runtime.
Collection actions also receive the current screen/region context. If an action
declares a parent entity type, the generated screen sends the active parent id
from `$screen.scope` in the `entities` map, so child constructors such as queue
creation inside a project detail page receive their lineage parent.
Generated action dialogs render entity-list construction fields as multi-select
controls backed by the domain UI endpoint registry. Submitted values are
normalized into the action input path before posting to the process runtime.
When a generated source comes from a role with several status-scoped grants for
the same entity feature, `useGeneratedScreen` derives a role-local
`primaryStates` list from the source requirement and passes it to
`useEntity.list()`. This keeps a multi-role user's role-specific screen from
showing records that are only visible through another assigned role.

---

## useFileTypeView

Organization-scoped cached read of the served CTS type view
(`GET /api/admin/cts/types`). One in-flight fetch per organization is
shared by every consumer; components resolve type records by id through
`typeById(typeId)` — exact kebab ids first, then snake/camel spellings
normalized to kebab, so legacy callers resolve the same declaration. File
surfaces use it to derive editor bindings and payload preview policy from
declarations instead of hardcoded entity tables (see
[components/generated/README.md](../components/generated/README.md)),
and fact-row surfaces (`InstanceSurfaceContent`, entity cards, generated
collections) resolve their display descriptors from the same view: the
bundle's derived display policy is the one fact vocabulary
([utils/README.md](../utils/README.md) → `instance-display-contract.js`).
The cache never serves another organization's view after an org switch.

---

## usePayloadUpload

Payload upload contract (CTS SPEC §4): the `file` prompt control uploads
to the `files` bucket and stores the payload reference the construct path
submits (`{ fileId, mime, size, name }`). `usePayloadUpload(values,
{ onError })` binds to the caller's prompt-values object and returns the
uploading flag, the hidden-input element registry, and `uploadPayloadFile`
— `GeneratedScreen` and `ChatSupport` render the same control through it,
so every file-instance create flows through one upload implementation and
no surface mints artifact entities.

---

## useMobileHomeTabs

```js
const { tabs, activeKey, selectTab } = useMobileHomeTabs();
```

The canonical mobile home tab contract: the home workspace sidebar
tree's top level as one fixed tab list. Roots derive exactly like the
desktop tree (manifest-backed typeList types plus their containment
ancestors form the visible set; a visible type that is another visible
type's containment child is not a root; structural ancestors without a
compiled screen are folders, not tabs). The selection is shared app
state: the app-shell bottom bar writes it and highlights it, the home
workspace's mobile branch renders the selected screen, and an unknown
or unset key resolves to the first tab. Tab labels are procedural only
(the generated type key with a locale override over the type `name`); no entity contracts participate. Chats is not part of this
contract — it stays the bar's own route tab navigating `/chats`.

---

## State Management (Pinia) — stores/

| Store | Contents |
|---|---|
| `auth.js` | Session, user profile, global organization context |
| `cassettes.js` | User templates and designs |
| `global.js` | Layout, notifications, shared lookup lists |
| `outbox.js` | Offline mutation queue, connectivity state, replay |

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
