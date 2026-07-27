# COMPONENT: Components

This directory contains Vue components used in the Cutkit-Demo application.

## Style Guide
- **PrimeVue:** All components MUST use PrimeVue for UI elements (buttons, inputs, tables, dialogs).
- **Zero Styling Policy:** Components MUST avoid manual styling (colors, text sizes, backgrounds, etc.). Rely on PrimeVue theme presets and `assets/tokens/` projections. No custom CSS except for layout purposes.
- **Layout:** Use Tailwind CSS utility classes for layout (flex, grid, spacing, alignment).
- **Minimal Text Chrome:** Do not add page/panel headers, descriptions,
  helper bubbles, notes, tips, or empty-state prose unless the user workflow is
  otherwise ambiguous or blocked. Controls, placement, icons, and typed data
  labels should carry the interface before explanatory copy is added.
- **Standard Components:** Create reusable components for common UI patterns (cards, modals, forms, tables) and use them consistently across the app. See [components/shared/README.md](./shared/README.md) for the full list.
- **Use Variants:** Components should support different visual variants (`inline`, `compact`, `card`) to ensure flexibility in different contexts.
- **Localization:** User-facing static template copy and visible component
  props must use i18n keys. `shared/localization.spec.js` parses active Vue
  templates and fails on hardcoded labels/placeholders/messages, while allowing
  real data units and code/file literals.
- **Child Components:** When a component needs to display full child entities,
  use the child entity's dedicated card component. When it only needs compact
  relation context inside another card/detail row, use `EntityInlineRef`
  instead of nesting full card popovers.
- **Smart Components:** Sub-components should use explicit permission grants to conditionally render actions (edit, delete, view).
- **Permission Editing:** `PermissionEditor.vue` edits the same grant shape used
  by `shared/access-control.js`: each feature has one or more explicit grants
  with level, action overrides, lineage/entity trait filters, transition
  filters, logical rule conditions, and advanced JSON for the selected grant.
  The main editing surface is a unified filter builder: grants render as
  accordions in the selected access area, and the grant level is edited inline
  as `Allow <level> when <predicate>` above the filter expression. Each
  predicate selects a subject (the selected feature entity when it exists,
  related entity, transition, or custom path), then an entity type when the
  subject is related, then a trait, an operator, and a value. Entity traits must
  come from the real domain contracts: exact `id`, workflow `status` from
  `cncWorkflows`, and property paths from `cncEntityFieldGroups` /
  `cncEntityFieldAccess`. Do not expose storage terms like
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
| Identity display (default: name/slug) | `<IdentityBlock :entity="..." variant="..." />` |
| Status display + transitions/actions | `<EntityStatus :entity="..." entity-type="..." :actions="..." />` |
| Read-only status display | `<StatusBadge :entity="..." />` |
| Current lifecycle location | `status.lifecycle.data.location` rendered by `<EntityStatus>` |
| Drawing and geometry preview | `<DrawingCanvas ... />` for layer-aware DXF/SVG/cassette canvas work; `<GeometryPreview :entity="..." />` as the entity-card wrapper |
| Structured key/value data (specs, parameters, tool dims) | `<DataBlock entity-type="..." :entity="..." :fields="ENTITY_FIELDS" />` |
| Lineage breadcrumb | `<TraceChain :entity="..." />` |
| Audit log | `<StatusHistory :entity="..." entity-type="..." />` |
| Detail page header | `<EntityPage :entity="..." entity-type="..." />` |
| CRUD + status operations | `useEntity(type, id)` |
| Card/container chrome | Entity cards: `<EntityCard>`; non-entity sections: PrimeVue `<Panel>` or semantic layout |
| Section/page action rows | `<ActionToolbar>` |
| Route-level aggregate facts | `<MetricPanel>` |
| Repeated card grids | `<ResponsiveGrid>` |
| Entity-local workspaces | `<EntityWorkspace>` |
| Three-lane production workspaces | `<WorkspaceLanes>` |
| Bounded scrolling workspace sections | `<ScrollablePanel>` |
| Loading/empty/error surfaces | `<StateBlock>` |
| Data table frame | `<TableFrame><DataTable ... /></TableFrame>` |
| Dialog container | `<StandardDialog>` |
| Single-field rename/edit | `<NameEditPopover>` |
| Typed admin settings | `<TypedSettingsForm :fields="..." v-model="..." />` |
| Entity dropdowns | `<EntitySelect>` / `<EntityMultiSelect>` with explicit `entity-type` |
| Public marketing animation | `components/marketing/CassetteMarketingAnimation.vue` |

`WorkflowDesignerV2.vue` is the shared v2 state-machine editor used by the admin
workbench and organization workflow overrides page. It normalizes flat legacy
workflows into a `regions` contract, edits the selected region's states and
transitions, and keeps lifecycle metadata, transition capabilities, access JSON,
and hooks JSON editable.
The organization process designer keeps lifecycle design inside the same Vue
Flow workspace: entity node inspectors edit inline status-machine states and
transitions, and entity nodes summarize those states directly on the canvas.
Entity lifecycle data must save as a workflow draft that compiles into a runtime
status machine. Abstract roles and user assignments are process-panel records,
not graph nodes; roles are assigned onto nodes and lifecycle transitions.
Process designer nodes live under `components/process-designer/` and must show
typed Vue Flow handles that match the process compiler contract: role access,
service input/output, and socket projection/transfer. Do not reduce these nodes
to generic cards; their surface should expose the entity/service/socket
semantics that the active process runtime consumes.
The canvas is intentionally a compact semantic overview. Palette controls are
grouped and labeled, node accent colors identify those groups, and detailed
action mutation/access/trigger controls belong to the selected-node inspector.
Canonical entity block choices come from `@cutkit/core` through the generic
`@cutkit/processes` designer contract; concrete entity, construction, workflow,
field, and attachment choices come from the supplied domain implementation.
The process designer also exposes non-effect process algebra nodes for typed
source/transform work: entity references, field reads, string operations,
comparisons, logic, and collection transforms. These nodes are semantic
`processNodes` records and must not perform mutations; persistent state changes
remain action-node responsibilities.
The designer's screens tab renders a structural preview of the compiled screen
manifest grouped by process role. That preview shows templates, regions,
sources, filters, and action buttons from normalized screen contracts without
fetching live entity data.
Generated operational screens live under `components/generated/`. They render
compiled process screen manifests through a fixed template registry and shared
entity primitives (`EntityCard`, `EntityPage`, `EntitySurfaceContent`,
`ResponsiveGrid`, `WorkspaceLanes`, and `TableFrame`). Process data may select
registered templates, sources, regions, surfaces, and action ids; it must not
select arbitrary Vue component names or inject page-local markup. App-owned
system screens appended during auth hydration use the same generated template
contract. Organization management is split into generated system screen records:
the overview template links to accessible organization sections, the account
template renders billing regions and checkout actions, and route templates
represent existing team and process-designer pages. Menus and mobile shortcuts
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
entity-specific generated branches in `GeneratedScreen` or `GeneratedEntityDetail`;
register the overload there so it receives only the sources, regions, actions,
and scope available to the current user. Project `entityDetail` screens use
this path to render an IDE-style operational workspace over the generated
project source and generated child collection sources. Its Explorer owns child
creation controls from the matching region. The center editor mounts
`GeneratedEntityDetail` for the current Explorer selection, so entity-specific
detail overloads, process actions, status, and access-gated deletion retain the
same contract as their standalone generated page. The right lane is a dedicated
lifecycle timeline. An overload must not discover extra sources or actions from
domain registries or the global action manifest. Do not replace an entity detail
with a card preview or add decorative project metrics outside its real surface.
Registered screen overloads run in the app layout's flush bounded frame: the
route body cannot scroll, and Explorer, editor, and inspector lanes own their
scrolling independently.
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
browser. Collection-level and detail-level generated actions are limited to the
action ids compiled onto the current screen or region; generated components must
not scan the whole user action manifest and inject every parent-bound action
that happens to match the row or detail entity type. Collection actions emit the
compiled action manifest item itself, not an entity placeholder, because create
actions do not have an existing entity row. Parent-bound collection actions also
emit the source and region context so the generated screen can pass the active
parent id from screen scope to the process action endpoint, or open a parent
selector when the target entity list is not already scoped to that parent.
The generated `home` template is the user's process start screen. It renders
compiler-selected top-level entity-list sources as horizontal card sections and
uses the region's compiled action ids for section-level create buttons and
entity-card action footers. Entity-card actions use the same status/entity
filters as collection screens. The home template must reuse the same entity
primitives and generated action execution path as collection screens; it must
not invent static dashboard widgets, hardcoded domain routes, or per-card
create buttons. Each home section resolves its open-list button from the
compiled region route or the matching compiled entity-list screen in the
current screen manifest; it must not construct list routes from entity names.
Home sections are true horizontal carousels: entity cards keep a stable
non-shrinking width and overflow horizontally instead of shrinking every card
to fit the viewport. The fixed width belongs on the carousel item wrapper, not
on `<EntityCard>` itself, because shared entity cards have variant root
branches and cannot be relied on to receive layout sizing through attribute
fallthrough.
Generated card bodies may replace aggregate child-count facts such as
`summary.queueCount` when those cards are rendered through
`EntitySurfaceContent`. Prefer compact `EntityInlineRef variant="compact"`
micro cards when the DTO already carries relation-backed child refs, including
`summary.*Preview` payloads such as queue runs/sheets, library cassettes, or
catalog colors. These galleries render as a bounded grid with two visible refs
and an in-grid overflow control for hidden refs, not as a nested horizontal
scroller. If no previewable child refs exist, keep the numeric count row.
Generated card footers may add an icon-only open-detail action, and generated
cassette cards also expose the access-gated `CassetteDesignerV2` action in the
footer so collection/home cards are not detail-only dead ends. Detail
navigation must still route through the compiled generated screen manifest
rather than hardcoded feature paths.
On mobile, navigation launched from temporary inline entity popovers or lineage
links closes transient overlays, including the chat drawer, before the route
changes. The floating chat launcher is icon-only; unread state belongs to the
app-shell badge, not to a wide floating button label. Opening chat dispatches
the same transient close event first, so inline entity popovers and shell menus
do not remain open behind or above the chat surface.
The app shell mobile bottom panel may expose up to two generated-screen
shortcuts selected by the user from a generated-screen picker. Those shortcuts
use compiled screen labels and authored icons when available, then fall back to
generated entity/template icons; they must not be hardcoded domain routes. The
plus action appears only until the two shortcut slots are full; full shortcut
sets are changed by long-pressing a shortcut and selecting a replacement from
the same picker. The mobile chats entry renders the chat component as an app tab
rather than the desktop overlay, while the profile entry opens the account menu
that also owns theme switching.
Generated screen titles, home section headers, generated breadcrumbs, and
generated action buttons resolve labels through `utils/generated-labels.js`.
That resolver prefers screen/region `labelKey`, then domain entity label keys,
and only humanizes ids as a last fallback. Generic process action labels must
not display English verbs such as `Create` or raw target statuses such as
`DELETED`; create actions show the localized entity name beside the plus icon,
and status-mutating update actions show a localized operation label without
exposing the state id in the button text.
Generated non-status action surfaces, including detail header buttons and card
footers, must not render status-mutating update actions. Lifecycle/status
transitions belong only in `EntityStatus`, which loads server-filtered actions
and owns the status popover/history.
Generated entity detail headers show the entity `TraceChain` instead of a
standalone repeated identity name, so the opened record keeps lineage context in
the primary header while actions/status remain in the same header row.
Entity reference popovers inside generated surfaces mirror the action affordances
available on the referenced entity's generated detail screen. They resolve
compiled detail-screen action ids through the same access/status visibility
helpers as detail headers, consume workspace-specific actions such as queue
nesting controls, and execute generated buttons through the surrounding
generated screen's process action handler instead of calling process endpoints
locally.
Entity-detail templates render child collection regions inside the `EntityPage`
body so parent-child graph flows, such as project-to-queue creation, stay in the
opened parent context.
Generated entity details may provide registered entity-specific bodies when
the domain has a real operational editor contract. Queue details mount the
queue editor workspace inside the generated detail page as an entity-local
editor: sibling queue navigation and project-route creation controls stay
hidden, the editor renders through `EntityWorkspace` instead of the route-level
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
`EntityWorkspace` rather than inventing local stacked or sidebar grids.
Sheet-design details similarly mount `SheetDesignEditor` when the active user
has a concrete `sheet_designs:write` grant. The editor mutates nesting source
items and placements, resolves OCCS layer pens through the shared layer
standards, snaps transformed cassette production-contour edges with tool-kerf
clearance, checks transformed polygon clearance before accepting a placement,
clamps complete rotated geometry inside the usable sheet polygon when one is
present, falls back to rectangular sheet bounds for virtual rectangle sheets,
supports existing/uploaded cassette designs, and persists through immutable
geometry revisions. Generated
sheet-design details keep the sheet identity visible in `EntityPage`; read-only
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
Queue composition producers are resolved from the domain producer registry and
then bound to the current user's compiled process action manifest where a
process action provides the matching construction mode. Existing cassette
designs, library cassette templates, DXF/artifact import, and additional
process actions that output `cassette_design` remain distinct source menu
items. Process-mode producer actions are accepted only when their current
compiled action contract exposes a `cassette_design` output through
`contracts.outputs`.
When a process producer is executed from a queue detail, the queue id is sent as
action context and the server appends the produced design through the queue
feature's `processUpdate()` boundary. The browser does not rely on a generic
queue PATCH grant for that process-scoped append.
Queue item rows hydrate their referenced `cassette_design` records through the
canonical detail endpoint when the collection list did not include a saved
queue item. The row header renders the cassette-design identity from that
canonical DTO when available, and otherwise renders a typed id chip without
nesting another entity card inside the queue item panel.
Cassette details expose `CassetteDesignerV2` as an access-gated entity editor
action instead of routing users to a static asset page, and generated cassette
collection/home cards mirror that same editor action in their footers when the
user has `cassettes:write` on the concrete cassette.
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
Generated cassette-design creation must be scoped to a cassette template. A
queue is linked after creation by adding the baked design id to
`queue.data.job.items[]`; generated screens must not treat a queue as the
parent/source for `bakeCassetteDesignFromTemplate`.
Generated collections may turn `identity.name` into a link only through the
screen manifest: the collection looks for an `entityDetail` screen with a
single source for the same entity type, preferring the detail screen paired
with the current screen key (`<screenKey>_detail`) only when that paired screen
exists for the same entity. Parent detail screens that include child collection
sources are not valid detail targets for those child rows. The route uses
`/screens/:screenKey` with `entityId` and `{entityType}Id` query scope. The
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
Generated collection, home, and detail surfaces also render the standard
generated delete icon when the active process grants `delete`/admin access for
the exact entity and the domain UI endpoint has a canonical single-entity route.
The delete control calls the same `useEntity(...).remove()` boundary as other
entity UI and refreshes the generated screen after success.
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
`EntityStatus` remains owned by the canonical workflow/status API and must not
receive locally synthesized process actions.
Generated action setup and execution failures must be visible in the screen:
prompt option loading errors, missing required entity options, and execution
errors all surface through `StateBlock` and PrimeVue toast feedback instead of
being converted to empty controls.

Lifecycle transitions belong in `EntityStatus` and should come from the
canonical workflow/status API or development workflow previews. Destructive,
edit, reset helper, and feature command buttons stay outside the status surface
in card footers or page action slots.
Geometry-capable entity cards should render the visual source, not tags that
state a file type or preview flag. Use `GeometryPreview` for entities with
`data.geometry.preview`/points and `CassetteThumbnail` for cassette DTOs because
it resolves DXF, stored geometry previews, OCCS definitions, and legacy
parametric definitions in the correct order. Cassette-like entities
(`cassette`, `cassette_design`, and `cassette_instance`) must use
`CassetteThumbnail` on detail surfaces as well as cards; do not route detail
previews through generic `GeometryPreview`, because baked designs commonly store
their renderable source as `data.geometry.dxfId`, `data.layerData`, or
`data.polygonParts`.
Parent-level card click handlers must ignore nested interactive targets through
`utils/interactive-target.js` so embedded statuses, links, artifacts, geometry
previews, and nested inline cards remain clickable.
Interactive status belongs only to entity types with real `cncWorkflows`
definitions. Cards for DTOs without workflows should set `:show-status="false"`
or use a read-only badge only when the data model requires it; do not invent
component-local lifecycle states.
Entity-specific card components should use `before-identity`, `subtitle`, body, and footer slots; do not override `#title`, because that bypasses standardized identity/status layout. Subtitle slots that render entity facts must be hidden for `variant === 'card'`; the full card body is the only owner of those facts.
Entity-specific cards should render a single `EntityCard :variant="variant"`.
Inline/compact/card branching inside entity cards is a smell unless the entity
has a genuinely different structural surface. The default slot is the canonical
body and is reused by `EntityCard` for both full cards and inline/compact
expansion.
Entity detail components should use `EntityPage` for trace, identity, status, and page actions instead of rebuilding header rows locally.
Single-field rename/edit actions should use `NameEditPopover` near the relevant
identity or action cluster; reserve `StandardDialog` for creation flows,
destructive confirmation, or forms with multiple fields.
## Design System Manifest

`@cutkit/domain-cnc` defines the CNC design-system contract for entity demos:
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

`assets/tokens/index.js` is the source for app-level visual tokens. Tailwind aliases, PrimeVue component overrides, and global `--ck-*` CSS variables must stay aligned with it.

Current app chrome uses `bg-page`, `bg-chrome`, `bg-subtle`, `rounded-ui`, `rounded-panel`, `shadow-card`, `shadow-card-hover`, and `shadow-overlay`. New shared wrappers should consume these aliases instead of local shadows, arbitrary backgrounds, or one-off radii.

For shell/layout chrome that must update reliably during Nuxt dev HMR, direct CSS-variable utilities such as `bg-[var(--ck-page-background)]` and `[box-shadow:var(--ck-shadow-card)]` are acceptable. This avoids depending on a Tailwind config restart for newly added aliases.
Nested active app surfaces must use semantic aliases such as `bg-content` or
`bg-subtle`, not raw palette utilities like `bg-surface-50`, so dark mode uses
the app token overrides consistently.

Use token-backed classes such as `max-w-app`, PrimeVue semantic classes, and shared layout primitives (`StandardPage`, `ResponsiveGrid`, `TableFrame`, `StateBlock`) instead of local arbitrary max-widths, colors, radii, or transition durations. Legacy global grid helpers are not used in active components; detail surfaces spell out their responsive grid tracks locally when a shared primitive is not a fit.

## UI Inventory Policy

Component cleanup uses a route/registry inventory instead of deleting files by
name. Files can be:

- **route-active** when reached from `pages/**` or `layouts/**`;
- **registry-active** when referenced by the design-system manifest,
  `utils/design-system.js`, `EntityInlineRef`, or framework inspection scripts;
- **dormant** when not currently routed but still architecturally meaningful.

Dormant components are inspected and may be refactored, but are not removed by
automated cleanup. Legacy components such as old dashboard/footer widgets must
be removed only by an explicit human cleanup decision.

The current component-by-component cleanup audit lives in
[docs/UI_COMPONENT_AUDIT.md](../docs/UI_COMPONENT_AUDIT.md). It applies the
same ten questions to entity components, shared primitives, hubs, pages, and
layouts: business job, frontend context, DTO ownership, status policy,
relationships, actions, nested click behavior, density, responsive constraints,
and the resulting refactor decision.

## Composables Rule

`useBlocks.js` composables (`useIdentity`, `useStatus`, `useSpecs`, `useLineage`) are **only** used inside the shared block components (`IdentityBlock`, `EntityStatus`, `SpecsBlock`). Entity cards and pages must never import from `useBlocks.js` — they compose the block components instead.

No exceptions are currently needed in used entity pages/cards; state-only conditionals should use a local `computed` from `entity.status?.state`.

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
- `cassette`, `cassetteTemplate`, `cassetteDesign`, and `cassetteInstance`
  are separate UI surfaces and must not be collapsed into one card contract.
- `CassetteInstanceCard` renders the produced cassette geometry from the source
  cassette design and embeds source design/template/queue context through
  compact `EntityInlineRef` rows. Queue-produced instances are already `CUT`;
  lifecycle action design remains a workflow-machine concern, not a local card
  action override.
- `CassetteDesignerV2` owns OCCS cassette-template editing. It uses
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
  `EntityInlineRef` rows, not trace-link-only rows or local status badges.
- `GeometryCaptureCard` and `GeometryCaptureDetail` render photo-derived
  `geometry_capture` drafts through `GeometryPreview`. Confirmation belongs to
  the capture review API because remnant mode creates a real `remnant`, while
  facade mode remains a draft geometry input until facade entities exist.
- `material`, `materialPile`, and `batchPile` are separate UI surfaces:
  material cards describe the base material record, material pile cards
  summarize general/manual warehouse stock, and batch pile cards show
  requisition-sourced receipt context from `lineage.requisitionId`.
- Entity relation rows use `EntityInlineRef` with design-system surface keys
  (`materialPile`, `nestingRun`, `cassetteDesign`, etc.). Do not use
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
- `QueueEditor` keeps a UI-only `_key` for queue rows because persisted
  `queue.data.job.items[]` entries intentionally store only the cassette/design
  `id`, `entityType: "cassette_design"`, nesting `type`, quantity, and
  parameters. Delete actions must use `_key`; nesting payload saves must
  persist `id` and `entityType` without leaking the UI key. Queue relation rows
  render the already-hydrated cassette-design identity or a typed id chip in
  the row header; they must not nest a full relation card/popover inside the
  queue item panel. Rows that cannot be resolved to a loaded cassette design
  are rejected before ordinary queue saves so the nesting command never
  receives an unresolvable job item.
- `QueueEditor` is a production workspace: desktop layout uses a left queue
  lane rendered newest-first as compact queue entity rows, a center lane for nesting settings and wide
  cassette entry cards, and a right runs lane through `WorkspaceLanes`. The
  project queue route is rendered inside the app shell's bounded workspace frame
  and each lane owns its own vertical scrolling, while the center lane delegates
  scrolling to its `ScrollablePanel` sections. Nesting settings are queue-local
  state persisted as `queue.data.nestingSettings`; the header owns material
  source selection (`Virtual` plus warehouse options), tool selection, and the
  run action. Virtual mode renders the virtual sheet dimensions as the active
  material abstraction; warehouse mode adds a selected source immediately from
  the source dropdown and renders selected material sources as compact
  `QueueSourceCard` preview tiles in a horizontally scrolled row. Queue
  settings keep `Run nesting` as the only primary action; section utility,
  add, upload, and view controls use compact secondary buttons. Queue
  status/actions, including destructive queue removal, live on the selected
  queue card;
  the cassette panel header owns view switching and add/upload actions. The
  runs lane receives queue-level sheet designs once, selects one active run, and lets
  `NestingRunCard` filter designs by run before rendering preview tiles. Run
  material sources render on `NestingRunCard` through entity references; queue
  cards summarize queue work, not available stock.
- In warehouse material mode, `QueueEditor` loads selected warehouse piles,
  sheets, and remnants, filters unavailable piles, blocks mixed sheet sizes for
  the current one-bin nesting worker, and persists selected stock as
  `queue.data.job.materialPool` with dimensions, available counts, and remnant
  `sheetPolygon`/`geometryData` when present. Selected warehouse sources render
  remnant geometry when present and rectangular stock dimensions otherwise. For remnants, `sheetPolygon`
  preserves both `outer` and `inner` rings so holes remain fixed non-placeable
  zones in the nesting bin. The backend resolves worker sheet size/count and
  irregular remnant sheet polygon from that material pool.
  Starting nesting first saves the queue; the nesting API then derives command
  parameters from saved `queue.data.nestingSettings` and
  `queue.data.job.materialPool`. If queue saving fails, nesting must not start
  with stale material context. Choosing a
  completed run is the production acceptance action: the backend consumes
  selected pile stock, records `queue.data.materialConsumption`, creates
  physical outputs, transitions the queue to `READY`, and returns the updated
  queue. Solver completion alone leaves the queue in `NESTING` so the operator
  still has to choose the accepted run. Those outputs are cassette instances
  plus remnant geometry; already cut source sheets are not displayed as
  warehouse sheet inventory.
- `CassetteDesignerV2` is the persisted cassette-template designer used by the
  production app cassette surface. The admin workbench no longer exposes it as a
  separate section; the legacy non-persisted `CassetteDesigner` remains only for
  dev/test fixture surfaces that still need its local-save graph format.
- `CassetteDesignerV2` edits the cassette template name, loads existing
  templates from parent-provided options, receives `persistedTemplateIds` from
  the parent to distinguish DB templates from generated fixture templates,
  persists saves through the configured save handler by default, and emits a
  save payload with the saved cassette DTO plus the OCCS v2 definition and
  `extensions.cutkit.graphTree` so the parent can mirror and reload the exact
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
  root uses a fixed viewport-height work area with
  internal side-panel/canvas overflow instead of growing below the window.
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
  mapped to `cut.outer`, and emits the created template to normal upload
  listeners while the queue upload workflow consumes the returned initial
  `cassette_design` so the queued card has baked polygon geometry.
- For standard CRUD and status operations, use `useEntity` — no direct `$fetch` calls.
- Direct `$fetch` is reserved for custom workflows that are not represented by `useEntity`: declared domain operations, uploads/downloads, invitations, permissions, support chat, organization billing, debug endpoints, and project-scoped subresources.
Support chat uses direct `$fetch`/SSE routes and the shared
`SupportMessageContent` renderer. Messages may target the support channel or a
specific user selected from status history actor rows, and inline entity
references must render through `EntityInlineRef` rather than local chips. The
floating Chats drawer opens to an inbox backed by `/api/support/conversations`;
that inbox includes readable users even before a first direct message exists and
offers a header user picker for same-organization users not currently visible
as conversation rows. Drawer rows show participant context and render latest
message entity tokens through `SupportMessageContent`, without per-row
message-count badges. The composer loads attachment types from
`/api/support/entity-types`, which derives them from the user's generated
screen source manifest at read access rather than a fixed chat list. Concrete
attachment choices resolve through `/api/support/entity-options` when the
backend has a scoped list service for that entity type, and direct chats also
receive recipient-access metadata so the draft can warn when an attached entity
will be visible only inside chat. Selected attachments stay in structured
`entityRefs` and render as removable draft chips before send; any text preview
must not duplicate ordinary textarea text. Status-history actor chat actions
preseed the current entity into that draft. The composer must not inject
attachment tokens into the textarea body, and the final send payload must
collapse draft refs back to minimal `{ type, id, label }` records instead of
posting hydrated entity snapshots. The type selector should localize generated
entity type ids for users instead of exposing raw backend strings. Attachment-
only messages are valid and must stay sendable when the draft has at least one
selected entity ref. The conversation snapshot is auth-
gated by the store so direct user candidates are not lost behind a failed
pre-auth request.
- For entity-specific data fields (tool dimensions, pen stroke, warehouse address), use `<DataBlock entity-type="..." :entity="..." :fields="[...]" />` with the field array defined inline in the component's `<script setup>`. The `entity-type` must match an entry in `@cutkit/domain-cnc` field access policy; otherwise the row is hidden.
- PrimeVue `<Select>` options that use `optionLabel="name"` must receive
  option arrays normalized through `utils/selectOptions.js` when the source data
  is a canonical DTO. Do not pass raw entities that only expose
  `identity.name`; PrimeVue expects the resolved label to be a string.

## Localization

Artifact-template management lives at `pages/assets/templates.vue` and uses the
`ArtifactTemplateCard` entity surface. `ArtifactLayoutEditor` edits normalized
template and generated-artifact items and emits data only; owning surfaces call
the canonical revision-backed APIs. Template and artifact deletion uses
`GeneratedDeleteButton`, so visibility follows entity capability plus active
process access rather than local role checks.

- User-visible labels, headings, dialog headers, toast summaries/details, placeholders, and accessible labels must use `$t(...)` in templates or `t(...)` from `useI18n()` in script.
- Keep `i18n/locales/en.json` and `i18n/locales/ru.json` structurally aligned whenever adding keys.
- Run `npx vitest run shared/localization.spec.js` after adding frontend copy or translation keys; it catches locale key drift and missing static translation keys.
- Brand names such as `CutKit` remain literal and are not localized.

## Sizing

PrimeVue Button, Tag, Badge do not inherit font-size from containers. Always add `size="small"` to these elements inside compact and inline variant contexts.

## Related
- [components/marketing/README.md](./marketing/README.md) — public and admin-preview marketing visuals
- [components/hubs/README.md](./hubs/README.md) — workflow-level pages that compose entity cards and shared primitives
- [components/entities/README.md](./entities/README.md) — manifest-backed entity card contracts
- [components/shared/README.md](./shared/README.md) — shared block components, layout containers
- [composables/README.md](../composables/README.md) — useEntity, useBlocks
- [server/DATA_MODEL.md](../server/DATA_MODEL.md) — entity data shapes
