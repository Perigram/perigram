# COMPONENT: Composables

Parent: [root README](../README.md).

---

## Entity data access — the instances store

All entity reads, mutations, and caching live on the instances store
(`stores/instances.js` — the canonical contract is
[stores/README.md](../stores/README.md)). Reads use
`fetchInstance`/`listInstances` (`resolveReadableReference` for optional
refs); direct feature CRUD uses
`createInstance`/`updateInstance`/`removeInstance`, which carry the shared
entity-event emission contract; process actions run through `runAction`.

---

## useBlocks — Low-level Block Composables

```js
import { useLineage } from './useBlocks';
```

⚠️ **Restricted use**: shared state/trace primitives only (`TraceChain.vue`
imports it); instance cards and pages consume the composables instead. See
[components/shared/README.md](../components/shared/README.md#critical-architectural-rule-blocks-vs-composables).

---

## useStatePolicy — the flat state vocabulary source

Every state surface — generated screens and the shared instance chrome
(`InstanceState`, `StateHistory`, `InstanceCard` visibility,
`InstanceInlineRef` compact chips) — resolves labels, severities, icons, and
terminal flags through `useStatePolicy()`, which derives the per-type state
policy map from the compiled producer workflows the auth hydration payload
already carries. The resolver contract is canonical in
[shared/ui-mapping](../shared/ui-mapping/README.md).

```js
const { policyByType, policyFor } = useStatePolicy();
const policyByValue = policyFor(() => props.typeId); // reactive per-type map
```

---

## useMotion — GSAP motion patterns

```js
import { loadGsap, useEnterExit, enterOnce, riseAndFade } from './useMotion.js';
```

GSAP is the one motion engine, loaded lazily: `loadGsap()` dynamic-imports
it once per session, and every pattern below only touches the engine from
client lifecycle hooks, so GSAP stays out of the SSR critical path. The
preset's `--p-transition-duration` owns generic component states.

| Pattern | Use |
|---|---|
| `useEnterExit(elRef, active, { y, duration })` | Single-element presence (tooltips, drawers, message rows). The element stays mounted; visibility animates opacity plus a vertical offset; reduced motion resolves to immediate show/hide with no spatial movement. |
| `enterOnce(el, { y, duration })` | One-shot enter for freshly appended rows (streamed chat messages, live list items). Fire-and-forget from the live-update path; reduced motion is a no-op. |
| `riseAndFade(el, { y, duration })` | Transient badge motion (floating call reactions): rises and fades once, returns a completion promise for caller cleanup; reduced motion resolves immediately. |

Every pattern consumes `useReducedMotion()`. Consumers: the support chat
(`useEnterExit` typing indicator, `enterOnce` streamed message rows in
`ChatSupport`) and floating call reactions (`riseAndFade` in `CallPanel`).
JavaScript motion beyond PrimeVue's CSS states stays inside its owning
derived composition per the components motion policy.

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
composable resynchronizes the active topic set, so consumers are free of
reconnect handling. `status` is `idle | connecting | open | reconnecting |
error`;
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

## useScreenSourceSync

`useScreenSourceSync(screenGetter, reload)` reconciles a generated surface
with the shared instance-event contract (the reconciliation semantics are
canonical in [stores/README.md](../stores/README.md)). The routed generated
screen page and the workspace detail pane both mount it through
`GeneratedScreenHost`; the host's overload branch (`useGeneratedScreen`)
keeps its own listener of the same shape.

## useContainerTraits

The container-traits measurement seam of the generative UI
([shared/ui-mapping](../shared/ui-mapping/README.md) → Arrangement).
`useContainerTraits(elRef, { hostKind, density })` observes one host
element and resolves the full container-trait record
(`resolveContainerTraits` — width step from `CONTAINER_WIDTH_STEPS`,
height/scroll from `HOST_PROFILES`, density passthrough), re-resolving on
host resize; arrangement fragments (the peer-column engagement in
[components/ui-mapping](../components/ui-mapping/README.md)) measure where
they render. `provideContainerTraits({ hostKind, elRef? })` is the host
side: measuring hosts (the workspace pane) observe their own box,
fixed-shape hosts (the record popup) provide the profile alone.
`provideDefaultContainerTraits(...)` is the routed surface's declaration:
it provides the measured page record only when no host declared its own,
so a pane or popup host stays authoritative.
`providePlacementContainer(elRef)` is the placement box (a record side
column, a peer-column track): its own measured width is the truth while
height/scroll/density inherit the host record it renders in.
`useHostContainerTraits()` resolves the nearest record — the page profile
is the providerless default — and budgets consume it (compact table
columns in `narrow`/`medium` boxes, compact card facts in `narrow` ones).

## useStateController

Direct bridge to the State Machine Engine. All standard workflow transitions go through `POST /api/state/transition`.
Interactive status controls load server-authorized actions from
`GET /api/state/actions`, so frontend components do not duplicate transition
permission checks.
After a successful transition, `useStateController` emits the same
browser-local entity sync event for the changed entity and any related entities
returned in transition `effects`. Transition responses normalize effects as
grouped arrays (`effects.entities`, `effects.tasks`, `effects.transitions`, and
`effects.events`).

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

The outbox semantics — the IndexedDB queue, the typed `OfflineQueuedError`,
sequential replay with `Idempotency-Key` dedup, and the `OfflineOutboxBadge`
sync surface — are canonical in the root README's PWA section and
[server/core/idempotency](../server/core/idempotency/README.md). The
composable-side contract: the instances store's CRUD verbs
(`createInstance`/`updateInstance`/`removeInstance`),
`useStateController.transition`, and generated screen actions post through
the outbox store (`stores/outbox.js`). Online calls pass through unchanged;
when the browser is offline — or the network fails mid-flight — the caller
receives `OfflineQueuedError`: the instances store rolls the optimistic
preview back to the server-known state, the error surfaces through the
caller's `error` ref, and generated action dialogs treat it as accepted
(info toast, no result application).

---

## useBrowserNotifications

```js
const { permission, enabled, busy, canEnable, pushAvailable, refreshPushConfig, enable, disable, show } = useBrowserNotifications();
```

Owns desktop-notification consent and delivery: the persisted
`perigram.browserNotifications` setting, the `Notification.requestPermission`
flow (invoked only from the profile preferences toggle, never on load), the
Web Push subscribe/unsubscribe round-trip through the registered service
worker, and the guarded `show()` used by `plugins/notifications.client.js`.
`pushAvailable` mirrors the server's push configuration
(`/api/notifications/config`) and is refreshed by the settings surface on
open, so the toggle can state that closed-tab delivery is unavailable
instead of failing silently (runbook: deploy README, Configuration).
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

## useEntityPopup

The popup-openable law: a type is popup-openable exactly when a surface
exists to render it — the directory profile for `user`/`organization`, a
compiled or synthesizable detail screen, or the record floor over the served
type view. A type absent from the served type view has no record surface
anywhere (panes stay silent for it too), so callers render a plain label and
`open()` refuses. Consumed by `InstanceInlineRef`, `InstanceCard`, and
`UserChip`.

---

## useGeneratedScreen

Loads process-compiled screen sources for `GeneratedScreenHost`'s overload
branch (the home workspace). The composable normalizes the screen contract,
checks source-level process requirements against the active permission
grants before fetching, and then loads entity data through the instances
store. It supports list and single-entity sources, assignment-bound
filters/identifiers, and exposes source states to the overload component.
During server-side rendering, it and page-level loaders forward the incoming
request cookie to internal `$fetch` calls so authenticated sources load
without false 401s.

Home sources retain raw access-filtered list results and derive their
visible top-level rows after every source has loaded. Runtime filtering reads
the active process's compiled `lineageBindings` and matches their exact
ancestor keys against the entities loaded by other Home sources; root
filtering applies to home sources only. The derived source state retains
`rawItems` so the renderer can distinguish an empty top-level source from a
child source whose rows were all suppressed. A child is hidden when any
readable non-organization ancestor identified by a compiled binding is
present in another home source; with no readable ancestor it remains
top-level. An active definition must be reapplied after a Lineage/compiler
contract change.

Generated screens reconcile through the shared instance-event contract
(canonical semantics in [stores/README.md](../stores/README.md)): a complete
entity snapshot patches matching sources in place — appended to a list source
only when it satisfies that source's resolved filters, deleted ids removed
from every list source of that entity type, single-mode sources patched only
when the changed id matches the source's resolved identifier — and
snapshot-less events schedule one debounced source reload. Filter matching
and `$screen.` reference resolution (`entityMatchesFilters`,
`resolveSourceFilters`, `resolveSourceIdentifier`) are pure contracts in
[utils/generated-screen-source.js](../utils/README.md): bare declared
lineage keys read through the wire DTO's `lineage` block, so a created child
carrying its parent ref lands in the open parent detail's child region.

Generated screens are UI composition only. They decide which regions, sources,
and action buttons are visible, while API routes still enforce real access.
`stores/auth.js` exposes generated screen manifests as effective user views:
auto-generated role/entity screens are merged by entity, template, and scope
before generated pages, menus, and breadcrumbs consume them; breadcrumb
sibling menus use only generated hub/list screens, and detail screens stay
paired with their list screen. Manual generated-screen actions post to the
active process action endpoint, which verifies the compiled action manifest
before delegating to the relevant entity, status, socket, or command runtime.
Collection actions also receive the current screen/region context. If an action
declares a parent entity type, the generated screen sends the active parent id
from `$screen.scope` in the `entities` map, so child constructors inside a
parent detail page receive their lineage parent. Generated action dialogs
render entity-list construction fields as multi-select controls backed by the
domain UI endpoint registry; submitted values are normalized into the action
input path before posting to the process runtime.

---

## Process designer composables

The organization process page
([pages/organization](../pages/organization/README.md)) delegates process
catalog selection, persistence, graph selection/editing, connection
inference, palette filtering, inspector records, roles, screens, and
dock/panel state to focused `useProcessDesigner*` composables. The page
remains the view composition root; these composables own mutations for their
concern and are behavior-tested without reading Vue source text. Node
selection is authoritative at click time: `selectNode`/`selectEdge`
synchronize the canvas `selected` flags, so deletion always hits the clicked
node even through a stale flag left by a palette drop or a finished
rubber-band (`useProcessDesignerCanvasModel.spec.js` drives the full
lifecycle — declaration authoring, wiring, renames, deletions — against this
invariant).

- `useProcessDesignerLiveGraph` is the realtime evaluation loop: one
  semantic signature over authoring state (nodes minus presentation, edges,
  draft records) re-runs `interpretDeclarationEdges`
  ([`@perigram/processes`](../packages/processes/README.md)) and the page's
  sync pass on every change, so declaration wires re-bind descendants live
  while position drags and selection churn leave evaluation idle.
- `useProcessDesignerNodeSync` keeps the record-level access shapes disjoint:
  effect and `cts.*` records always carry the grant object (`{ level,
  roleIds, grants }`) that compiles into action access, while the Item/List/Tree
  socket-access string is written only onto pure value-algebra records
  (`useProcessDesignerNodeSync.spec.js` pins both).
- `useProcessDesignerScreens` mutates complete semantic screen sources,
  regions, lineage rows, and typed binding/filter maps, then normalizes
  through the [`@perigram/processes` screen
  contract](../packages/processes/README.md). Source mode changes discard
  fields that are invalid for the selected mode. `customize(station)` is the
  composable's only creation verb: it duplicates a compiled inferred station
  into an authored `data.screens` record — fresh id and route,
  compile-derived keys and lineage bindings stripped, station kind preserved
  — so the duplicate begins projection-equal to inference and the compiler's
  redundancy guard refuses it at Apply until the author deviates.

---

## useChatFileUpload

The chat composer's file transport (the server contract lives in
[server/api/README.md](../server/api/README.md) → files): files up to 8MB
POST directly through XHR so upload progress events surface; bigger files
ride resumable chunk sessions — every acknowledged chunk advances
progress, and on disconnect the uploader waits for connectivity, reads the
session's received indexes, and re-sends only the gaps (bounded
resyncs, then a surfaced error). `uploadChatFile(file, { onProgress })`
returns the stored descriptor (`{ id, filename, url }`) every caller
consumes; the staged `File` handle owns the resume, so dropping the draft
abandons the session for the server-side TTL to reap. Voice recordings
upload through the same transport.

## useDirectoryUserSearch

Debounced, stale-response-safe directory user search shared by the chat
pickers (direct, group) and the organization invite dialog (search
contract: [server/features/directory](../server/features/directory/README.md)).
`query` drives it, `results` holds the current matches with the caller's
own entry excluded, `searching` reflects the in-flight request; a query
under two characters clears the results.

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
The cache never serves another organization's view after an org switch,
and a failed fetch is dropped from the cache (consumers keep their
declaration-less fallbacks for that mount; the next consumer retries
instead of inheriting an empty view for the session — the chat upload
window depends on it).

---

## usePayloadUpload

Payload upload contract (CTS SPEC §4): the `file` prompt control uploads
to the `files` bucket and stores the payload reference the construct path
submits (`{ fileId, mime, size, name }`). `usePayloadUpload(values,
{ onError })` binds to the caller's prompt-values object and returns the
uploading flag, the hidden-input element registry, and `uploadPayloadFile`
— `ChatSupport` renders the control through it,
so every file-instance create flows through one upload implementation.

---

## useThemeMode

Theme cookie + document class sync shared by the app shells: the cookie
defaults to the OS preference on first visit and the `dark-mode`/
`light-mode` document class follows every cookie write.

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
(the generated type key with a locale override over the type `name`).
Chats stays the bar's own route tab navigating `/chats`.

---

## usePageBack

```js
const { navigation } = usePageBack({ when: () => route.path === '/organization/users' });
```

The routed-surface back affordance, one shared `{ icon, label, command }`
shape rendered by `StandardPage`'s `back` prop and `SurfaceHeader`'s
navigation channel alike. The command follows in-app history when
vue-router's history state carries an app-internal previous route, and
falls back to the process entry route (the home ladder) so deep links
never dead-end. The affordance turns on client-side after mount (it reads
`window.history`; an SSR/client difference would hydration-mismatch the
header). `when` gates dual-hosted surfaces (the organization pages): the
routed surface owns the back control.

Shell modal state lives in `useModalState.js`: the support chat dialog
and target, and the profile settings popup (`useProfileDialog` — opened
by every account-menu instance and record surfaces through the single
app-level `ProfileSettingsDialog` host).

---

## useCallRoomLabel

```js
const callRoomLabel = useCallRoomLabel();
const label = callRoomLabel(room, t('call.title'));
```

The one display-label resolver for call rooms: the pure grammar helper in
`utils/call-rooms.js` fed with the loaded conversation summaries and the
auth store's viewer id and active organization name. Every call surface
that names a room consumes it — the floating call window, the media
dock's parked-call pill, the home sidebar's active-room rows, and the
full-screen call dialog headers — so one room reads the same name
everywhere. Callers pass their localized fallback.

---

## useFloatingDrag

```js
const { startDrag, applyPersisted, dragging } = useFloatingDrag({ storageKey: 'perigram:call-window-position' });
```

Pointer drag for floating panels (the call window, the media dock card):
the element follows the pointer clamped to the viewport, the resting
position persists per browser under the storage key, and `applyPersisted`
seats a freshly mounted panel at its stored position. `startDrag(event,
el)` binds window listeners until pointer-up and cleans up on unmount;
the call window adds its own size resize beside the shared drag.

---

## State Management (Pinia) — stores/

The store inventory and the client state model live in
[stores/README.md](../stores/README.md).

## Related

- [stores](../stores/README.md)
- [components/shared/README.md](../components/shared/README.md) — `InstanceInlineRef` and the chat seam
