# TODO

## UI

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

- [ ] Galleries are weird: it appears for data that doesn't have visual fields (images, previews
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
NOT implemented: profile/settings as popups — the account popover keeps
its Profile route entry; a settings surface does not exist yet and needs
its own design pass. The same-tab create path was verified live only at
the code level; the "not fixed" test round ran against the stale dev
server.

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

- [ ] V1: smoothstep edges + control-only arrowheads; ring sockets and
  trigger rings on effect cards; species corner glyphs; de-fluff pass
  (hover tooltips, quiet unselected cards)
- [ ] V2: primacy inversion — event wires become the primary flow
  (solid, `--p-text-color`, arrowed), data wires thin dashed
  (`--p-text-muted-color`), hue retreats to sockets
- [ ] Lanes A: role lanes projected from grant records; declaration band
  above the pool; hide-definitions toggle
- [ ] Lanes B: placement-writes-grants — lane crossing edits the grant
  record, membership always re-derived from grants
- [ ] Auto-arrangement: derived-position diagram view, Tidy command,
  hand-rolled layered pass (dagre only if defeated)
- [ ] Decide control-species fate (if/fork/joins): target model or cut —
  reserves the gateway diamond slot
- [ ] Docs debt: reconcile the stale transition-node claims (no
  `ctsTransition` node exists; state→state wires are `nested`)
