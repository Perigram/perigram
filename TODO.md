# TODO

## LiveKit grant authorable in the permissions UI (2026-10-02)

- [ ] The process page's grant editor only lists screen-derived features;
  capability features like `livekit` (SPEC §Calls) cannot be granted from
  any UI. Add them to the permission feature catalog so orgs can restrict
  org calls from role settings.

## Chat popup expand routes on mobile; poisoned persisted tab ids drop (2026-10-02)

- [ ] The chat popup's expand landed on an empty home on mobile (pending
  chat tab consumed by a workspace with no panes) — it routes to
  `/chats` with the thread preset through the shared chat target now.
- [ ] Persisted workspace tabs carrying corrupted ids (literal
  "null"/"undefined" strings) produced `/api/directory/:type/null` 404s
  on every home mount — the hydration watcher drops them.

### Agent Notes (2026-10-02)

Session `agent/chat-expand-mobile-20261002`. Owner console trace pinned
both: `ChatSupport.vue:3043 → chat-workspace-open.js:38 → navigateTo`
ending on the empty home (the org-open bug's twin — desktop-only tab
flow with no mobile branch), and
`GeneratedHomeWorkspace.vue:879-888 → instances.js:255` fetching
`/api/directory/organization/null` from a persisted entity ref whose id
is the string "null" (falsy guards can't catch it). Expand now presets
`{ conversationKey }` chat targets consumed by ChatSupport on mount,
and the hydration watcher rejects empty/"null"/"undefined" ids before
the readable-reference resolution.

## Own organization opens its page on mobile; expand restored with real targets (2026-10-02)

- [ ] The active organization on mobile routed into the directory popup
  (cropped profile, no management) because the org overview system screen
  carries no `sources` entry, so `detailRouteForInstance` never matches
  it. The mobile workspace-open seam now routes the active org to the
  org overview screen (`/organization`); expand renders wherever it has a
  target and every popup carries PrimeVue's own maximize toggle.

### Agent Notes (2026-10-02)

Session `agent/active-org-mobile-20261002`. Owner verdict on the previous
pass: hiding expand removed the affordance instead of fixing it. Root
cause of "cropped popup for my own org": `organizationOverview` declares
top-level `typeId` but no `sources`, so the detail-route resolver (which
keys on `sources[].typeId`) finds nothing for organizations — desktop
masks this with the pane-overview path, mobile fell to the bounded
popup. Fixed at the seam (active org → overview route), expand is
target-aware (desktop pane; mobile routed pages incl. the active org),
and `maximizable` gives every popup PrimeVue's native full-screen
toggle.

## Entity popup header title, mobile expand, chat inline refs (2026-10-02)

- [ ] EntityPopup's header rendered `{{ title }}` with no `title` defined
  — empty header, only icon buttons (the reported "no identifier").
- [ ] Expand on mobile closed and re-opened the same dialog (the mobile
  workspace-open fallback loops back into the popup); the button is
  desktop-only now — on mobile the dialog is the terminal surface.
- [ ] ChatSupport lost its `InstanceInlineRef` import (instance-vocabulary
  refactor), so inline entity refs in chat messages rendered nothing.

### Agent Notes (2026-10-02)

Session `agent/entity-popup-title-20261002`. Owner console trace proved
all three: `Property "title" was accessed during render` at
EntityPopup.vue:13; `expand @ EntityPopup.vue:105 → useEntityPopup set`
re-opening the dialog; `Failed to resolve component: InstanceInlineRef`
under ChatSupport. Title restored through the v24 identity pattern
(`titleFor(dtoToScreenInstance(...))` over the instances cache with
`resolveReadableReference` fallback). The reported
`/api/directory/organization/null` 404 did not reproduce — every
DirectoryDetailSurface mount guards its ids (EntityPopup open, workspace
page props, mobile fallback); needs the owner's exact click path if it
survives these fixes.

## Mobile org page opens; org record carries its chat entry (2026-10-02)

- [ ] Workspace-open on mobile fell through to a desktop pane tab nobody
  renders: directory types (user/organization) with no compiled detail
  screen now open the bounded entity dialog, as the consumer's own
  contract comment already promised. The organization profile and the
  active-org overview pane carry the record's conversation affordance
  (the org's instance thread), matching the detail-surface conversation
  contract.

### Agent Notes (2026-10-02)

Session `agent/mobile-open-20261002`. Reproduced on the live stack
(390×844): account menu → org entry → `/home` stays at the empty
workspace state; `openRequestedWorkspaceEntity` routed mobile only when
a compiled detail screen existed and otherwise called `openInstanceTab`,
which no-ops without panes — the "directory types open as the bounded
home dialog" promise in its comment was never implemented. Org chats in
the inbox verified NOT broken: a message posted to the org instance
conversation produces its inbox row immediately; the missing reachability
was the org page itself plus its absent chat entry. Fixed with the
`useEntityPopup` channel (dialog mounted by the app shell) and the
`openInstanceChat` organization target on both org surfaces.

## Meetings summaries connect to org data (2026-10-02)

- [ ] Ground the meeting summary pipeline in the org's declared types and
  existing instances plus users (SPEC §Meetings): detect mentions in the
  transcript, link the summary to org entities, and create/manage typed
  org data from call outcomes instead of posting loose text. Needs a
  design decision on which declared types the outcomes may create and how
  orgs control that (protocol file extension or per-org settings).

## Full-dialog surfaces: identifiers and viewport-bounded layout (2026-10-02)

- [ ] Image preview, chat call dialog, and mobile call dialog carried a
  fixed 95vh body inside full dialogs — always overflowed into scrollable
  empty space; headers were generic or absent. They are now `fill`
  StandardDialogs with identifier headers, and the floating call window
  names its conversation (SPEC §UI popups).

### Agent Notes (2026-10-02)

Session `agent/dialog-fill-20261002`. Root cause of the "scrollable
nothing": every full dialog put `h-preview-dialog` (95vh) inside
`size="full"` (`max-w-full m-4`) plus header and padding — the dialog
scrolled by construction, images centered in an oversized box, and on
mobile the call dock sat below the fold. `StandardDialog` gained a `fill`
prop (root capped to viewport, content a non-scrolling flex column) and
`full` became edge-to-edge on mobile. Headers: image name on the chat
attachment preview (was headerless), conversation name on the chat call
dialog, caller name on the mobile invite dialog, and the floating call
window resolves its label through the same `callRoomLabel` the home
sidebar uses. The `h-preview-dialog` token is deleted (no users left).

## PWA offline restore and push surfacing (2026-10-01)

- [ ] Service worker serves the app offline again: network-first caches for
  HTML navigations, `/_nuxt/` chunks, and `GET /api/**` (SSE stream
  excluded), static decoration stays cache-first (SPEC §PWA).
- [ ] Notifications toggle surfaces that closed-tab delivery is unavailable
  when the server runs without VAPID keys, instead of silently skipping
  the push subscription.
- [ ] Deploy runbook for generating and wiring the VAPID key pair.

### Agent Notes (2026-10-01)

Session `agent/pwa-offline-push-20261001`. Root cause of the "broken page
offline": the offline read/shell capability (workbox shell + NetworkFirst
`/api/**` from `ddbac40f`) was dropped in the hand-rolled SW rewrite
(`1774c6e7`) — only the mutation outbox survived, while the root README
kept claiming "offline-capable" and `composables/README.md` kept claiming
cached `GET /api/**`. Root cause of silent notifications: the deploy runs
with empty `VAPID_*` secrets (push disabled by contract), and
`useBrowserNotifications.subscribePush` silently returns on
`enabled: false` — the toggle cannot show the difference.

## Graph-native order flow de-slop (2026-09-30)

- [x] Delete the ad-hoc table-import pipeline (surface, batch transport,
  editor binding, i18n) — table→instances goes through authored graphs
  only (`packages/facade/SPEC.md`).
- [x] Cassette onto SPEC §13: generic instance service, payload home for
  the OCCS document, one-way data migration, bridge/adapters/legacy DTO
  deleted, field-access entries removed.
- [x] Palette and type-universe coherence per the palette law
  (`packages/cts/SPEC.md` §8): loud unknown-base errors, `entity` slang
  out of current vocabulary, comparison ops one home, file-data palette
  section distinct.
- [x] Order process re-authored over the coherent palette; live E2E proof
  restored with durable artifact.
- [x] Unslop: `e2e/owner-path.spec.js` (agent probe) deleted, fixtures
  comment dedupe, `check-docs` restored scoped to contract docs.

### Agent Notes (2026-09-30)

De-slop session `agent/xlsx-cassettes-deslop-20260930-161151`. Findings
from the review held: two parallel xlsx→instances pipelines, pack domain
hardcoded into a generic surface, the cassette legacy bridge contradicting
SPEC §13, no SPEC for the order flow, and the deleted E2E proof. All five
reworked per the owner's decisions (graph-only, cassette-is-a-file-type,
palette law, guard on contract docs). Discovered in passing: the doc purge
that morning restored READMEs but not their linked contract docs
(SYSTEM_ARCHITECTURE, DESIGN_SYSTEM, UI_COMPONENT_AUDIT, REMOTE_ACCESS,
DATA_MODEL, TODO-process-designer, four specs, five .codex SKILLs) —
recovered byte-exact from the pre-purge tree so `check-docs` passes.
Pre-existing failures unrelated to this work (fail on the base commit
too): `utils/instance-shape`, `components/generated/detail-action-ownership`,
`components/shared/instance-select`, `shared/ui-mapping` tones,
`server/features/invitations`, `server/features/organizations/system-screens`.

## UI

- [ ] User settings popup and users/orgs directory popups: raw PrimeVue
  organization per the components Style Guide (real Buttons for avatar
  actions, flat `Listbox` membership rows) replacing the hand-rolled rows.

### Agent Notes (2026-10-01, popup PrimeVue pass)

Session `agent/popup-primevue-20261001`. Violations found in the settings
popup (`UserAccountMenu`) and the users/orgs popup body
(`DirectoryDetailSurface`): the avatar upload was a `<label>` wearing
PrimeVue button CSS classes; organization memberships and directory
memberships were hand-rolled `<button>` rows with bespoke radius/hover
utilities (the exact chrome the Style Guide forbids); org-name fallback
rendered raw db ids. Reworked: avatar actions are real icon Buttons
(hidden input triggered by ref), both membership lists are flat
borderless `Listbox`s with single-line `#option` rows (chats-inbox
anatomy), the active organization is the selected row, and the id
fallbacks are gone. Account-control contract (layouts README) unchanged:
every entry still opens the organization's in-home pane; creation stays
in the settings section. Dead `switchingTo` state removed.

### Agent Notes (2026-10-01, second pass — row language over selection UI)

Owner verdict on the first pass: the `Listbox` reads as an ugly boxed
inset, and the rest of the layout stayed untouched. Second pass
(`agent/popup-rows-20261001`): organization entries are navigation rows,
not a selection list — both popups now speak the account popover's
established idiom (menu-style `Button` rows, building icon, success-check
on the active org), so popover and settings popup read as one control.
Settings rows are one pattern (`text-body` label left, control right),
the directory identity header lost its Tag/count soup (org type stays a
DataBlock fact, membership count is evident from the section), and both
identity headers share the same shape.

### Agent Notes (2026-10-01, third pass — measured redesign)

Owner verdict on the second pass: net visual change ≈ none — pass 2
restored the original idiom, a round trip. Third pass
(`agent/popup-redesign3-20261001`), driven by a DOM probe of the running
dialog: the settings popup had one flat column (identity, rows, and nav
all the same weight, avatar actions orphaned under the name) and the
directory action row mixed outlined/text/default severities. Now:
settings dialog is sectioned (identity with trailing actions and the
active-org subtitle, icon-led preference rows under a Preferences
header, Organizations section), and the directory action row runs one
severity system (single primary action default, others text, destructive
danger text). Verified served live by DOM probe; screenshots at
`/tmp/opencode/popups/`.

### Agent Notes (2026-10-01, fourth pass — icon ornaments out)

Owner called it: the pass-3 "icon-led preference rows" (free-floating
`pi-globe`/`pi-bell` `<i>` elements in hand-built rows) are hand-rolled
chrome, not a PrimeVue pattern — PrimeVue carries icons on components
(`Button icon`, menu items), never as ornaments in DIY rows. Removed;
preference rows are plain label + component again. The sectioned
structure (identity with trailing actions, Preferences header,
Organizations section) and the directory action-row severity system
stay.

### Agent Notes (2026-10-01, fifth pass — Panel/Menu own the structure)

Owner verdict on pass 4: still a div mess — the PrimeVue components sat
inside hand-assembled div/span/small section soup. Fifth pass
(`agent/popup-panel-menu-20261001`): `Panel` owns section chrome
(Preferences, My Organizations in the settings popup; Details, My
Organizations, Partners in the directory surface) and inline `Menu`
owns the row lists (org entries with building/check icons, separator,
create entry). Dividers and hand-rolled section-label spans are gone;
the identity block (Avatar + name + subtitle + trailing icon Buttons)
remains semantic layout per the components Layout rule.

- [x] Definitions pane (process designer): hand-rolled div/button rows
  instead of PrimeVue; history rows leaked raw actor ids
  (`user-…` rendered as text)

### Agent Notes (2026-09-30)

Rewrote the Definitions tab as a PrimeVue `Listbox` with a rich `#option`
template (chats-inbox pattern): option click selects/loads, activation
`ToggleSwitch`, history disclosure, and the ellipsis `Menu` live inside the
option with `@click.stop` guards; the hand-rolled bordered row `div`s and
the raw `<button>` name row are gone, as is the raw `border-l` on history
rows. `formatHistoryEntry` now renders the timestamp only — the raw actor
id is never displayed (AGENTS.md UI rule). Rule made explicit for agents in
`components/README.md` Style Guide (raw PrimeVue + no technical ids in UI)
and in `SPEC.md` (## UI).

### Agent Notes (2026-09-30, layout fix)

The history disclosure rendered invisibly: the `#option` template had
sibling root nodes, but `.p-listbox-option` is itself a flex row with
hidden overflow, so the history block laid out beside the row instead of
below it. The option template now has a single root column wrapper
(chats-inbox pattern); controls keep `@click.stop`, the option body
keeps native select-on-click.

### Agent Notes (2026-09-30, Listbox → DataTable)

The Listbox was still the wrong component: a selection control whose
`#option` template was being stuffed into a composite management surface
(switch + menu + rename + disclosure per row). Rewritten as the repo's
rows-with-actions contract — `TableFrame` + `DataTable`: `expander`
column + `#expansion` slot owns the version disclosure natively (one
expanded row at a time; `onDefinitionRowsUpdate` loads that row's
history), row click loads the definition, rename lives in the name cell,
switch + ellipsis menu in the actions cell. History rows still render
timestamps only. Style guide now names the component split explicitly
and points agents at the PrimeVue MCP instead of improvising markup.

### Agent Notes (2026-09-30, DataTable out — Listbox rows + versions Popover)

Live-stack geometry killed the DataTable attempt: the expander body cell
rendered empty (no icon in 4.5.5), rows were 60px grid chrome in a 314px
rail, and the pane's own e2e spec lost its Versions button. Final shape:
single-line `Listbox` options (chats-inbox anatomy — name span, switch,
versions + ellipsis buttons, `@click.stop` guards) and the version
history in a `Popover` anchored at the versions button — the
`NameEditPopover`/`InstanceActionsPopover` precedent. Pane spec's row
locator updated to the option role. Style guide corrected: rail rows are
Listbox single-line options, per-row detail is a Popover, DataTable is
for tabular grids only.

- [x] Kanban of a parents table showed the CHILD type's state lanes (empty)
  — machine vocabulary seeding leaked unscoped state tokens into every
  producer

### Agent Notes (2026-09-28)

Root cause in the compiler: `compileWorkflows` seeded every UNSCOPED
state record into EVERY producer's machine, so all four of the org's
producers carried the union vocabulary (`parentState, parentState.state1,
new, BOI, Boo, io`) — the parents board laned the child/cassette states
with no matching instances. The designer's binding model is the WIRE: an
unscoped state token wired (entry) into a construct/transition of a type
binds to that type — the same rule the connection gate applies. The
compile now identifies state-record→process-node wires structurally
(normalization carries handles, not declaration labels) and seeds only
the wired types; scoped records keep their typeId binding; an unwired
unscoped token seeds nothing. Pinned by
`packages/processes/src/machine-vocabulary.spec.js` (502 processes
tests green). Verified live after restart: FIRST's vocabulary is
`parentState, parentState.state1`; FILE's is `state1, new, BOI`;
cassette `Boo`; cassette-design `io` — and the parents board renders
only ParentState/State1 lanes with the parent cards grouped. (The
paired capitalized/cowercase duplicate lanes are the org's legacy
state-value case drift — stale columns keep those instances visible.)

- [x] Generated buttons in instances: severities (for delete), icon-only for obvious (delete, new -> "+"), icon for changing state btns

### Agent Notes (2026-09-27)

Implemented on `agent/todo-ui-20260927`. Both button families now render
obvious actions icon-only with the localized label as tooltip/accessible
name: the ui-mapping resolver gained an `iconOnly` outcome channel
(`createInstance` → `+`, `deleteInstance` → trash; menus keep labels;
`ActionButton.vue` renders it), and the legacy `GeneratedActionButton.vue`
defaults to icon-only for create/delete/plain-edit. Delete severity
(danger) was already present and is kept. State-changing buttons resolve
their target state's icon/severity from the compiled state policy (legacy
button now goes through `useStatePolicy`/`stateDisplayFor`; the mapping
table adds the swap-glyph fallback so transitions are always iconned).
Contract: `shared/ui-mapping` Actions section, `components/README.md`
label rules.

### Agent Notes (2026-09-27, second pass — live verification)

The first test round ran against a STALE dev server (the app container
had started before the merge landed; `docker restart cutkit_app_dev`
fixed it). Verified live after the restart with a throwaway repro org.
Second-pass addition: plain edit renders icon-only (pencil) in both
families.

### Agent Notes (2026-09-28, third pass)

Also icon-only: the record header Edit toggle (see the pane-header
notes) and the plain-update action in both families.

### Agent Notes (2026-09-28, third pass)

The remaining "edit with text" was the record header's Edit toggle
(`SurfaceHeader`): it rendered a labeled `Edit`/`Save` button. Now
icon-only (pencil/check) with the localized label as tooltip/aria.
Browser-verified on a detail surface.

- [x] In wrapped home sidebar (panelmenu) need to preserve order: chats and calls (missing now)
  first

### Agent Notes (2026-09-27)

Implemented. The wrapped icon rail now leads with Chats and Calls (the
same order the expanded PanelMenu leads with), then the type-panel icons,
then an organizations icon (opens the organization overview). The Calls
flyout (`CommunicationMenu`) moved outside the wrapped/expanded branches
so the wrapped Calls icon toggles the same popup the expanded row does.
The first test round ran against the stale dev server (restarted since).

### Agent Notes (2026-09-27, second pass — root cause found in live data)

The Organizations PanelMenu panel and the Calls entry were present in
the code all along; the test round saw a stale server. Verified live
after `docker restart cutkit_app_dev`.

- [x] In top-level hierarchy table, I see flat table with all top-level and child entities in one
  pile. Agents tried to fix for zero success. 

### Agent Notes (2026-09-27)

Implemented — two complementary fixes. (1) `rootScopeKeysFor`
(`shared/ui-mapping/screen.js`) now resolves the edge's declared
`lineageKey` with the map-key fallback — the same resolution
`childrenOfParent` uses — so source-level root scoping and nesting no
longer disagree (previously an edge without an explicit `lineageKey`
bypassed root scoping entirely). (2) New `hierarchyRootInstances`
(`shared/ui-mapping/index.js`) makes `HierarchyTable` structurally drop
any top-level row whose declared parent is loaded in the pool: children
ride nested under their parents and never repeat at the top level, while
a child whose parent is absent stays a visible root. This is the
projection-level guarantee that holds even for pre-aggregated pools.

### Agent Notes (2026-09-27, second pass — real mechanism found)

Reproduced with the org's real data (`t-3ccnopv0ti` → `t-uth93vgdab`):
the pile was on the CHILD-type list screen. Its pool holds only children,
and the first-pass filter required the parent record to be loaded — so
parented children still rendered as top-level rows. `hierarchyRootInstances`
now treats a stamped parent link (declared edge `lineageKey` set) as
nested regardless of parent load, mirroring the documented source-scoping
rule. Verified against the live data: 13 children, 4 parented → 9
top-level rows, 4 hidden. Instances with NO parent stamp legitimately
stay top-level (they were created outside the parent-scoped flow).

### Agent Notes (2026-09-28, fifth pass — the activation blocker)

THE ORG'S PROCESS COULD NOT BE RE-ACTIVATED AT ALL:
`validateRoundTrip` compared the raw authored records against the rebuild
and failed on one-time normalization drift (canvas nodes carry defaulted
`glyph: null` / authored `severity` the paired records never
materialized) — "Round-trip changed ctsTypes", every activation refused,
including every draft derived from the legacy graph. The check now
verifies SECOND-GENERATION stability (normalize once, then require the
cycle to be idempotent): legacy processes activate again — verified by
activating a verbatim clone of the org's own active definition. This also
unblocks the per-state delete authoring (drafts can compile now).

### Agent Notes (2026-09-28, fourth pass — the actual deliverable)

The real gap was that the PARENT tree-table never loaded children at
all: its region source loads only the parent type, so the "hierarchy
table" could never nest anything. `HierarchyTable` now lazy-loads the
declared child types through a `loadType` seam (app hosts pass a loader
over the instance store; the generator stays pure), merges them over the
region pool, and expands roots once children are known — ONE containment
tree, browser-verified: level-1 parent rows with nested level-2 child
rows. Data notes for this org: the 4 "parented" children reference
DELETED parent ids (orphans — they surface on their own type screen as
roots), 5 carry null stamps, 4 none. The org's 60 cassettes: 57 carry no
organization stamp at all (invisible to every org-scoped list), the
visible ones carry no renderable source (see previews).

### Agent Notes (2026-09-28, sixth pass — the FILE cross-cut)

Owner follow-up: the tree-table nests correctly now, but the CHILD-type
panel/screen ("FILE") rendered EMPTY — the source-level roots-only rule
filtered every stamped child, and all 12 were stamped. The contract is
replaced (owner accepted "composed well"): an unscoped list of a
child-capable type composes the CONTAINMENT CROSS-CUT — every instance
lists with its declared parent context (`incomingChildrenEdges` /
`parentRefOf` in shared/ui-mapping; `ParentRef.vue` token on table
identity cells and card subtitles; RegionBlock lazily overlays parent
types through the same `loadType` seam). Nesting stays owned by the
parent surface's tree projection. Browser-verified: the FILE screen
composes 12 cards carrying parent chips (NEUE, STR, REAL TEST…).

### Agent Notes (2026-09-28, seventh pass — owner correction: flat class screens)

Owner direction after reviewing the cross-cut: a CLASS table displays
that class's instances, never the hierarchy — "Hierarchy in PanelMenu
sidebar is enough." The class-screen tree projection is CUT
(`02e0877a`): `resolveListLayout` loses the `hierarchical` option and
the tree-table entry, `HierarchyTable.vue` and `hierarchyRootInstances`
are deleted, and containment navigation belongs to the workspace
explorer (which nests instances under parents through `childrenOfParent`
— the one matcher, also used by the pickers). Browser-verified: FIRST
renders one flat DataTable (19 rows, Record/Status/STR/NUM); FILE keeps
the cross-cut cards with parent chips; the sidebar explorer still nests.

- [x] In bottom user avatar in homepage, need his name and organization

### Agent Notes (2026-09-27)

Implemented. The sidebar footer trigger shows the active organization's
name under the user's name (resolved from `userOrganizations` by
`userData.organizationId`); the wrapped rail keeps the avatar alone.
The first round's "not fixed" was the stale dev server: verified live
after restart that `/api/auth/organizations` returns the org docs and
the footer/panel resolve from them.

### Agent Notes (2026-09-28, third pass — the real avatar bug)

`UserAccountMenu` documented a `#trigger` slot but implemented an
UNNAMED default slot — every `#trigger` caller (the home footer, even
the mobile shell's icon trigger) silently got the default avatar
button. The slot is now actually named `trigger`; browser-verified: the
footer renders avatar + name + active organization. Bonus: the server
`/api/auth/organizations` now also derives the org list from
`lineage.organizationId` (older/owner accounts carry the link there and
got an empty list before).

- [x] In state popup, need to reverse events order (latest is on top)

### Agent Notes (2026-09-27)

Implemented. `StateHistory` now renders newest → oldest (the API's
native order) with the newest event's evidence panel open by default;
nav buttons flipped with the order (up = newer). READMEs updated
accordingly.

- [x] I have two confirmation popups (on delete), probably service is imported twice

### Agent Notes (2026-09-27)

Root cause found and fixed: `ChatSupport.vue` mounted a default-group
`<ConfirmDialog />`, and ChatSupport mounts on several surfaces at once
(drawer, /chats route, call tabs) — every default-group host renders each
no-group `confirm.require` once, so two live chat mounts doubled the
delete confirmation. The single default-group host now lives in
`layouts/app.vue`; ChatSupport no longer mounts one. (The mapping
screen's `uiMappingConfirm` group host is unchanged.)

### Agent Notes (2026-09-27, second pass)

The "not fixed" round ran against the stale dev server (the layout host
was not live). After `docker restart cutkit_app_dev` the tree has exactly
one default-group host.

### Agent Notes (2026-09-28, third pass — the actual doubling mechanism)

The grouping itself was the second bug: every mounted
`GeneratedMappingScreen` carried its own `ConfirmDialog
group="uiMappingConfirm"`, and the home workspace mounts several screens
(tabs/panes) at once — one grouped require rendered a dialog in EVERY
mounted host. The group is gone: screens mount no confirm host at all
and all `confirm.require` calls are ungrouped against the single
app-layout default host, so doubling is impossible by construction.

- [x] Pane header should be a bit smaller, tab headers stripe should fill it's height (including
  pane controls on right). Close tab button should appear only on hover. 

### Agent Notes (2026-09-27)

Implemented across `GeneratedWorkspaceTabs` + the three pane hosts. The
pane header row is one compact fixed-height (`h-8`) stripe owning a
single hairline across its full width — tab list and right-side pane
controls; the TabList stretches to fill the height (pt) and drops its
own border so the line is not doubled, and the small add/menu buttons
exactly fill the 2rem height. The per-tab close control
reveals on tab hover/focus via named-group utilities (`invisible
group-hover/workspace-tab:visible`), reserving its space so labels do
not shift.

### Agent Notes (2026-09-28, second pass — the 28px mismatch)

The owner tightened the stripe h-8 → h-7 (28px) in 26ecdffd, but the
stripe buttons stayed PrimeVue `small` (32px): close/add/pane-menu
overflowed the stripe and clipped against the pane section's
`overflow-hidden`. Fixed in `agent/todo-implement-all-20260928`: every
stripe control carries `!h-7 !w-7`. Browser-verified: all three
controls measure exactly 28px, aligned to the stripe, nothing clipped.

### Agent Notes (2026-09-28, third pass — the 24px rebuild)

Owner follow-up: the 28px stripe still read too large and its content
too small — the tab label rendered at the 16px body default (measured:
label 24px line in a 28px strip) with 14px icons, so everything swam.
All four pane hosts (GeneratedScreenPane, GeneratedInstanceFile,
GeneratedWorkspacePage, and the empty-pane branch) rebuild the stripe at
**h-6 (24px)**: tab labels render at the `text-label` role (the raw
`text-sm` draft was rejected by the design-system guard — typography is
role classes only), and every stripe control (close/add/pane-menu)
carries `!h-6 !w-6`. Browser-verified after merge: stripe 24px, labels
and controls filling it proportionally.

- [x] Need to fix previews (exactly I can't see cassette preview in card)

### Agent Notes (2026-09-27)

Implemented through the declared-vocabulary chain: the facade pack's
cassette `previewSource` row declares `fallbackPaths`
(`data.layerData`, `data.polygonParts`, `data.definition`) beside
`data.geometry.preview`; the CTS registry carries `fallbackPaths` on the
served `previewSource` record; `dtoToScreenInstance` resolves the first
non-empty path; and the shared geometry normalizer accepts the baked
parts handed as the geometry value. Generated card previews therefore
render legacy baked cassettes (layer/polygon parts) in addition to
geometry-preview and OCCS-payload records — no cassette-specific branch
in any generator surface.

### Agent Notes (2026-09-27, second pass — measured against the live data)

Part of the first round ran on the stale server (the served bundle
carried no `fallbackPaths` until `docker restart cutkit_app_dev`).
Then measured the org's 60 cassettes: 59 carry NO renderable source at
all (blank records from create flows that never saved content — the
placeholder art is the honest surface for them), 1 carries
`data.geometry.preview` (previews). The OCCS template document channel
(`data.definition` → canvas `occs-cassette` source, detector
single-homed in `utils/drawingPreview.js`) was added so parametric
templates render too. If blank cassettes should not exist, that is a
creation-flow question, not a preview one.

### Agent Notes (2026-09-28, third pass)

Re-verified the served bundle after the server restart: the cassette
`previewSource` carries all three fallbacks live; the OCCS-definition
channel renders through the canvas occs-cassette source
(`PreviewBox`), detector single-homed in `utils/drawingPreview.js`.

### Agent Notes (2026-09-28, fourth pass — the actual mechanism)

Editor-created cassettes kept their drawing in the UPLOADED GridFS
file, and that file was authored before the CutKit → Perigram rename:
`extensions.cutkit.graphTree`, which the occs viewer never reads (it
reads `extensions.perigram.graphTree`) — so CAS showed the placeholder
icon "although it worked a week ago". The rename migration only
covered Mongo documents, never file contents. Fixed on
`agent/todo-implement-all-20260928`: the migration now rewrites JSON
GridFS contents under their original id (binary skipped), applied to
the dev db (8 files, 13 docs; CAS now carries `perigram`).
Browser-verified: the CAS card renders 17 svg paths of geometry.
Blank cassettes render the new quiet type-glyph band (authored
`depiction.glyph`, no MIME strings).

- [x] Galleries are weird: it appears for data that doesn't have visual fields (images, previews
  idk), and has no fields listed (probably it's ok if previews are there); also probably can have
  micro-chips w/ identity fields (if any, check cts) as triggers 

### Agent Notes (2026-09-27)

Partially implemented. `InstanceInlineRef variant="compact"` now degrades
to the plain identity chip when the type's compact surface carries no
preview and no compact fact rows — galleries of non-visual data render
micro-chips (the chips remain the popover triggers) instead of grids of
near-empty cards. The identity chips show the one title-resolver label
(the declared identifier field); carrying additional identity FIELDS
inside the chip is not implemented — the expanded popover keeps that
role.

### Agent Notes (2026-09-28, second pass — the CTS check closes it)

"Identity fields (if any, check cts)": the CTS display-flag law is
EXACTLY ONE `identifier` field per type (packages/cts README,
compile-enforced; the first declared string field is minted when none is
flagged). The chip already carries that field's value through the one
title resolver — there are no further identity fields to carry. The
compact surface's additional facts stay in the expanded popover by
design (the chip earns no box without preview/facts). Item closed.

- [ ] Newly created item should be opened in same tab, not in separate route outside home. This
  applies to everything, nothing outside home. Profile and settings in popup. Organizations and
  everything related in PanelMenu (??, or other proper place). 

### Agent Notes (2026-09-27)

Same-tab creation implemented: `resolveCreatedInstanceOpen` now prefers
the home-workspace tab whenever the manifest carries a compiled `home`
screen (orgs without one keep the routed detail destination); the routed
screen page dispatches through `openInstanceInWorkspace` for the
workspace target. Organizations: REMOVED from the PanelMenu and the wrapped rail per owner
directive (fourth pass). Switching lives in the footer account menu; the
footer names the active organization. Browser-verified.
Profile implemented as the inline account surface (fifth pass): the
account popover leads with avatar (upload/remove via the user avatar
API), name, and active organization; theme and logout follow; the
organizations group switches IN PLACE. No Profile or Organization route
entries remain in the account control. A separate settings surface still
does not exist (deferred). The same-tab create path was verified live
only at the code level; the "not fixed" test round ran against the stale
dev server.

### Agent Notes (2026-09-28, sixth pass — settings + org creation land in the popup)

`UserAccountMenu`'s profile settings popup now carries the
browser-notifications toggle beside language and avatar; the
organizations group ALWAYS renders and ends with a create-organization
entry (dialog → `organization` instance through the instances store).
The orphan `/profile` page is DELETED: the invitation join and the
landing's orgless redirect point at `/organization`, which owns orgless
onboarding (inline creation form + the targeted-invitations table
ported from the cut page). Browser-verified: menu = [Org1, Create
Organization, Profile, Toggle Theme, Logout]; the popup carries
language + notifications; `/profile` 404s.

- [ ] Item page should be opened in popup, and surfaceheader (? or in appropriate place) needs slot
  (?) for injecting back button when opened in tab from other page, and close/expand buttons for
  popup

### Agent Notes (2026-09-27)

Partially implemented. `SurfaceHeader` gained the contextual
`navigation` slot ahead of the identity block — the injection point a
host needs for a back affordance when the record opens inside another
surface. The popup item-page surface itself (mobile detail in a dialog
with close/expand controls) is NOT implemented: it needs its own shell
decision (which surfaces open popup vs tab, and the expand target).
Next agent: mount the popup host in the mobile instance-open path and
feed its back button through the new slot.

## Chats

- [ ] Message context menu reachable everywhere; transcribe rides the menu;
  reply quotes carry the attachment's kind icon (owner report 2026-10-01:
  no menu access on mobile, media rows had no action surface, replies to
  images/files wore the microphone icon).

### Agent Notes (2026-10-01)

Implemented on `agent/chat-menu-20261001`. The menu opens from a plain tap
on the message row, a long-press (contextmenu), or the ellipsis — now
visible on every viewport (subtle on mobile, hover-revealed on desktop)
— with interactive children guarded (media elements and their native
controls, the reply-quote jump, links, text selection never trigger it).
Media-only messages, previously unreachable, get all actions this way.
Transcribe moved from the standalone eye button into the menu (disabled
with a spinner item while running; the in-thread pending row stays the
visible progress). `parentAttachmentIcon` now maps by attachment kind —
replies to images/files no longer show the microphone. The composer dock's
context rows (reply quote, refs, staged files, warnings, target strip)
ride the dock's own `gap-2` rhythm instead of per-strip ad-hoc margins.

- [ ] Any-file uploads in chats (SPEC §Chat files): images/videos preview
  inline with galleries for sets, download for every attachment; instance
  chat uploads materialize as child file instances of the chat's composer
  target (sender picks the child type when several accept the file; no
  accepting child blocks the upload at pick time; common and organization
  chats keep plain unlinked attachments). Voice messages follow the same
  rule.

### Agent Notes (2026-09-30)

Implemented on `agent/chat-file-upload-20260930`. Message contract moved
`attachment` → `attachments[]` (kinds image/video/audio/file, cap 10, new
blobs in the `files` bucket; one-shot migration
`server/scripts/migrate-support-attachments.js` stamps legacy
voice/recording descriptors with `bucket: 'uploads'`). Instance-chat sends
materialize each file through the registry `upload` construction handler
(the child edge's lineage key stamps the composer target; the created
instance joins `instanceRefs` with its snapshot; the message stays linked
to the composer target so galleries/replies/composed views hold).
Acceptance rule single-homed as `payloadAccepts`/`mimeMatches` in
packages/cts (`payload.js`), consumed by the construct boundary, the
support service, and the client early check (`utils/chat-file-targets.js`
drives the composer's `accept` union, per-file child-type choice chips,
and mic/upload gating). Composer gained staged-file chips, gallery
rendering (`ChatAttachments.vue`), per-attachment download (inline chips
+ message menu), and the inbox attachment summary. Decisions confirmed by
the owner: block-at-pick when no child accepts; chooser chips when
several accept; voice follows the uniform rule; party-target (org) chats
and person chats never materialize. Also fixed in passing: the inbox row
ellipsis was an in-flow flex item (PrimeVue's runtime `.p-button
{ position: relative }` defeats `absolute` utilities on the button —
plain-wrapper pattern), and `attachCreatedInstance` referenced an
undefined `entity` (ReferenceError on every prompt-less create from
chat). Owner's "chats fill container height" report was measured against
the live stack: the committed layout fills correctly once the component's
scoped stylesheet loads — the surface was degraded by an unmerged
`pages/organization/process.vue` (conflict markers, someone else's
in-flight merge in the primary checkout) which 500s the whole stack;
not resolved here, validation against the live app is blocked until it
is.

Validation (2026-09-30, second note): the blocking conflict was resolved
by its owner; branch merged into `local` (parallel roles-ux and
popups-primevue merges included — one real defect of mine surfaced at
merge time, a duplicated `canTranscribe` declaration the SSR smoke
cannot see because it mounts no chats page; fixed in `c23b1633`).
`e2e/chat-file-upload.spec.js` PASSED live: common-chat attachment-only
send + download 200 (disposition attachment), instance-chat composer
upload materialized as the declared photo child (payload mime verified,
lineage stamped, message linked to the box thread with the child ref),
PDF refused at selection and the smuggled write 400s. Durable artifact:
`test-results/chat-file-upload.json`. Migration
`migrate-support-attachments.js --apply` ran against the dev DB (10/10
legacy messages, idempotent re-run 0). Guards on merged `local`:
check-arch, docs:validate, framework:validate, and the focused specs
(cts, support, instances, localization, design-system, SSR smoke) all
green. Known adjacent findings, not touched here: the compiled
generic-construct path drops authored `name` inputs (e2e boxes render
id-fallback names), and unnamed instances surface their raw id in chat
inbox rows rather than the unnamed placeholder.

Third round (same day, owner review): uploads moved INTO the attach
popover (no second composer control; the paperclip opens for entity refs
OR files), staged instance-chat files carry the resolved child-type
identity (served type name; choice control when ambiguous), and the
disabled-upload bug in party-target chats is fixed — one shared
strict-instance predicate now drives entry gating, staging, and voice,
so the organization chat uploads plain files like person chats. The
"popup on press" regression was the plain inline chip never toggling the
inspect popover (pre-existing gap the README already contradicted;
org-authored refs hit it) — the popover is now a shared root-level
surface both chip variants open. Attachment previews got deterministic
geometry (single image natural-aspect in fixed bounds, sets as
fixed-size tiles, bounded videos) with sender-side alignment and cropped
names everywhere. Big uploads (>8MB) ride resumable chunk sessions with
per-chunk progress bars and disconnect resume (files repository + TTL
reaping; `useChatFileUpload` transport), and downloads serve HTTP byte
ranges so video playback works. E2E extended and green: range 206,
12MB chunked round-trip byte-complete, popover upload, chip identity,
ref popover, org-chat plain upload.
NOTE: this round's docs (api/support/composables README updates) landed
inside the feature commit `d364f75f` instead of a separate `neo:`
commit — commit-split deviation acknowledged here rather than rewriting
history.

Fourth round (same night, owner live-testing reports). Downloads "404":
verified against the live stack and DB — every stored blob serves 200
through the running app; the only "File not found" responses are three
legacy voice messages (`6aaa96492e4c627e5b3fd2df`, `6aaa958b2e4c627e5b3fd219`,
`6aaafd6721f27e65eab86ebc`) whose blobs are gone from every GridFS bucket
(purge casualties from the Sep-29 incident) while their messages remain;
no download-path code defect found — **verdict corrected the same night
(see the fifth-round note below: a real route defect made every
non-ASCII filename 404)**. Blocking sends fixed on
`agent/chat-sendfix-20260930`: the send saga owned the whole composer
(`isLoading` disabled the send; text/files staged during an upload were
wiped when it settled) — sends now snapshot and detach the draft at click
time (outgoing rows keep progress), chain so bodies land in click order,
restore exactly what they took on failure, and voice sends follow the
same rule; the staged strip is height-bounded so the dock cannot squeeze
the thread. Image previews left the PrimeVue `Image` mask (stock toolbar
reads as half-screen controls on narrow viewports) for the repo's
`StandardDialog` at full size. Guards (check-arch, docs:validate),
focused specs (localization, support), and the full
`e2e/chat-file-upload.spec.js` green on merged `local`; fresh artifact in
`test-results/chat-file-upload.json` (download 200, range 206,
materialized child payload verified).

Fifth round (same night, owner supplied a failing URL): the 404 verdict
was wrong. `Content-Disposition` carried the stored filename raw; header
values are Latin-1 only, so any non-ASCII name (the owner's Cyrillic call
recording `Запись встречи…webm`) threw `ERR_INVALID_CHAR` inside the
route, and the blanket catch dressed it up as `404 File not found` —
ASCII-named files (every E2E fixture) masked it. Fixed on
`agent/file-disposition-20260930`: RFC 6266 disposition (stripped-ASCII
fallback + `filename*=UTF-8''…`), blanket catch removed so only a real
meta miss 404s, and the extension map gained the media families
(webm/ogg/mp3/wav/m4a/mov) so stored-contentType-less media serves
playable types instead of octet-stream. E2E extended with a
Cyrillic-named upload (200 + `filename*`) and green; the owner's URL now
serves all 47,976,363 bytes inline as `video/webm`.

## Process Designer

- [ ] Need to create proper definitions management interface; and multiple of them can be active (summarized on
  compile).

### Agent Notes (2026-09-27)

NOT implemented — reported as blocked on design. This is a full feature
(definition lifecycle UI + multi-active semantics + a summarized compile
merge across active definitions). It changes the compile contract and
needs its own task with the process-definitions service contract
(`server/features/process-definitions`) as the base.

- [x] "Delete" actions are declared per-state in process definition, but buttons are rendered all at once in
  one action buttons container (3x delete buttons no matter the state)

### Agent Notes (2026-09-27)

Implemented at the compiler: `wiringArrivalState`
(`packages/processes/src/compiler-core.js`) now derives the wiring's
arrival state for any state-bound effect, not just update actions — a
delete wired from a single state compiles `state.from` onto the manifest
action, so the existing surface filters (`actionAppliesToEntity`,
SurfaceHeader's from-filter, card menu scoping) render it only in that
state. Deletes wired from several states stay unscoped (server runtime
still guards); deletes compile no machine edges — that derivation stays
update-only. Requires recompiling the organization's process to take
effect.

### Agent Notes (2026-09-27, second pass — proven against the org's own authoring)

Copied the org's authored draft (three `cts.remove` nodes for the FILE
type, each fed from a different `cts.transition` result) into a
throwaway org and activated it: the compiled manifest carries
`state.from` = `state1` / `new` / `BOI` respectively — exactly the
per-state scoping authored. The org's CURRENTLY ACTIVE process contains
no delete nodes at all; **the draft with the deletes must be activated
for the buttons to scope** (activation recompiles through the fixed
pipeline).

- [ ] Need new visual system for nodes:
  - [ ] 

### Agent Notes (2026-09-27)

NOT implemented — the item is unspecified (the checklist entry is
empty). The current node UI contract lives in
`components/process-designer/README.md` ("Node UI contract" via
`DesignerNodeCard`/`DesignerSocketHandle`); a redesign needs concrete
direction (what the new system must express that the current
shape/color/size vocabulary does not).

## Canvas / BPMN (process designer)

Plan of record (decisions, stage detail, acceptance):
[`TODO-process-designer.md`](./TODO-process-designer.md) §P5. Docs-first:
every stage rewrites the Node UI contract section before code.

- [x] V1: smoothstep edges + control-only arrowheads; ring sockets and
  trigger rings on effect cards; species corner glyphs; de-fluff pass
  (hover tooltips, quiet unselected cards)
- [x] V2: primacy inversion — event wires become the primary flow
  (solid, `--p-text-color`, arrowed), data wires thin dashed
  (`--p-text-muted-color`), hue retreats to sockets
- [x] Lanes A: role lanes projected from grant records; declaration band
  above the pool; hide-definitions toggle
- [x] Lanes B: placement-writes-grants — lane crossing edits the grant
  record, membership always re-derived from grants

### Agent Notes (2026-09-28 — chrome quieting round)

Four owner corrections on `agent/canvas-lines-20260928`, all
live-verified: (1) the pressed-toolbar ToggleButton override rendered
as filled gray CIRCLES (radius 9999) among transparent 6px buttons —
pressed items are now the same icon-only Button outlined with
aria-pressed (`DesignerToolbarItems` is one control family; the
ToggleButton import is gone); (2) lane bands lost their fills —
hairline separators only; (3) bands span the nodes' horizontal domain
(leftmost column to rightmost edge + 24px pad) instead of an arbitrary
2400px strip; (4) lane titles render at label size and COUNTER-SCALE
by the canvas zoom — floating chrome stays at absolute screen size
(measured: the dial and PrimeVue tooltips already were; the lane
titles were the one thing scaling, 16px→64px at 4×). Plus the owner
directive that nodes outside the access model are lane-free:
declarations left the band system entirely (no declaration band, no
grid projection) — only effects are banded; every other node keeps its
authored position. Verified: free nodes at authored coordinates,
effects in grant lanes, labels 20px at any zoom.
- [ ] Auto-arrangement: derived-position diagram view, Tidy command,
  hand-rolled layered pass (dagre only if defeated)
- [ ] Decide control-species fate (if/fork/joins): target model or cut —
  reserves the gateway diamond slot
- [x] Docs debt: reconcile the stale transition-node claims (no
  `ctsTransition` node exists; state→state wires are `nested`)

### Agent Notes (2026-09-28 — V2 made real + node shape populations)

Owner review found the V2 landing visually inverted on real data:
declaration wires (16-19 per graph vs 0-1 event wires) rendered at 2px
full-saturation structure violet and owned the canvas, and the 18px
arrowhead read as a chunky blob. Landed on
`agent/canvas-primacy-20260928`: declaration layer demoted to 1.5px
dashed in a new derived `--ck-signal-structure-muted` token (hue stays
on socket handles), control arrowhead compacted to 12px, and the P5
node SHAPE populations — verbs = task rectangles, nouns = folded-corner
data objects, vocabulary = dashed frames in the declaration-wire tone,
control species keep the neutral frame (reserved gateway slot). Full
detail and live measurements: §P5 agent notes in
[`TODO-process-designer.md`](./TODO-process-designer.md). Token-level
changes need a dev-container restart (HMR does not re-evaluate the
Tailwind theme/CSS variable declarations). Lanes A remains next.

### Agent Notes (2026-09-28 — owner redesign: cargo wires + Lanes A)

Owner rejected the shape-population corrective ("dashed borders and
node corners change is awful", "you didn't remove fucking arrow and
dot") and gave the target model: primary nodes = operations
(strong-ink border), everything else quiet surface; wires encode cargo
— solid = instance, dashed = value, dotted = event (primary accent);
socket palette kept but the shape zoo (rings/diamonds/squares, trigger
ring, corner glyph, all arrowheads) removed — one uniform filled
circle, color only. Lanes A landed with it: Lanes toggle renders
grant-derived role lanes + declaration band + implicit grantless lane
(never stored, one-shot in-memory projection), definitions toggle
hides the declaration family. Full detail and live measurements: §P5
agent notes in [`TODO-process-designer.md`](./TODO-process-designer.md).
Finding recorded there: activating a draft in the same request that
created its role strips grant roleIds (org-config roles cache race) —
needs its own task.

### Agent Notes (2026-09-28 — lanes become the authorization surface)

Owner round: "Primary border is awful" (operations now carry the
primary-tinted surface `--ck-surface-primary`, borders uniform);
"lanes should not cover canvas" (bands render at a negative z-index in
the zoom-pane — a true background under nodes and wires, verified z
-10 vs node z 0); the invented "Definitions" band label removed as
sloP (lane titles are the org's own role names); "toggle buttons
layouts are weird" (the merged chrome rendered pressed items as labeled
61px ToggleButton chips — extracted `DesignerToolbarItems` with one
icon-only 32×35 geometry for plain and toggled items alike, start/end
duplication removed). Owner directive: "lanes should not be removable,
it should replace role assignment in inspector" — the Lanes toggle is
GONE, bands are permanent, and dropping an effect in a lane WRITES its
grant (implicit lane clears grants; the inspector's role multiselect is
deleted, per-grant levels stay; multi-role records paint a corridor
across their lanes — no cloned nodes, no duplicated wires). Verified
end-to-end live: drag construct → Admin lane → PATCH carries
`[{roleId:'role_admin'}]` → draft stores it; corridor collapses.
Two fixes found on the way: process-definition LIST summaries lacked
`states.main`, so draft-only orgs opened an archived empty process
instead of their draft (projection fixed); lane-drop membership reads
the node CENTER (position is top-left — the corner lands a band above
the drop). Deviation from the Lanes B plan text: extra roles are NOT
inspector-editable anymore (the owner replaced role assignment
outright); corridors display stored multi-grant records only.

### Agent Notes (2026-09-30, PrimeVue sweep over the designer surface)

Swept every remaining hand-rolled chrome finding in the process designer
(analyzer-enumerated): bordered row containers in ApplyMigrationDialog,
TypeMigrationStepsDialog, ProcessNodeInspector, and the context palette /
screen preview cards became `bg-subtle`/`bg-content` token insets (PrimeVue
owns borders); palette item buttons dropped hand-rolled hover-border state
(Aura owns hover); the two arbitrary `grid-cols-[…]` editor rows and the
preview branch grid became flex layout; LaneBands' hairline moved into its
data-driven style binding (socket-handle precedent). Three analyzer defects
fixed — `border`/`rounded` prefix-matched inside `border-content-border`/
`rounded-ui`, `bg-process-canvas`/`bg-primary-surface` are token-backed
surfaces, and the `!important` pattern matched JS negations in template
expressions. The whole designer surface now analyzes compliant with only
pinned data-driven inline-style allowlists (canvas geometry, pointer
anchoring). definitions-pane spec updated for the ellipsis-menu rename
path and green against the live stack.

### Agent Notes (2026-09-30, palettes → OperationPalette)

Both hand-rolled palettes (rail search + uppercase group spans + 2-col
button grid; context search + group spans + button column) were structural
slop the analyzer cannot see. One component now owns them:
`OperationPalette.vue` — a filterable grouped PrimeVue `Listbox` (filter
box, group headers, and option rows are PrimeVue-owned; pick emits once,
no persistent selection). `useProcessDesignerPalette` lost its text-query
plumbing (Listbox filter owns search; the composable only narrows the
context palette by socket compatibility), `contextPalette.query` died with
it, and `paletteSearchText` was removed from the palette-text util. The
preset renders listbox roots borderless (`primeComponentTokens.listbox`)
— every listbox use sits in a rail that owns its frame, so the old
`border-0` utility on PrimeVue components becomes unnecessary. Placement
spec's palette locator follows the option role now.

### Agent Notes (2026-09-30, registry button + types page removed)

The palette's registry shortcut button and pages/organization/types.vue
are gone — the palette is now the Listbox alone inside the framed rail
(no toolbar row, no wrapper). The type-designer components STAY: they are
live (FieldNode/StateNode/TypeNode render canvas declaration nodes,
DescriptorEditor backs the declaration inspector) — auto-imports, not
import statements, and a path-only grep missed them; SSR smoke would have
caught the broken build. typesPane i18n pruned to the seven keys the
surviving components use; the edge inspector's two labels moved to the
processDesigner namespace. LaneBands bands carry a semantic `lane-band`
class and the placement spec selects it (the sweep had moved the hairline
into the style binding, leaving `div.border-t` stale).

### Agent Notes (2026-09-30, palette chips + shared node signals)

Owner direction: no icons anywhere in the palette; category identity via
shared styling between palette entries and canvas nodes. OperationPalette
is now a searchable flex-wrap of chip Buttons (PrimeVue owns hover/focus;
repeat picks are plain button clicks — the Listbox remount workaround
died with it). One group→signal map (utils/processDesignerSignals.js)
colors the chip dot AND the DesignerNodeCard left stripe, so a chip reads
like the node it creates. Group headers, per-item icons, and the
paletteGroups i18n block are gone; declaration nodes stripe 'structure',
operation kinds resolve through the palette catalog.

### Agent Notes (2026-09-30, chips: visible signals + group labels)

The signal dots rendered as empty space: `` bg-signal-${x} `` is dynamic
and Tailwind compiles from source text, so no class existed. All signal
surface classes are now literal in utils/processDesignerSignals.js
(signalBgClass) and tailwind.config scans utils/. Group labels are back
(localized paletteGroups block restored) — chips group under small
muted labels; dot + stripe share the one signal map.

### Agent Notes (2026-09-30, node stripes removed)

Owner call: the DesignerNodeCard signal stripe read badly — removed for
now (the signal prop, stripe markup, and the node-side signal mapping
all died; chip dots keep the one signal map). Revivable from history if
wanted later.

### Agent Notes (2026-09-30, simpler node layouts)

Literal is one row (type dropdown + value; entityRef keeps its type
picker in the row; list/tree textareas wrap below at the node max).
Operation cards (lg) size to content: w-max with a 72 floor and 96 cap;
socket name columns cap at 44 before truncating; the input/output gap
stays the row's fixed gutter; the node title crops at the card cap.
SPEC "Node layouts" records the intent.

### Agent Notes (2026-09-30, literal is ONE line)

One-line literal: no header, no named socket rows — type dropdown +
value with the value socket's unnamed handle docked in the same row
(size `inline`, w-64; every control min-w-0 so the value can't overflow).
Applies when a literalItem has zero inputs and exactly one data output;
anything richer keeps the full card. Operation-card floor dropped to
min-w-56 so socket-driven widths are actually visible. NOTE: the
design-system drift test is red on committed local from the parallel
padding agent's WorkspaceSplitNode scoped style (no analyzer exception);
they are reworking it in the primary tree — not touched here.

### Agent Notes (2026-09-30, role management + screens per role)

Rename/delete moved behind the role's ellipsis menu (inline rename like
the definitions pane; delete opens a StandardDialog confirm). The delete
confirm scans every definition (loadById when the summary lacks data)
through deriveRoleAccessSummary and warns with the names of definitions
where the role carries load (lanes/grants/screens/actions). The Screens
tab is gone: compiled stations render per role under Roles
(screensForSelectedRole filters by screen.roleIds; unscoped stations
render under every role), the authored-station editor only under its
owning role, and customizeStation selects the owning role first. The
compiled-preview recompute gate moved from the screens tab to roles.
SSR smoke updated: screens tab label absent, roles pane renders.

### Agent Notes (2026-09-30, popup sweep)

Popups audited with the analyzer and brought compliant: UserAccountMenu
(profile/org settings) drops its !justify-start overrides for a pt-based
alignment object and the avatar trigger loses its hand-rolled ring;
OfflineOutboxBadge becomes a token inset; CallFloatingWindow sizes on
the standard scale (h-136 w-120 max-h-dvh) with the frame carried by
shadow/surface instead of hand borders; ChatSupportDialog's documented
Dialog width rides a pinned inline-layout exception and its cap becomes
max-h-dvh; EntityPopup caps at max-h-dvh. Analyzer now exempts the
semantic primary/status background token families (same standing as
process-canvas), and inline-style exceptions may carry a layout category
(besides data-driven). NameEditPopover/InstanceActionsPopover were
already compliant. Preview popups were structurally PrimeVue already
(StandardDialog + generated surfaces) — the debt was chrome, not
structure.

### Agent Notes (2026-09-30, mobile global scale)

The rem basis is the scale: html font-size rises to 18px below the app's
mobile break (48rem viewport, matching the md: shell split) — PrimeVue
components, rem-based typography roles, and Tailwind utilities all scale
together (PrimeVue's documented scaling mechanism; no per-component
overrides). One knob in main.css app-shell section.

### Agent Notes (2026-09-30, mobile scale direction)

Owner call: mobile scales UP, not down — touch targets and text grow
together (18px root below the 48rem break). Direction corrected from
the first cut.

### Agent Notes (2026-09-30, mobile item popup is a page sheet)

The mobile ITEM POPUP was a desktop dialog at full size — margins,
rounded corners, 70vh cap. StandardDialog gains a `sheet` size: pt-driven
root (m-0 h-dvh max-w-full rounded-none) and a flexing scroll body; the
mobile detail mounts it edge-to-edge with no height cap. The chat dock
and incoming calls keep the `full` size. The earlier popup pass was
invisible compliance cleanup — this is the visible redesign the owner
asked for, on the surface they were looking at.

### Agent Notes (2026-09-30, mobile opens route — popups die)

Owner verdict: the item-popup contract was slop. Both mobile popups are
gone — record opens (openMobileInstance) and workspace-entity opens
(openRequestedWorkspaceEntity) route to the compiled detail screen via
detailRouteForInstance; the bounded directory dialog and the mobile
detail sheet (plus their state) are deleted. Desktop keeps tab opens.

### Agent Notes (2026-09-30, call sheet reverted)

The sheet experiment broke the call dialog (collapsed layout, no
expand) — pt styling shipped unseen. Reverted to the known-good full
size + preview height; the dead sheet size is removed from
StandardDialog. A proper mobile call surface needs design review with
the owner first.

### Agent Notes (2026-09-30, call window size + resize)

Root cause of the shrunken window: the popup sweep replaced the
arbitrary sizes with h-136/w-120 — numeric utilities that do not exist
in Tailwind's default spacing scale, so no CSS applied and the flex
window collapsed to content. Sizes are now token-backed
(w/h-call-window with min caps, tailwind aliases from the token
source), and the window is user-resizable: a bottom-left grip grows it
up-left (anchored top-right during the gesture, like the drag header),
clamped to the token minimums and the viewport, persisted in
localStorage. The size binding pins a data-driven inline exception.
