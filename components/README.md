# COMPONENT: Components

## Style Guide
- **PrimeVue:** All generic controls and containers MUST use unmodified PrimeVue Aura appearance. The app preset supplies only the brand primary palette and the zinc surface scale; feature code must not restyle PrimeVue typography, padding, borders, radii, shadows, or interaction states.
- **Zero Styling Policy:** Components MUST avoid manual visual styling. Feature code may own layout and data-driven styling only. Reusable domain entity surfaces, operational workspaces, geometry/process designers, and recurring layouts use the registered shared primitives and semantic aliases from `assets/tokens/`.
- **Motion:** Motion is contextual behavior, not an application theme concern.
  Keep interaction-specific motion inside the owning derived composition, use
  the preset's transition duration for generic states, and respect
  `useReducedMotion()`. JavaScript motion uses the GSAP patterns from
  `composables/useMotion.js` — do not introduce another motion library. Do not
  add perpetual, global, or page-local animation
  to otherwise static operational controls.
- **Layout:** Use Tailwind CSS utility classes for layout (flex, grid, spacing, alignment).
- **Minimal Text Chrome:** Do not add page/panel headers, descriptions,
  helper bubbles, notes, tips, or empty-state prose unless the user workflow is
  otherwise ambiguous or blocked. Controls, placement, icons, and typed data
  labels should carry the interface before explanatory copy is added.
- **Standard Components:** Create reusable components for common UI patterns (cards, modals, forms, tables) and use them consistently across the app. See [components/shared/README.md](./shared/README.md) for the full list.
- **Use Variants:** Components support visual variants (`inline`, `compact`, `card`).
- **Localization:** User-facing static template copy and visible component
  props must use i18n keys. `shared/localization.spec.js` parses active Vue
  templates and fails on hardcoded labels/placeholders/messages, while allowing
  real data units and code/file literals.
- **Child Components:** When a component needs to display full child entities,
  use the child entity's dedicated card component. When it only needs compact
  relation context inside another card/detail row, use `InstanceInlineRef`
  instead of nesting full card popovers.
- **Smart Components:** Sub-components should use explicit permission grants to conditionally render actions (edit, delete, view).
- **Permission Editing:** `PermissionEditor.vue` edits the same grant shape used
  by `shared/access-control.js`: each feature has one or more explicit grants
  with level, action overrides, lineage/entity trait filters, transition
  filters, and nested logical rule conditions. It is the typed grant editor for
  both direct permissions and Process Designer access; raw grant JSON is not an
  authoring surface.
  The main editing surface is a unified filter builder: grants render as
  accordions in the selected access area, and the grant level is edited inline
  as `Allow <level> when <predicate>` above the filter expression. Each
  predicate selects a subject (the selected feature entity when it exists,
  related entity, transition, or custom path), then an entity type when the
  subject is related, then a trait, an operator, and a value. Entity traits must
  come from the real domain contracts: exact `id`, workflow `status` from
  `cncWorkflows`, and property paths from `cncEntityFieldAccess`. Do not expose storage terms like
  `lineage.organization` as user-facing targets; related entity types come from
  the domain frontend entity registry but must be constrained to valid lineage
  ancestors for the selected feature entity. Do not offer descendant filters
  such as `Project / related Queue`, because projects do not carry queue
  lineage. Exact entity ID clauses and related entity ID clauses must use entity
  pickers when a canonical list source exists; users should not type IDs for
  ordinary project/queue/warehouse/organization filters or for the selected
  feature entity. Exact-entity value pickers must
  be loaded only for the selected predicate types that have supported list
  sources; do not preload every domain entity type or call missing routes such
  as artifact indexes. The rule row should wrap as a compact expression, not as
  a wide fixed grid that collapses into two unusable columns in dialogs. The
  access-area summary and grant header must not present a filtered grant as
  plain full access; filtered grants need a visible filtered state and a clear
  action that removes `scope`, `rule`, `transition`, and `transitions` from that
  grant. The
  visible gate selects `all`/`any`, and each group or clause must expose a
  `not` toggle that saves to the shared evaluator's
  `{ not: ... }` rule shape. The editor is
  a nested boolean expression builder: users must be able to add condition rows
  and nested groups, producing rule trees such as `(A AND B) OR NOT (C AND D)`.
  Do not collapse it back into a single flat clause list. Incomplete draft
  nodes must stay visible locally while the saved grant serializes only complete
  predicates. Queue pickers must use project-scoped queue routes because the app
  does not expose a global `/api/queues` list. Free text is reserved for custom
  entity paths, entity type names, transition state names, and unsupported
  entity list sources. The editor should present grants as editable filter
  expressions, for example "Related entity / Project / Status equals ACTIVE and
  Current entity / Status equals READY", not as opaque role/global chips, prose
  summaries, or raw storage fields such as `lineage.projectId`. Do not replace
  it with a flat role-only selector. When a feature has no grants, the detail
  area must show an explicit add-grant call to action; once a grant exists, the
  access level must be edited through a visible control before the filter
  builder.

## v24 Standardized Patterns

All entity-related components MUST use these patterns:

| Concern | Pattern |
|---|---|
| Identity display (default: declared identifier field) | `titleFor(dtoToScreenInstance(entity, typeRecord), typeRecord, { unnamedLabel: t('common.unnamed') })` from `shared/ui-mapping` — the one title resolver — rendered inline as title/chip markup |
| Status display + transitions/actions | `<InstanceState :entity="..." type-id="..." :actions="..." />` |
| Read-only status display | `<StatusBadge :entity="..." />` |
| Current lifecycle location | `status.lifecycle.data.location` rendered by `<InstanceState>` |
| Drawing and geometry preview | `<DrawingCanvas ... />` for layer-aware DXF/SVG/cassette canvas work; `<GeometryPreview :entity="..." />` as the entity-card wrapper |
| Structured key/value data (specs, parameters, tool dims) | `<DataBlock type-id="..." :entity="..." :fields="ENTITY_FIELDS" />` |
| Lineage breadcrumb | `<TraceChain :entity="..." />` |
| Audit log | `<StateHistory :entity="..." type-id="..." />` |
| Detail page header | `<InstancePage :entity="..." type-id="..." />` |
| CRUD + status operations | `useEntity(type, id)` |
| Entity/container structure | Entity cards: `<InstanceCard>`; non-entity sections: PrimeVue `<Panel>` or semantic layout; Aura owns generic chrome |
| Section/page action rows | `<ActionToolbar>` |
| Route-level aggregate facts | `<MetricPanel>` |
| Repeated card grids | `<ResponsiveGrid>` |
| Entity-local workspaces | `<InstanceWorkspace>` |
| Three-lane production workspaces | `<WorkspaceLanes>` |
| Operational designers | `<DesignerWorkspace layout="lanes|canvas">` owns layout; feature components own state and persistence |
| Bounded scrolling workspace sections | `<ScrollablePanel>` |
| Loading/empty/error surfaces | `<StateBlock>` |
| Data table frame | `<TableFrame><DataTable ... /></TableFrame>` |
| Dialog container | `<StandardDialog>` |
| Single-field rename/edit | `<NameEditPopover>` |
| Typed admin settings | `<TypedSettingsForm :fields="..." v-model="..." />` |
| Entity dropdowns | `<InstanceSelect>` / `<InstanceMultiSelect>` with explicit `type-id` |
| Floating designer toolbar (document + canvas commands) | PrimeVue `Toolbar` inside `DesignerWorkspace` (shared shell contract in `components/shared/README.md`) |

workbench and organization workflow overrides page. It normalizes flat legacy
workflows into a `regions` contract, edits the selected region's states and
transitions, and keeps lifecycle metadata, transition capabilities, access JSON,
and hooks JSON editable.
The organization process designer keeps lifecycle design inside the same Vue
Flow workspace: statuses are authored as state declaration nodes on their
class and enter effects through typed status sockets wired from those nodes.
Entity lifecycle data compiles into the runtime status machine. The Roles
panel immediately manages organization-owned role identities; it is not
process draft state. Process records map those role ids onto executable
nodes, screens, and lifecycle transitions. User assignments are managed by
Team Management and never serialized with the canvas.
Process designer nodes live under `components/process-designer/` and render
the process catalog's resolved typed Vue Flow handles. Do not reduce these
nodes to generic cards; their surface exposes the entity/species semantics
that the active process runtime consumes.
The canvas is intentionally a compact semantic overview. Palette controls are
grouped and labeled, node accent colors identify those groups, and executable
nodes keep Manual/Automatic execution visible on the node. Socket rows align
on fixed left/right rails; exact structured types are exposed by hover and
assistive metadata rather than repeated beside every socket. Role access
remains secondary inspector configuration; retry is not hidden node metadata.
There is no block substrate: constructs expose their bound type's declared
row fields directly, mutates patch writable leaves and declared relation
keys, and the field projection reads one field of the incoming entity — all
through the generic `@perigram/processes` designer contract over the supplied
domain implementation.

The process designer also exposes non-effect process algebra nodes for typed
source/transform work: entity references, field reads, string operations,
comparisons, logic, and collection transforms. These nodes are semantic
`processNodes` records and must not perform mutations; persistent state changes
remain effect-node responsibilities.
The designer's screens tab renders the compiled screen manifest through the
real UI generator (`components/ui-mapping`) over the CTS-vocabulary UI
contract, without fetching live entity data; the runtime data layer lives in
the screens route (see [`TODO-process-designer.md`](../TODO-process-designer.md)).
Generated operational screens live under `components/generated/`. They render
compiled process screen manifests through a fixed template registry and shared
entity primitives (`InstanceCard`, `InstancePage`, `InstanceSurfaceContent`,
`ResponsiveGrid`, `WorkspaceLanes`, and `TableFrame`). Process data may select
registered templates, sources, regions, surfaces, and action ids; it must not
select arbitrary Vue component names or inject page-local markup. App-owned
system screens appended during auth hydration use the same generated template
contract. Organization management is split into generated system screen records:
the overview template links to accessible organization sections, the account
template renders billing regions and checkout actions, and route templates
represent existing team and process-designer pages. Menus and the mobile
home tab strip
read those screen records instead of mining page-local permission checks or
actions from one organization page. Generated user manifests are
effective access views: when a user has several process
roles that touch the same entity screen, the process compiler merges those
role-derived screens into one route with combined source requirements and
combined runnable actions. Generated components should render the supplied
screen contract directly and must not reintroduce role-level duplicate routes.
App default screen/body overloads are registered in
`components/generated/overloads.js` and are resolved only after that
user-specific manifest has been composed and loaded. Do not hardcode new
entity-specific generated branches in `GeneratedScreen` or `GeneratedInstanceDetail`;
register the overload there so it receives only the sources, regions, actions,
and scope available to the current user. Project `entityDetail` screens use
this path to render an IDE-style operational workspace over the generated
project source and generated child collection sources. Its Explorer owns child
rows from generated source regions and can collapse so the recursive pane area
uses the full width without rebuilding or changing the recursive pane tree.
Relations declared on the project are rendered in a dedicated **Linked entities**
Explorer section. They use the same typed relation references and entity-detail
workspace files as every other entity; this section is navigation, not a second
containment model, and does not depend on relation-key naming conventions.
Project-context actions live in a fixed workspace strip above both Explorer and
panes; the strip's left control owns Explorer visibility. Explorer contains
source navigation only, while panes contain the canonical entity page for their
selected entity or a registered workspace page, plus pane-local controls. Each
pane header owns its IDE-style file tabs in one compact fixed-height row whose
single hairline spans the whole stripe — tab list and the right-side pane
controls alike: each entity tab carries its compact
lifecycle status and a close affordance that appears only on tab hover or
focus (its space stays reserved so labels do not shift), followed by a
standalone add-tab control. The stripe is SINGLE-HOMED in
`components/generated/GeneratedPaneHeader.vue`: every pane host mounts
that one component — the row, its height (40px), and the control fill
are defined once, never pasted into hosts (a host pasting its own
header row is a defect even when visually identical). Every control in
the stripe — close, add, and
the pane menu — fills the stripe height through stretch (`h-full`), the
tab labels render at the text-label role size, and no control overflows
or clips against the stripe's edges.
Overflow stays wheel/touchpad-scrollable while native scrollbar chrome remains
hidden, matching an IDE file-tab strip.
Pane split/close commands live in a pane-level ellipsis menu. Generated entity
actions not already owned by an operational editor belong to the active tab body
below the tab strip. Action presentation has one concern-based owner: collection
creation stays with its region, relation mutation stays with the relation-aware
entity surface, and entity operations stay with the opened entity. Inside
Project, CRUD deletion is a management action owned only by the Explorer
entity-row ellipsis. It uses the canonical permission gate and confirmation and
closes every affected entity/page tab after success.
Explorer parent entities remain selectable files and become expandable folders
when declared containment and loaded lineage establish children. Linked roots
stay in the separate Linked entities section rather than being presented as
containment; declared descendants may nest beneath a linked parent.
Active-pane emphasis uses the neutral chrome-subtle token on its tab header,
and empty panes retain an open-content prompt. The embedded entity page suppresses its
duplicate title, lineage, lifecycle, and action header while retaining the full
canonical detail body. A pane must not substitute a compact
summary/detail-body-only surface. It scopes
and loads the selected entity's own compiled detail screen so child regions
remain available inside Project. Explorer starts as a compact 15% rail;
project mutation actions, including relation Link, remain in the strip even
when a child region references the same compiled action. Unlink is not an owner
strip command: each linked `InstanceInlineRef` receives the matching contextual
Unlink operation in its own actions, with both owner and target already bound.
Only project-bound child-create actions move to collection context.
When a generated Link input carries an artifact creator contract, its entity
picker exposes a dedicated upload dialog for the allowed upload-backed kinds.
The created artifact is selected into the same typed Link input; exact-id and
existing-entity selection remain available. Entity Link prompts use one
full-width picker with the creator as a separate labeled action below it; the
shared entity picker renders its selected reference inside a normal full-width
Select rather than replacing the control with a card and icon-only edit button.
Artifact creator/editor surfaces render only domain-declared typed inputs. They
must not expose the persisted `data.metadata` object as a raw JSON textarea.
its tree starts directly below the workspace action strip without a redundant
Explorer header. Collapse hides that mounted panel and its gutter so reopening
restores the 15/85 split instead of inserting a new equally sized panel. The
initial pane and new split targets stay unselected until an explicit Explorer
selection, while still rendering a blank pane header with their local
split/close controls. Nested workspace headers use neutral structural borders
instead of the signal-orange action boundary. A workspace pane can be a pane-native entity
file or an app-registered workspace page; process data selects neither arbitrary
Vue components nor page-local markup. Entity files reuse registered entity-detail
body overloads, so a queue file is the operational queue editor instead of a
generic summary block; generic child entities continue to use their contract-driven
detail surface. The project entity itself uses that standard detail body. The
action strip receives only screen/main action ids
compiled for the project plus direct project-child creation actions from its
loaded child regions, then resolves and filters them through the effective user
action manifest and project status. Create actions with different internal ids
but the same visible entity/parent operation collapse to one button, matching
the generated create-button label contract.
The cassette designer is an entity-bound registered page that mounts inside a
pane and receives only workspace-visible cassette templates. Source-loaded
children and explicitly linked entities use the same page-opening contract, so
an accessible linked cassette can open the embedded designer. Entity links and
actions inside a linked entity's own child regions stay in the active project
pane as well; they must not fall back to route navigation or a dialog merely
because the entity was discovered one detail level deeper. The recursive
pane tree, split proportions, Explorer width/visibility, active pane, ordered
tabs and their pane-local selections, and opened registered pages persist as
versioned browser UI state
scoped to the current user, organization, and project; only stable references
are stored. Operational bodies
receive file mode and remove redundant rounded panel borders when the file pane
already owns the boundary. Panes can be recursively split right or down and
retain pane-local selections. An overload must not discover extra sources or
actions from domain registries or the global action manifest, and it must not
invent upload/link controls outside compiled process actions.
Child files resolve their own detail-screen actions from the same effective
user screen manifest used by normal generated detail routes. Registered
operational bodies may consume those actions—for example cassette-design
producer actions—while the tab body keeps the remaining applicable
commands. Operational bodies receive only this compiled action set;
main/screen and child-region actions are delivered as separate channels so
child operations can reach an editor without reappearing in its surrounding
header. Operational bodies never supplement this set by scanning the global
action manifest.
Within a queue file, `InstanceWorkspace` gives the composition editor all twelve
columns when no readable nesting-run/support region exists and uses the normal
8/4 split only while that region is present. Queue entry cards use their own
container width to place a bounded preview beside compact quantity/parameter
controls; narrow cards stack internally. Queue composition uses the bounded
grid contract, so entry cards have finite token-backed track and preview widths
while additional pane space produces more columns. Editable queue-item
parameter snapshots render regardless of `STATIC`/`PARAMETRIC` nesting
behavior; that behavior flag is not a field-visibility policy. An entry's fixed
fitted preview spans the left column; its source-template badge and row actions
lead the right column, with inline-labeled parameter controls below.
Registered screen overloads run in the app layout's flush bounded frame: the
route body cannot scroll, and Explorer and file panes own their scrolling
independently.
Role-prefixed compiled screens remain process/designer records, not separate
operational navigation entries for a multi-role user. The auth store exposes
that same effective screen manifest to frontend consumers, so stale
role-prefixed generated records are canonicalized before menu, breadcrumb, or
screen rendering code sees them. Breadcrumb screen switchers list generated
hub/list screens only; paired entity-detail screens are reached from their
list screen and must not appear as duplicate sibling entries with the same
entity label. Generated
action buttons post to the active process action endpoint and then refresh the
screen's entity sources; they do not call arbitrary entity URLs from the
browser. Action completion and the corresponding SSE entity event may request
the same refresh; generated source loading preserves the current render,
coalesces event bursts, and ignores stale request completions instead of
switching the whole page back to its initial loading state. The action response
is applied to matching rendered sources first, so the user sees the mutation
before background reconciliation completes. Collection-level
and detail-level generated actions are limited to the
action ids compiled onto the current screen or region; generated components must
not scan the whole user action manifest and inject every parent-bound action
that happens to match the row or detail entity type. Collection actions emit the
compiled action manifest item itself, not an entity placeholder, because create
actions do not have an existing entity row. Parent-bound collection actions also
emit the source and region context so the generated screen can pass the active
parent id from screen scope to the process action endpoint, or open a parent
selector when the target entity list is not already scoped to that parent.
The generated `home` template is the user's process start screen. Its desktop
surface is the Discord-style `GeneratedHomeWorkspace` overload (see
[components/generated/README.md](./generated/README.md)): entities live in the
sidebar's Tree explorer grouped by home section with containment hierarchy,
the active entity opens in the recursive tab/split pane area, generated
create buttons render on their section folders and on entity rows through
their compiled detail-screen child regions, the pinned communication block
exposes chats (a registered workspace page tab with the built-in inbox rail)
and the LiveKit channel list with create/delete, and the sidebar
footer carries the user controls that the desktop navbar owns on other
routes. The desktop sidebar does not link out to hub entity-list screens.
Mobile mirrors the sidebar tree's top level as one fixed tab strip — the
root type screens plus chats, without user-added tabs or a home tab — and
each type tab renders its compiled typeList screen through the same
generator contract as the desktop panes. Both surfaces use the region's
compiled action ids and the same status/entity filters as collection
screens. The home template must
reuse the same entity primitives and generated action execution path as
collection screens; it must not invent static dashboard widgets, hardcoded
domain routes, or per-card create buttons. Mobile must not construct list
routes from entity names.
Home root filtering is derived at runtime from the domain containment graph,
compiled source metadata, and canonical `lineage.*Id` references. The lineage
fallback covers active manifests whose domain containment catalog does not
declare every stored ancestor (for example a cassette design carrying
`lineage.libraryId`). Sources with a declared non-organization containment
parent are not rendered as Home sections when their records carry that parent;
empty child sections are omitted as well. Empty top-level sections remain
available when they own a top-level create action. Record filtering still
suppresses a descendant when any non-organization ancestor is readable, not
only when its immediate parent is a Home section.
Generated card bodies may replace aggregate child-count facts such as
`summary.queueCount` when those cards are rendered through
`InstanceSurfaceContent`. Prefer compact `InstanceInlineRef variant="compact"`
micro cards when the DTO already carries relation-backed child refs, including
`summary.*Preview` payloads such as queue runs/sheets, library cassettes, or
catalog colors. These galleries render as a bounded grid with two visible refs
and an in-grid overflow control for hidden refs, not as a nested horizontal
scroller. Generated collection surfaces suppress child-count and child-preview
rows because the loaded collection is already the authoritative child view.
Generated entity details do the same when their screen has a compiled child
region. Outside those collection contexts, keep the numeric count when no
previewable child refs exist.
Generated card footers may add an icon-only open-detail action, and generated
cassette cards also expose the access-gated `CassetteDesignerV2` action in the
footer so collection/home cards are not detail-only dead ends. Detail
navigation must still route through the compiled generated screen manifest
rather than hardcoded feature paths.
On mobile, navigation launched from temporary inline entity popovers or lineage
links closes transient overlays, including the chat drawer, before the route
changes. The desktop floating chat launcher is icon-only; unread state belongs
to the app-shell badge, not to a wide floating button label. Opening chat
dispatches the same transient close event first, so inline entity popovers and
shell menus do not remain open behind or above the chat surface.
The mobile app shell runs on PrimeVue `Tabs` as a bottom tab strip: the
home workspace tree's root type screens and chats are real tabs of one
strip, while the profile trigger (account menu with theme switching) is
the single action beside the strip. The tab list is the shared mobile
home tab contract
([composables/README.md](../composables/README.md),
`useMobileHomeTabs`): the app-shell bar writes the selection, the home
workspace's mobile branch renders the selected typeList screen through
the same generator contract as the desktop panes, and a type tab tapped
outside the home route navigates home first. Mobile instance opens
mount the ITEM POPUP: the compiled detail surface in a full-size dialog
owned by the home workspace — the record header's back button
(SurfaceHeader's `navigation` channel) and the dialog's own close
dismiss it, and the expand control routes to the full detail screen
when the popup's bounds are not enough; nested instance opens inside
the popup replace its content. User-added screen shortcuts
and the home tab are disabled while the home workspace migration
settles; organizations without compiled type screens keep a home
fallback tab. The chats tab opens the bounded `/chats` route — chat is a
routed screen, never a state
panel swapped over the current route. Other mobile chat entry points
(status-history actor chat) navigate to `/chats` with the chat target preset,
and the floating drawer surface stays desktop-only; there is no floating chat
bubble on mobile. The strip chrome is adapted for a bottom bar through
component `pt` (tabs stretch to equal widths across the full bar, the strip
and its sliding accent line are dropped, and the selected indicator is the
accent border on the tab's top edge). Two cascade rules force this: PrimeVue
injects component styles at runtime after Tailwind, so (1) Tailwind display
utilities (`hidden`, `md:flex`) must never sit directly on PrimeVue
components — `.p-button`'s own `display` wins, which is why the desktop chat
launcher is wrapped in a plain `hidden md:block` element — and (2) tab strip
internals can only be restyled through `pt` inline styles, not utility
classes.
The mobile shell is gesture-fixed: the viewport meta disables browser
pinch/double-tap page zoom, `assets/css/main.css` pins `html` `touch-action`
to panning because Firefox ignores the `user-scalable` meta, and shell heights
use `100dvh` so Firefox's dynamic toolbar cannot turn a fitted screen into a
scrollable one. Surfaces that own gestures (designer canvases) opt into
`touch-action: none` locally instead.
Type tabs use the registry's authored render labels and icons; they must
not be hardcoded domain routes.
Generated screen titles, home section headers, generated breadcrumbs, and
generated action buttons resolve labels through `utils/generated-labels.js`.
That resolver prefers screen/region `labelKey`, then domain entity label keys,
and only humanizes ids as a last fallback. Generic process action labels must
not display English verbs such as `Create` or raw target statuses such as
`DELETED`. Obvious actions render icon-only on instance surfaces — create is
the plus glyph, delete the trash, plain edit the pencil — with the localized
label (create: the entity name) carried as the tooltip and accessible name;
menu rows and state-transition buttons keep full
labels. Status-mutating update actions resolve their target state's icon and
severity from the compiled state policy (the same flat vocabulary
`InstanceState` uses), so transition buttons carry the authored state icon.
Generated non-status action surfaces, including detail header buttons and card
footers, must not render status-mutating update actions. `InstanceState` loads
server-filtered actions and owns the status popover/history.
Generated entity detail headers show the entity `TraceChain` instead of a
standalone repeated identity name, so the opened record keeps lineage context in
the primary header while actions/status remain in the same header row.
Child collection cards exclude the parent already displayed by the surrounding
detail screen from that trace while preserving other readable ancestry.
Displayed contexts form a propagated stack, so project workspaces also remove
the project already represented by the shell from every nested entity trace.
Generated card collections use bounded token-backed tracks; parent width adds
tracks without squeezing operational cards into arbitrarily narrow columns.
Entity reference popovers inside generated surfaces mirror the action affordances
available on the referenced entity's generated detail screen. They resolve
compiled detail-screen action ids through the same access/status visibility
helpers as detail headers, consume workspace-specific actions such as queue
nesting controls, and execute generated buttons through the surrounding
generated screen's process action handler instead of calling process endpoints
locally.
Entity-detail templates render child collection regions inside the `InstancePage`
body so parent-child graph flows, such as project-to-queue creation, stay in the
opened parent context.
Generated entity details may provide registered entity-specific bodies when
the domain has a real operational editor contract. Queue details mount the
queue editor workspace inside the generated detail page as an entity-local
editor: sibling queue navigation and project-route creation controls stay
hidden, the editor renders through `InstanceWorkspace` instead of the route-level
three-lane workspace, and editability comes from the active process
`queues:write` grant on the current queue rather than hardcoded workflow states
such as `DRAFT`. Queue-local command panels are separate from queue editing:
generated detail resolves region action ids through the user's compiled action
manifest and the current entity type/status before passing executable actions
to the editor. The nesting controls render only from a resolved manual
`runCommand` action for `solveNesting`; `queues:write` may enable queue
job/settings mutation but must not invent a command panel. Actions consumed by
registered entity workspaces are not duplicated as generic detail-header
buttons. Entity-local operational editors should use the canonical
main/supporting proportions from
`InstanceWorkspace` rather than inventing local stacked or sidebar grids.
`InstanceWorkspace` and queue card grids use container breakpoints, so the
main/supporting split and repeated cards respond to the actual editor pane
width after a workspace split instead of the browser viewport width.
Sheet-design details similarly mount `SheetDesignEditor` when the active user
has a concrete `sheet_designs:write` grant. The editor runs on the shared
designer shell (`DesignerSurface` + `DesignerWorkspace`) with a full-bleed
sheet canvas and its commands (add/upload/rotate/delete/save) in the shared
dock. The editor mutates nesting source
items and placements, resolves OCCS layer pens through the shared layer
standards, snaps transformed cassette production-contour edges with tool-kerf
clearance, checks transformed polygon clearance before accepting a placement,
clamps complete rotated geometry inside the usable sheet polygon when one is
present, falls back to rectangular sheet bounds for virtual rectangle sheets,
supports existing/uploaded cassette designs, and persists through immutable
geometry revisions. Generated
sheet-design details keep the sheet identity visible in `InstancePage`; read-only
details keep the standard geometry display.
The queue detail support region for nesting runs follows the same contract:
process mode separates command controls from result viewing. The nesting
command/settings panel renders only when the opened queue detail receives a
resolved manual `solveNesting` run-command action. The run result region may
render for users who only have entity-scoped `nesting_runs:read` on concrete
runs, but it must not expose command settings or a run button. Run cards gate
destructive controls with `nesting_runs` grants for the concrete run, not with
parent queue or global feature permissions. Process-authored result states
such as organization-specific cut/done labels still render run metrics and
sheet-design output when `data.results`, `data.sheetDesignIds`, or scoped
sheet-design context exists. Queue details load sheet designs by the concrete
readable run ids as well as queue lineage, so a run output card can display the
layouts it owns without requiring a broad sheet-design list screen. Run cards
must not treat only domain `COMPLETE/CHOSEN` as displayable output.
Generated queue detail receives command actions from the compiled screen
manifest. A queue command such as `solveNesting` must be present on that
queue-detail screen because it is executed against the queue input; output
entity grants for `nesting_runs` or `sheet_designs` must not be used to decide
where the command panel renders.
Generated command dialogs use the command input contract directly. A command
can mark a context-bound entity input `prompt: false`; a process action wired
to that entity then renders as its action button without a redundant picker.
Enum options may declare `optionsFromEntity`; the dialog filters those choices
using the selected/context entity DTO. Command results may include output DTOs
beside their typed entity references, and the generated screen applies those
snapshots to any matching loaded source immediately.
Existing-entity
linking stays on the generic generated-action surface: a compiler-generated Link
action for any declared relation renders as **Add {target entity}**, uses the
shared scoped option/creator dialog.
nesting another entity card inside the queue item panel.
Cassette details expose `CassetteDesignerV2` as an access-gated entity editor
action instead of routing users to a static asset page, and generated cassette
collection/home cards mirror that same editor action in their footers when the
user has `cassettes:write` on the concrete cassette.
The generated instance-detail overload registry also maps `cassette` directly to
the `CassetteDesignerV2` surface. Project panes and ordinary generated cassette
detail routes therefore use the same editor affiliation and shared full-height
designer host.
safe visual graph document.
Entity-bound generated actions are filtered before
rendering: the action entity type must match the region source, and
status-change actions render only when the entity's current primary status
matches the compiled `status.from` / `access.statusFrom`. Create and update actions read
`inputPolicy.fields` from the compiled action manifest; create actions also
read `construction.inputs`. Promptable fields open a `StandardDialog`, default
values can come from process block/value nodes, and non-prompt fields with
wired defaults are still included in the submitted payload. This lets the
visual graph provide constructor/editor data without forcing a dialog field for
every wired input. Entity construction fields render as entity or entity-list
selectors when the domain has a canonical list source; entity-list values are
normalized into the constructor payload shape required by the target domain
input, such as queue job items from selected cassette designs. Cassette template fields list only
construction-ready templates and preselect the first available required
template so process-created designs do not select empty draft templates or
submit missing template ids. Buttons derive semantic labels and icons from the compiled
action kind, entity type, and target status when an old manifest still contains
a generic label such as `Create`.
Generated create dialogs are field-driven: a required prompted field inside
`inputPolicy.fields` opens the dialog even when the action-level prompt flag is
false. Queue creation therefore asks for a queue name before creating the
shell. Cassette-design creation uses a typed `cassetteParameters` field: once a
cassette template or parent cassette is selected, the dialog renders one
numeric control per OCCS parameter discovered from that cassette definition.
When the action is already scoped to a cassette parent, the template selector
is hidden and the current parent cassette supplies both the construction
template id and the parameter set.
Generated relation Link dialogs always render the shared entity select for the
declared target type. They bind the opened detail entity as owner context and do
not fall back to a raw exact-id text field when the authorized option list is
empty or still loading.
When a Link relation has an embedded creator, switching to Create new replaces
the relation selector with the creator's actual fields instead of nesting them
under a redundant raw entity label. The dialog keeps the action name as its
header, uses Add as the submit command, and exposes Select existing to return to
the relation picker.
Generated collections may turn `identity.name` into a link only through the
screen manifest: the collection looks for an `entityDetail` screen with a
single source for the same entity type, preferring the detail screen paired
with the current screen key (`<screenKey>_detail`) only when that paired screen
exists for the same entity. Parent detail screens that include child collection
sources are not valid detail targets for those child rows. The route uses
`/screens/:screenKey` with `instanceId` and `{typeId}Id` query scope. The
screen page merges that query scope into the screen contract before the
single-source loader runs. Do not hardcode generated rows to legacy feature
routes, and do not replace the shared card title chrome just to make the name
clickable; generated cards must keep the standard identity/status row.
Generated collection cards render visible process actions as generated buttons
in the card footer. The action must be present in the user's compiled action
manifest and match the current entity status before the footer renders it.
Row-bound generated actions pass the concrete row entity plus collection context
to the action runtime; command actions resolve the entity key from the action
input contract, so a `solveNesting` button on a queue card submits
`entities.queue` for that exact queue.
Generated collection, home, detail, and inline surfaces render hard deletion
only as a compiled manual `deleteEntity` action present in the current user's
action manifest. The action is capability-gated during authoring and activation,
requires admin access, executes through the process mutation boundary, asks for
confirmation, and refreshes the generated screen after success. Generated
surfaces never synthesize delete visibility from domain declarations and grants.
Parent-bound create actions render once in the matching generated collection
toolbar only when at least one visible row can satisfy the parent contract; the
input dialog then asks for that parent entity and filters the selector to rows
whose status/action rules match. The same actions render in matching
entity-detail action areas without a parent selector because the opened entity
is already the parent.
Child collection regions inside an entity detail must preserve the opened
parent context when executing create actions. They may not replace that context
with the child collection entity type, otherwise a `library -> cassette` action
loses the concrete library id and creates unscoped children.
`InstanceState` must not receive locally synthesized process actions.
Generated action setup and execution failures must be visible in the screen:
prompt option loading errors, missing required entity options, and execution
errors all surface through `StateBlock` and PrimeVue toast feedback instead of
being converted to empty controls.

Lifecycle transitions belong in `InstanceState` and should come from the
canonical workflow/status API or development workflow previews. Destructive,
edit, reset helper, and feature command buttons stay outside the status surface
in card footers or page action slots.
Geometry-capable entity cards should render the visual source, not tags that
state a file type or preview flag. Use `GeometryPreview` for entities with
`data.geometry.preview`/points and `CassetteThumbnail` for cassette DTOs because
it resolves DXF, stored geometry previews, OCCS definitions, and legacy
parametric definitions in the correct order. Cassettes must use
`CassetteThumbnail` on detail surfaces as well as cards; do not route detail
previews through generic `GeometryPreview`, because uploaded templates store
their renderable source as `data.layerData` or `data.polygonParts`.
Parent-level card click handlers must ignore nested interactive targets through
`utils/interactive-target.js` so embedded statuses, links, artifacts, geometry
previews, and nested inline cards remain clickable.
Interactive status belongs only to entity types with real `cncWorkflows`
definitions. Cards for DTOs without workflows should set `:show-status="false"`
or use a read-only badge only when the data model requires it; do not invent
component-local lifecycle states.
Entity-specific card components should use `before-identity`, `subtitle`, body, and footer slots; do not override `#title`, because that bypasses standardized identity/status layout. Subtitle slots that render entity facts must be hidden for `variant === 'card'`; the full card body is the only owner of those facts.
Entity-specific cards should render a single `InstanceCard :variant="variant"` and
pass their canonical body once through the default slot (see
[components/shared/README.md](./shared/README.md)). Inline/compact/card
branching inside entity cards is a smell unless the entity has a genuinely
different structural surface.
Entity detail components should use `InstancePage` for trace, identity, status, and page actions instead of rebuilding header rows locally.
Single-field rename/edit actions should use `NameEditPopover` near the relevant
identity or action cluster; reserve `StandardDialog` for creation flows,
destructive confirmation, or forms with multiple fields.
## Design System Manifest

`@perigram/facade` defines the CNC design-system contract for entity demos:
entity key, component prop name, variants, status policy, trace policy, factory
name, field groups, surface contracts, and docs links.
`utils/design-system-contract.js` is a compatibility export with validation, and
`utils/design-system.js` attaches Vue components and factories to that contract.

`pages/test/ui-lab.vue` renders from this manifest. When adding or renaming an entity card, update the manifest and its DTO factory instead of hand-editing UI lab sections.

`framework.manifest.json` snapshots this same contract for framework consumers.
Entity card `DataBlock` paths are resolved from the domain field groups instead
of scraped from Vue source. Field groups define display semantics; field access
remains the security boundary. App implementations may layer additional field
groups and surface overrides only when their DTO paths are also declared in the
field-access policy.

## Visual Tokens

`assets/tokens/index.js` is the sole textual source for app-owned visual values. Nuxt projects its light and dark CSS variable maps into the document, Tailwind consumes its semantic aliases, and the PrimeVue preset projects only the primary brand palette and zinc surface scale onto Aura. Do not duplicate token values in runtime CSS or add generic PrimeVue component-token overrides.

Aura owns generic control and container typography, spacing, borders, radii, shadows, hover, active, disabled, invalid, and keyboard-focus states. App tokens are bounded to domain entity tones, status/process signals, operational workspace constraints, reusable layout dimensions, motion, and app-shell chrome. The `rounded-ui`, `rounded-panel`, `shadow-card`, and `shadow-overlay` utility aliases consume Aura variables directly; they do not define application radius or elevation values.

Application typography has exactly nine complete roles: `text-page-title`,
`text-section-heading`, `text-body`, `text-label`, `text-supporting`,
`text-metric`, `text-technical`, `text-prose`, and `text-editor` (the
document editing voice: serif like prose, one size step larger for
authored content). Each alias supplies its font
family, size, line height, weight, tracking, and numeric behavior from
`assets/tokens/index.js`; usage sites must not compose those treatments from
raw size, weight, tracking, leading, mono, or serif utilities. Only
`page-title` scales responsively. PrimeVue controls inherit Aura typography
unless their content itself has a technical or prose role. HTML elements such
as `p`, `blockquote`, headings, `pre`, and `code` never select an application
role by themselves. Non-role font sizing is limited to locally documented
runtime data that directly encodes visualization geometry or information
magnitude, never ordinary copy or compact UI.
Nested active app surfaces must use semantic aliases such as `bg-content` or
`bg-subtle`, not raw palette utilities like `bg-surface-50`, so dark mode uses
the app token overrides consistently. The surface contract is flat:
the gray page is the single canvas, structural
containers — panes, tab strips, workspace and layout wrappers, chats, and
call surfaces — paint no background at all; `bg-content` belongs to
overlays and controls (dialogs, popovers, inputs, chips over media) and
`bg-subtle` to in-surface insets (bubbles, hover rows, placeholders),
never to layout boxes. PrimeVue `Splitter` roots are forced transparent
(`!bg-transparent`) because Aura paints `content.background` on them, which
would give split pane areas a painted surface the rest of the shell does not
have. Pane-hosted surfaces size their internal layout
through container queries on their own width, never viewport
breakpoints. A container query cannot restyle the container element itself,
so a surface that needs its own flex direction to switch (for example the
chats two-pane split) declares the container on an outer wrapper and keeps
the direction rule on the inner layout node.

Use token-backed classes such as `max-w-app`, `status-*`, `signal-*`, PrimeVue semantic classes, and shared layout primitives (`StandardPage`, `ResponsiveGrid`, `TableFrame`, `StateBlock`) instead of local arbitrary max-widths, colors, radii, shadows, typography, or transition durations. Muted text is the `text-muted` class backed by the `muted` color entry (`colors.muted` → `var(--p-text-muted-color)`); the entry must live at `colors.muted` because Tailwind parses `text-muted` as the `text-` utility plus the `muted` color path — a top-level `text-muted` key can never generate the class. PrimeVue documentation names like `text-muted-color`, `text-color`, or `bg-surface-ground` are token names, not classes in this app — they compile to no CSS, silently fall back to inherited color, and `shared/design-system.spec.js` rejects them. `signal-*` names process-canvas meaning rather than a hue; raw Tailwind palette classes are reserved for real data only. Interactive rows and single-select lists use PrimeVue primitives — the chats inbox and feature pickers are `Listbox` with rich `#option` templates, link-style text actions are `Button` with the `link` variant — instead of hand-rolled `<button>` rows.

**Surface ladder** (`assets/tokens/index.js` owns the values; this is the
contract): `canvas` (`--ck-page-background`, zinc one step below content)
is the single page and app-shell ground; `subtle`
(`--ck-subtle-background`, one step above canvas) is the inset level for
wells, preview bands, and inline reference chips; `content`
(`--p-content-background`, the lightest/darkest step) is the INSTANCE
SURFACE — cards, generated table/tree rows, and record sheets always sit
on it, one step above the canvas, so instance-bearing surfaces never
blend into the page; overlays (dialogs, popovers) stay PrimeVue's
highest level. Structure reads through borders and `subtle` insets,
elevation through overlay shadows — never through painting the canvas.
Flattening the page onto the content surface is a contract violation:
instances lose their step and every card goes invisible.

**Table row surfaces** ride the same ladder: the PrimeVue preset paints
every DataTable/TreeTable row as the content surface
(`datatable`/`treetable` `row.background`) with structurally present but
transparent internal cell dividers (`bodyCell.borderColor`) — row
stripes are gone, the row IS the card. A row's own background is NOT
clipped by its `border-radius` (measured: corner pixels stay white), so
the shared row-surface recipe rounds rows by clipping them —
`[clip-path:inset(0_round_var(--p-border-radius-xl))]` through the
official `rowClass` channel — beside the layout-only scoped
`border-collapse: separate` block with a `0.25rem` row gap and a muted
transparent header band: the generated collection tables
(`CollectionTable`), the legacy
`GeneratedInstanceCollection`, and the organization users tables
register it. Surface paint belongs to the preset — one owner per
concern. Rows are rounded, never outlined or ringed: the surface step
over the canvas plus the hairline gap is the whole separation.

**Measured values** carry the mono face (`text-technical tabular-nums`,
the sanctioned mono alias): quantities, instants, and numbers in
generated displays — fields, table cells, card facts, detail bodies.
Prose, labels, identities, and enum values stay in the UI face; mono is
for values whose alignment or precision matters, never for text.

**Control sizes** follow density, not preference: the generator's
spacing scales carry `editorSize` (compact region scales 0.5/0.75 render
PrimeVue controls at `small`; the normal scale and above render them at
the default), operational chrome (toolbar buttons, table headers,
inline actions) renders at `small`, and forms/dialogs render at the
default — `large` is reserved for display-scale moments (hero actions),
never for data surfaces.

App scrollbars are themed globally in `assets/css/main.css` from
`--ck-scrollbar-thumb` / `--ck-scrollbar-thumb-hover` (text-color mixes that
follow each scheme): a floating rounded pill thumb over a fully transparent
track with no arrow buttons; only the IDE tab strips hide them entirely.
The engine split is deliberate: Chromium ignores `::-webkit-scrollbar`
pseudos whenever a standard `scrollbar-width`/`scrollbar-color` is non-auto,
so those standard properties ride only engines without the pseudos (Firefox,
gated by `@supports not selector(::-webkit-scrollbar)`) — Chromium must keep
the pseudo-styled pill or classic-scrollbar platforms regress to native
thin scrollbars with arrow buttons. Scoped CSS is limited to exact reusable-layout declarations enforced by `shared/design-system.spec.js`; padding remains Aura-owned spacing. Inline bindings are either exact reusable layout or derived semantic composition, or narrowly allowlisted when their visual value is driven by data.

## UI Inventory Policy

Component cleanup uses a route/registry inventory instead of deleting files by
name. Files can be:

- **route-active** when reached from `pages/**` or `layouts/**`;
- **registry-active** when referenced by the design-system manifest,
  `utils/design-system.js`, `InstanceInlineRef`, or framework inspection scripts;
- **dormant** when not currently routed but still architecturally meaningful.

Dormant components are inspected and may be refactored, but are not removed by
automated cleanup. Legacy components such as old dashboard/footer widgets must
be removed only by an explicit human cleanup decision.

The canonical component and mechanism inventory lives in
[docs/UI_COMPONENT_AUDIT.md](../docs/UI_COMPONENT_AUDIT.md). It classifies every
repository Vue file as system-owned, a shared/domain primitive, or derived usage
and records source-derived dispositions for typography, layout, chrome, states,
important overrides, and scoped CSS. Run `node scripts/ui-visual-inventory.js`
after an intentional visual change. The design-system test derives the same
findings, checks path-derived IDs, and validates scoped layout declarations by
property. It also rejects every runtime PrimeVue selector or variable
declaration and all `!important` rules in global runtime CSS, so stale rows,
broad whole-file CSS exceptions, and a second runtime visual layer fail.

## Composables Rule

`useBlocks.js` composables (`useStatus`, `useLineage`) are **only** used inside the shared state/trace primitives (`InstanceState`, `TraceChain`). Entity cards and pages must never import from `useBlocks.js`; identity chrome resolves through the compiled identity policy helper and fact rows render through `DataBlock`.

No exceptions are currently needed in used entity pages/cards; state-only conditionals should use a local `computed` from `entity.states`.

## Data Access

- Prefer canonical DTO blocks for entity data: `identity.*`, `status.*`, `lineage.*`, `attachments.*`, `data.*`, `summary.*`. Hoisted aliases may be used only as defensive fallbacks when a current API response still emits them.
- Entity cards should present an operational summary, not decorative placeholders: identity/status in the title, concise specs/data in the body, and actions in the footer.
- Pages and workbench/demo surfaces must not add behavior wrappers around
  entity components to simulate missing component behavior. If inline/compact
  variants need expansion, relation detection, commands, or other interaction,
  implement that contract in the entity component or a shared entity primitive
  and let pages render the component normally.
- Entity cards may consume an injected `entityContext` in development surfaces
  to render related entities from the same generated graph. Prefer explicit
  props in production pages; use context only as a fallback for workbench/demo
  relationship detection.
- Mutable current location belongs in `status.lifecycle.data.location`, not in a static display-only card field. Supported UI location types are `warehouse`, `coordinates`, and `address`; warehouse locations render as entity links.
- The cassette template surface and the produced-cassette surface are
  separate UI surfaces and must not be collapsed into one card contract.
- Queue-produced cassettes render the produced geometry through the cassette
  card family and embed source design/template/queue context through
  compact `InstanceInlineRef` rows. Queue-produced instances are already `CUT`;
  lifecycle action design remains a workflow-machine concern, not a local card
  action override.
- `CassetteDesignerV2` owns OCCS cassette-template editing. It uses
  `DesignerWorkspace` for its responsive palette/canvas/inspector layout; the
  shared workspace owns layout only and does not interpret OCCS state.
  or nesting records.
  `StandardDialog` for the profile sketch popup and `ProfileSketchEditor` for
  reusable `profile_template` sketches. Profile drawing saves library templates;
  cassette geometry consumes those templates from the selected hanger feature's
  profile selector instead of adding a separate profile workpiece to the
  cassette graph. Hanger features keep their production-mode controls, including
  cut-in-parent behavior, and selected profile snapshots replace the default
  hanger cut polygon when present. Hanger placement is edited from the
  attachment popup as edge-relative placement: edge margin, normal offset,
  edge id, count-or-spacing array value, and profile mirror controls live with
  the relation instead of duplicated width/height fields in the workpiece row.
  Graph rows must not duplicate hanger family, production mode, or profile
  selectors as badges; those values are edited in the expanded controls.
  `ProfileSketchEditor` is a compact CAD-style direct editor: new profile
  sessions start blank, the polyline tool uses a command loop with first point,
  rubber-band preview, subsequent vertices, explicit Close/Undo/Finish actions,
  endpoint snaps, typed distance from the previous point, optional ortho
  projection, circle holes, DXF import, and per-corner fillet radii. It uses
  thin linework and small square vertex grips, and does not own a general
  parametric constraint solver. `components/ProfileSketchEditor.spec.js`
  provides the focused Vue smoke coverage for malformed and empty in-progress
  sketches; helper math remains covered in `utils/occs/profiles.spec.js`.
  Profile template selectors must normalize library DTOs through shared
  select-option helpers so PrimeVue receives string `label` and `value` fields
  even while template data is loading. Profile-dialog selects keep their
  overlays inside the dialog so nested designer dialogs do not close when a
  dropdown is opened.
- `RemnantCard` and `RemnantDetail` render saved leftover material geometry
  through `GeometryPreview`, including polygon-with-holes queue-cut remnants.
  Source sheet, warehouse, and material pile context should be compact
  `InstanceInlineRef` rows, not trace-link-only rows or local status badges.
- `GeometryCaptureCard` and `GeometryCaptureDetail` render photo-derived
  `geometry_capture` drafts through `GeometryPreview`. Confirmation belongs to
  the capture review API because remnant mode creates a real `remnant`, while
  facade mode remains a draft geometry input until facade entities exist.
- `material`, `materialPile`, and `batchPile` are separate UI surfaces:
  material cards describe the base material record, material pile cards
  summarize general/manual warehouse stock, and batch pile cards show
  requisition-sourced receipt context from `lineage.requisitionId`.
- Entity relation rows use `InstanceInlineRef` with design-system surface keys
  (`materialPile`, `nestingRun`, `cassette`, etc.). Do not use
  `TraceLink` for relation summaries inside cards/details; reserve it for rows
  whose explicit purpose is route navigation.
- Never hardcode values or make assumptions about data structure — check `server/DATA_MODEL.md` first.
- For cassette templates and queue entries, derive parametric vs static display
  from the cassette/design DTO itself, not only from saved queue item flags.
  Prefer `data.parameters` when present and fall back to OCCS
  `data.definition.parameters` for templates so updated OCCS templates do not
  appear static in selectors. Template/source cassette cards must not render
  parameter counts; generated cassette-design surfaces render exact
  materialized values from `data.parameters` with
  `provenance.derivedFrom.parameters` only as a display fallback.
- `CassetteDesignerV2` is the persisted cassette-template designer used by the
  production app cassette surface. The admin workbench no longer exposes it as a
  separate section; the legacy non-persisted `CassetteDesigner` remains only for
  dev/test fixture surfaces that still need its local-save graph format.
- `CassetteDesignerV2` edits the cassette template name, loads existing
  templates from parent-provided options, receives `persistedTemplateIds` from
  the parent to distinguish DB templates from generated fixture templates,
  persists saves through the configured save handler by default, and emits a
  save payload with the saved cassette DTO plus the OCCS v2 definition and
  `extensions.perigram.graphTree` so the parent can mirror and reload the exact
  graph tree. Template data is applied only when the selected template id
  changes; saving or updating the fixture context must not overwrite the
  in-progress name/graph draft. It starts from one root
  `face.trapezoid`, adds child trapezoids
  immediately when users click unoccupied canvas edges, stores the result as a
  recursive graph tree with a top-level OCCS-style parameter scope (`A`, `B`,
  `R`, ...), and keeps actual OCCS workpieces as graph nodes connected by
  OCCS cassette joints. The designer shell separates document actions,
  geometry editing, global settings, assembly topology, and folded 3D preview:
  the canvas owns only CAD interaction, the left document/settings rail owns the
  active cassette name plus compact load/save/reset actions, global parameters,
  layer visibility, and OCCS JSON, and the assembly rail owns the
  compact workpiece DAG/list plus 3D preview. The load selector is an action
  placeholder rather than a second selected-name display, and save/reset are
  icon-only controls. The workpiece `+` action creates a new
  `definitions.workpieces[]` entry,
  matching cassette occurrence, root face, and face-relative joint instead of
  another fold child on the current sheet. The link action declares another
  attachment for the selected workpiece without creating geometry. Non-root
  workpieces can be deleted, which removes only that workpiece, its faces, and
  incident OCCS joints. Relation rows appear under both source and target
  workpieces so multi-parent attachments stay visible; they open the
  canvas-local attachment editor
  for target/source face, target/source snap points, face offsets, rotation,
  side, joint type, method, and driver choice, can remove a joint link without
  deleting either workpiece, and display unresolved/impossible diagnostics from
  the folded preview helper. Attachment placement choice is
  internal renderer state; the user workflow only declares face-to-face
  attachments. Hardware is added from the workpiece rail as declarative OCCS
  workpieces rather than SCAD-style operation history: bolts, nuts, washers,
  rivets, screws, spacers, standoffs, and hanger clips carry family/parameter
  metadata, hanger clips expose `sheetPart`, `integralCut`, and `castSolid`
  production modes, and their placement can be a dynamic edge array on the
  target face edge. Array placement uses the attachment `offsetX`/`offsetY` as
  the first item position and then either a count distribution or spacing step,
  not a separate start/end/normal-offset system. Integral-cut hanger clips
  boolean-subtract from the parent face, so the affected face becomes a polygon
  shape with holes and also exposes helper `cut.inner` polygons; bolts, rivets,
  screws, spacers, and standoffs generate exact `cut.hole` circles at their
  resolved placement points. Non-sheet hardware renders as schematic 2D cassette
  marks, production cut layers, and folded 3D preview bodies; folded 3D face
  meshes triangulate those hook holes while preserving the original uncut
  trapezoid edges as fold/reference frames, so cutouts do not corrupt face
  transforms. Sheet part hanger clips remain sheet workpieces with generated root geometry. The 2D canvas stays in selected-workpiece flat
  editing mode for face operations, while the folded 3D panel is a single
  cassette assembly window in the assembly rail: workpieces render in deterministic varied hues,
  source/target face attachment snaps are applied after sheet folding, clicking
  a workpiece selects it in the designer and isolates it in 3D, and the back
  button returns to the whole cassette view. The designer selects faces from hoverable canvas face
  clicks, resolves
  `face.trapezoid` boundaries through a pure OCCS trapezoid geometry helper
  from cached parent edge vertices, and displays an OCCS v0.4-draft template
  with per-workpiece faces, folds, occurrences, and joints. New documents start
  with one root face; adding a child from a non-return face defaults to
  `return_flange`, while adding from a `return_flange` defaults to
  `mounting_flange` with a `-90` fold. Face shape
  sockets store arithmetic expression strings such as `A + 10` or
  `B + (R / 2 - 1)`. `CassetteExpressionEditor` keeps those fields text-backed
  while validating them, highlighting recognized tokens inline, offering
  one grouped cassette-parameter/operator/trig chip panel under the active
  expression, a tooltip usage guide, and a child-face `∠ foldAngle` context
  chip. The editor stays single-line with horizontal overflow, and the chip
  panel is positioned as an overlay so active fields do not resize the
  parameter list. Highlight refresh restores cursor selection only for the
  focused editor so sibling parameter fields cannot steal focus during invalid
  draft edits. Selected-face offsets are edited from compact value chips
  centered on evaluated face points, positive offsets extend points outward
  while negative offsets move them inward, base offset anchors stay in the same
  popup, and generated `dimension.cassette` labels stay on the annotation layer
  while selected/hovered labels get interactive edit chips. The
  renderer preserves those strings in OCCS and resolves numeric values only for
  preview geometry. Free edge handles show a `+` only on hover, and only the
  visible `+` chip adds one child face. The edge hit line itself only manages hover.
  folded edges show a plain numeric fold angle and open the inline angle editor
  when clicked. The selected face exposes an editor-surface action menu for
  canonical OCCS face role ids and child-face deletion. Deleting a fold is not exposed as a
  separate command because the current same-sheet model cannot keep an orphan
  face; deleting the child face removes that face and its descendants.
  Selecting a workpiece
  or attachment from the assembly rail switches the 2D canvas to assembly context; when no face is
  selected, attached/background workpieces render with transparent pens and
  source/target attachment markers, while only the active/selectable workpieces
  receive face hit targets. In attachment mode, clicking source/target
  workpiece faces updates the corresponding joint faces.
  The assembly rail scrolls topology internally instead of occupying the CAD
  surface.
  The designer keeps a 50-step document history for cassette name and graph
  edits, exposes undo/redo buttons in the canvas top-left overlay plus standard
  shortcuts outside text fields, and stores session-local autosave drafts per
  template id without writing to the server before explicit save or showing a
  persistent autosaved badge. Absolute onboarding callouts formalize the first
  designer scenario and appear near document controls, the 2D editor, inline
  popups, and topology. Editable section-plane handles on the main drawing generate 1:1 left and top
  section views by intersecting the folded 3D workpiece geometry; section
  graphics are emitted on the toggleable `code.cassette_mark` layer while the
  canvas keeps only invisible drag hit targets. At `xl` and wider breakpoints
  the designer uses side/canvas/assembly columns; at `lg` it keeps canvas plus
  assembly columns with global settings docked below, and below `lg` the canvas,
  assembly, and settings panels stack. Global parameter fields switch to a
  multi-column grid while the settings panel is wide and back to one column in
  the narrow side rail. The 3D panel is hidden below `lg` so the mobile
  assembly row remains usable for workpiece and relation controls.
  Layer visibility is controlled by the
  designer, so hidden layer names persist when the preview regenerates after
  face additions. Invalid expression drafts do not clear or redraw the canvas;
  the designer keeps the last successful preview until the tree evaluates
  again. Designer preview layers are built by canonical `utils/occs/` helpers
  and carry OCCS layer-standard codes for the united workpiece fill, derived
  `cut.outer` workpiece outlines, derived `fold.route` paths, and generated
  `dimension.cassette` annotation entities so `DrawingCanvas` resolves colors
  from layer standards and pen templates. Template dimensions display expression
  labels such as `A`, `B`, and `R`; evaluated/baked designs store measured
  numeric annotation values.
  The assembly rail hosts
  `CassetteFoldedPreview`, which projects the evaluated 2D face loops
  through OCCS fold topology for a compact folded 3D view with drag orbit,
  wheel zoom, and reset controls. The preview panel keeps mounted with an empty
  state while projection data is unavailable and renders the folded
  faces through a Three.js WebGL scene with real depth testing, double-sided
  materials, outline edges, lights, and raycast workpiece selection. The
  preview panel must not stop document-level pointer movement, because
  OrbitControls registers drag continuation on `ownerDocument`. The designer
  root uses a fixed viewport-height work area in standalone/dialog contexts and
  fills its supplied workspace pane in embedded mode, with internal
  side-panel/canvas overflow instead of growing below its owner.
  Edges already represented by either side of a fold are not clickable. Inline
  coordinate/expression popups are draggable, remember their session-local
  position, keep close controls in the input line, and close on Enter or
  Escape. It
  automatically emits a `code.cassette_mark` text entity at the bottom-left of
  the main/root face for each sheet workpiece. The mark text resolves from the
  current cassette template name, template id (or `draft` before first save),
  and one-based workpiece number, so preview, saved OCCS, baking, and nesting
  share the same mark intent.
- `CassetteEditorDialog` is the DXF import surface for standard cassette
  templates. It asks only for a cassette name, DXF file, and DXF-layer to OCCS
  layer-standard mapping; it does not edit template parameters. The dialog
  previews the selected DXF through `DrawingCanvas`, requires one source layer
  mapped to `cut.outer`, and emits the created template — with its extracted
  polygon geometry on the cassette record — to normal upload listeners.
- For standard CRUD and status operations, use `useEntity` — no direct `$fetch` calls.
- Direct `$fetch` is reserved for custom workflows that are not represented by `useEntity`: declared domain operations, uploads/downloads, invitations, permissions, support chat, organization billing, debug endpoints, and project-scoped subresources.
Support chat uses direct `$fetch`/SSE routes and the shared
`SupportMessageContent` renderer. Messages may target the support channel or a
specific user selected from status history actor rows, and inline entity
references must render through `InstanceInlineRef` rather than local chips. The
floating Chats drawer opens to an inbox backed by `/api/support/conversations`;
that inbox contains only conversations with persisted messages and offers a
header user-plus action that opens a simple new-chat dialog, and a close
action in the inbox header so the drawer is dismissible from the list too — a filtered
raw Listbox of plain avatar+name user rows; picking one opens the direct
thread, including a direct self-chat. The inbox is a PrimeVue `Listbox` (single selection with keyboard
navigation and Aura's selected-option state) whose `#option` template renders
the rich row, top-aligned on two lines: avatar or neutral fallback plus
online dot; label, member count, and the smart timestamp (clock time for
today's messages, calendar date otherwise) on the first line; the
single-line latest-message preview through `SupportMessageContent` below,
led by the read mark (a check) when the newest message is the viewer's own
and another participant has read it. Selection renders as the Listbox
checkmark (`highlightOnSelect` off) — no tinted highlight. A hover
ellipsis in a fixed trailing right slot opens the row menu
with per-user pin/archive preferences: pinned rows lead the list, archived
rows disappear behind the inbox header's archived toggle (which swaps the
list to archived conversations with a back affordance). Drawer rows show
participant context and render latest
message entity tokens through `SupportMessageContent`, without per-row
message-count badges. Message bubbles own a `min-w-0`/`max-w-full` chain with
`overflow-wrap: anywhere` text wrapping, so long unbroken strings stay inside
the chat bounds. Conversation history is lazy: the thread loads the newest
message page and prepends older pages on scroll-to-top through the
`limit`/`before` cursor contract, preserving the scroll anchor. Voice messages
record through `MediaRecorder`, upload through the files endpoint, and render
as a native audio player on the bubble plus a voice chip in previews. While
the org has a transcription provider configured (`GET
/api/transcription/config`), audio-only voice messages carry a transcribe
button beside the player; the request fills the bubble with the transcript in
place (other viewers sync through the `message.updated` conversation event).
Attachments attach through the shared `ChatAttachmentPicker` (see
[shared components](./shared/README.md)): a raw Popover + Tree hierarchy —
home-screen sections whose create actions render as inline entries
right beside the entity children (no second popup), lazily loaded rows, and
pure lineage nesting. One tap on an entity adds the ref and closes the
picker; an inline create entry runs the generated create flow
(upload-creator dialog, typed prompt dialog, or direct execution) and the
created entity attaches to the draft like any picked ref. The paperclip
trigger stays disabled while the home screen exposes no list sections. The
picker browses the same compiled home-screen list sources the sidebar
renders (uncapped, user-available window) with the Tree's built-in search;
recipient-access metadata is not fetched there — the support service
derives it on send and on draft hydration, so the draft warns about
chat-only entities from the stored refs. Selected attachments stay in
structured
`entityRefs` and render as removable draft chips before send; any text preview
must not duplicate ordinary textarea text. Status-history actor chat actions
preseed the current entity into that draft. The composer must not inject
attachment tokens into the textarea body, and the final send payload must
collapse draft refs back to minimal `{ type, id, label }` records instead of
posting hydrated entity snapshots. The type picker should localize generated
entity type ids for users instead of exposing raw backend strings. Attachment-
only messages are valid and must stay sendable when the draft has at least one
selected entity ref or a recorded voice attachment. The conversation snapshot
is auth-gated by the store so direct user candidates are not lost behind a
failed pre-auth request.
The expanded `/chats` route keeps the persisted-conversation inbox visible as
a desktop side rail while the selected conversation occupies the remaining
width. It uses a single-pane interaction on mobile, and the app-shell floating
launcher is hidden while that route is open. The route opts into full-page mode
with explicit boolean props; the full-page grid has one bounded workspace row,
separate inbox/thread headers, cover-cropped participant avatars, and accepts
attachment-only sends when the draft contains structured entity references.
The chats surface also lives as a home-workspace tab: the drawer's expand
action opens a workspace chats tab pinned to the active conversation
(`utils/chat-workspace-open.js` event + pending pattern, mirroring entity
and call tab opens) instead of a separate route; an unpinned expand opens
the general chats tab. The chat popup is one PrimeVue `Dialog` for every
viewport (`layouts/app.vue`): non-modal (desktop keeps working under the
chat), a bounded card everywhere — `support-chat` token size on a
dedicated height wrapper (never merged onto ChatSupport's own `h-full`
root; competing height utilities resolve by CSS order and once produced
a content-growing dialog), capped to `calc(100dvh - 6rem)` so the soft
keyboard can never cover the composer. Surface pinned to the `content`
background token, Dialog header hidden, and the embedded `ChatSupport`
column renders the inbox/thread headers with back and close. ChatSupport
itself carries no overlay chrome — position and stacking belong to its
hosts (popup Dialog, `/chats` route, entity detail panel, call
workspace). The viewport meta carries
`interactive-widget=resizes-content` so the keyboard cap reacts live.
Entity-linked chats ride the same surfaces: the inbox is one unified
timestamp-ordered list across person, group, and entity chats — the avatar
glyph (person image/letter, group icon, entity type icon) carries the kind,
and all placeholders stay neutral (subtle surface, muted ink) instead of
primary. The grouping switch narrows entity chats to their top-level nodes
(entities with no resolvable lineage ancestors) and back to every entity
chat. Child-entity threads (cassettes, nesting runs, sheet designs) resolve
server-side through the support service's scoped list resolution when
direct registry reads deny them. Entity thread titles are the open-entity
link (a home-workspace tab on desktop, detail route on mobile); beside the
title sits the children-messages toggle — default off (the entity's own
messages), pressed/primary = the composed subtree view. The inbox carries a
"Detailed" grouping toggle
for entity chats (top-level nodes off, every entity chat on), and group thread headers carry their member profiles
inline through `InstanceInlineRef`. Calls start from every non-support thread
header, entity threads included. On desktop, entity opens from chat
surfaces and standalone lists route through
`utils/instance-workspace-open.js` — a live pane-tab open when the home
workspace is mounted, a pending request consumed on mount otherwise — so
everything stays inside the home framework. Entity threads show a children toggle that switches between the
composed subtree view and messages linked to the entity itself, and the
composer of a composed view carries a lineage drill-down strip following the
dynamic-breadcrumbs pattern: ONE strip whose drilled lineage leads as
icon-only pills (no text; tapping one jumps back to that level), an angle
marks the descent, and the siblings of the current level follow as chips.
ALL children of the current target load through the containment sources the
sidebar uses; picking a child drills the strip into its own children (and
the next message lands there). The composed entity itself is the target
whenever no child is drilled, and exactly one target is always visibly
selected — the root pill, the deepest lineage pill, or a drilled leaf chip. Replies quote their parent message above the bubble (sender
name plus snippet or voice marker, without a leading border) and jump to the quoted message when
loaded, loading earlier pages while staying scroll-anchored otherwise; they
open through the desktop hover message menu (PrimeVue Menu with reply and
copy actions, vertically aligned with the bubble's center beside its outer
edge) and direction-aware swipe-to-reply on mobile: own (right-aligned)
messages swipe left and opponent messages right, the row follows the
finger, and a reply icon fades in inside the vacated gap until the release
past the threshold commits the reply. The composer shows a cancelable
reply bar that renders like the in-bubble quote (sender plus snippet), not
an alert-style PrimeVue Message. The composer input is a PrimeVue InputGroup — attach
and voice sit in addons around the textarea while send is the trailing
primary button (a direct InputGroup child, not an addon). Abstract generated
detail pages expose the same composed conversation as the detail page's
**sidebar rail** through [`InstanceChatPanel`](./shared/README.md) — the one
in-page thread surface; bounded hosts cannot (their `flush` frame is `h-full`
and non-scrolling, so a rail has no track) and therefore carry a chat entry
that opens the shared popup instead. Every entity
surface carries a chat entry — the shared `InstanceCard` renders it for all
card variants (footer row and expansion popover), and `InstanceInlineRef`
popovers carry it too, all opening the entity thread through
`utils/instance-chat.js` (the single PrimeVue Dialog popup — consumed on chat
mount). The
detail rail rides `GeneratedInstanceDetail` — the canonical detail chrome —
in its abstract branch, through `InstancePage`'s sidebar slot; the bounded
branch mounts no rail and its host (`GeneratedInstanceFile`) supplies the popup
entry from the pane action strip.
- For entity-specific data fields (tool dimensions, pen stroke, warehouse address), use `<DataBlock type-id="..." :entity="..." :fields="[...]" />` with the field array defined inline in the component's `<script setup>`. The `type-id` must match an entry in `@perigram/facade` field access policy; otherwise the row is hidden.
- PrimeVue `<Select>` options that use `optionLabel="name"` must receive
  option arrays normalized through `utils/selectOptions.js` when the source data
  is a canonical DTO. Do not pass raw entities that only expose
  `identity.name`; PrimeVue expects the resolved label to be a string.

## Localization

Artifact-template management lives at `pages/assets/templates.vue` and uses the
`ArtifactTemplateCard` entity surface. `ArtifactLayoutEditor` edits normalized
template and generated-artifact items and emits data only; owning surfaces call
the canonical revision-backed APIs. Template and artifact deletion uses
`GeneratedDeleteButton` on these static management surfaces, so visibility
follows the domain delete contract and ordinary entity permission grants. This
component is not used by generated process surfaces, whose deletion contract is
the compiled manual action described above.

- User-visible labels, headings, dialog headers, toast summaries/details, placeholders, and accessible labels must use `$t(...)` in templates or `t(...)` from `useI18n()` in script.
- Keep `i18n/locales/en.json` and `i18n/locales/ru.json` structurally aligned whenever adding keys.
- Run `npx vitest run shared/localization.spec.js` after adding frontend copy or translation keys; it catches locale key drift and missing static translation keys.
- Brand names such as `Perigram` remain literal and are not localized.

## Sizing

PrimeVue Button, Tag, Badge do not inherit font-size from containers. Always add `size="small"` to these elements inside compact and inline variant contexts.

## Related
- [components/entities/README.md](./entities/README.md) — manifest-backed entity card contracts
- [components/shared/README.md](./shared/README.md) — shared block components, layout containers
- [components/ui-mapping/README.md](./ui-mapping/README.md) — resolver-driven field/surface/screen materializations for the CTS UI mapping contract
- [composables/README.md](../composables/README.md) — useEntity, useBlocks
- [server/DATA_MODEL.md](../server/DATA_MODEL.md) — entity data shapes
