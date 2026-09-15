# COMPONENT: Generated Screens

Generated components render user-specific process screen manifests. They do not
load arbitrary Vue component names from process data; the manifest selects fixed
screen templates, sources, regions, surfaces, and action ids, and the app
renderer maps those contracts to registered Vue surfaces.

Relation Link dialogs load their options through the active action contract.
When the relation is fed by a process Create Entity effect, the dialog offers a
compact `Create new` path using that embedded constructor and links the returned
entity in the same submission. Both existing target choices and constructor
source choices are scoped by the opened owner, compiled process Lineage
bindings, declared relations, and derivation provenance; the component never
substitutes a global entity list for that scoped contract.

## Manual Prompt Forms

`GeneratedScreen.vue` maps each prompted action field to a shared typed
control keyed purely off the field type: `entity`/`entityList` use the shared
entity pickers, `enum` uses a Select over the declared options, `boolean` uses
a ToggleSwitch, `date`/`dateTime` use a DatePicker (time selection only for
`dateTime`), `number`/text use InputText, and `object`/`json` use
`GeneratedObjectInput.vue`. Boolean and date prompt values are tri-state: an
untouched field stays `null` and is omitted from the submission payload
instead of being coerced to `false` or the current time; once touched, the
control submits a real boolean or an ISO string (`YYYY-MM-DD` for `date`,
full ISO for `dateTime`).

The pure `action-inputs.js` contract combines compiled `inputPolicy.fields`
with normalized construction inputs, removes duplicate field ids, selects
required/prompted controls, and builds the nested submission payload. This is
the shared executable boundary for generic block-composed Create forms, typed
entity-reference constructors, cassette parameters, and upload-backed artifact
creators; focused specs exercise it without mounting the entire screen.

`GeneratedObjectInput.vue` is the generic structured editor for `object`/`json`
prompt fields. When the field carries a JSON schema with declared
`properties` that cover every key of the current value, it renders one typed
row per property (InputText for string/number, yes/no Select for boolean,
Select for `enum`; nested object/array values edit as single-line JSON text
and are parsed back on emit). Otherwise it renders add/removable key/value
rows, coercing each value through `JSON.parse` with a plain-string fallback.
Empty or missing keys and empty values are omitted from the emitted object.
The raw JSON textarea remains only as a fallback for values that do not fit
the structured model (non-object values or unparseable JSON strings). The
editor derives everything from the field type and schema; domain-specific
editors (for example cassette parameters or artifact template values) stay in
`GeneratedScreen.vue` and must not be folded into it.

## Action Results

After a successful action post, `GeneratedScreen.applyActionResult` patches the
affected source states synchronously through the source-patch path owned by
`useGeneratedScreen` (see
[composables/README.md](../../composables/README.md)): relation mutations apply
`result.owner` and `result.created` to their respective entity types, other
results apply `result.entity` (or the bare result), and `runCommand` actions
apply every `entities` output. A created entity enters a list source only when
it satisfies that source's resolved filters, so a successful procedural action
is visible without a page reload; the shared entity sync event remains the
backstop for changes made outside this screen. Successful `createEntity`
actions additionally navigate to the created entity's detail route. A mapped
mutation response is either a bare shape-preserving data tree (zero failures)
or a failure-carrying `{ result, failures, completedMutations }` envelope;
every completed item is applied to matching source state, while failed slots
hold their MutationFailure record and remain described by the response's
`failures` list. Navigation occurs only when a mapped create has one completed
entity, because a collection result has no single detail destination.

## Overload Registry

`overloads.js` owns app default overloads for generated surfaces. Overloads are
selected after `stores/auth.js` composes the current user's effective screen
manifest and after `useGeneratedScreen()` normalizes and loads only sources the
user can read. This keeps overload behavior user-scoped: an app overload may
change how a project or queue screen is presented, but it only receives the
screen, source states, actions, and child regions already present in that
user's compiled manifest. Layout callers may pass `null` while the current
route has no generated screen; the resolver treats non-object inputs as no
overload instead of dereferencing a partial screen contract.

Use the registry instead of adding entity checks directly inside
`GeneratedScreen.vue`, `GeneratedEntityDetail.vue`, or generated collections.
The current default overloads are:

- `home` screens render `GeneratedHomeWorkspace.vue`, the Discord-style
  operational shell described below.
- project `entityDetail` screens render `GeneratedProjectWorkspace.vue`, an
  IDE-style project workspace over the generated project source and child
  sources.
- queue detail bodies render `GeneratedQueueDetail.vue`.
- sheet-design detail bodies render `SheetDesignEditor.vue`.

## Home Workspace

`GeneratedHomeWorkspace.vue` renders the generated `home` template as a
Discord-style operational shell:

- Desktop (`md` and up) is a fixed two-column bounded workspace: a sidebar and
  the recursive pane area. Mobile keeps the previous stacked home sections
  (`GeneratedHomeScreen.vue`) inside a self-scrolling container, so the mobile
  contract is unchanged.
- The sidebar owns navigation for the whole shell. Below the brand header, a
  pinned communication nav renders the shared `CommunicationMenu.vue`
  (components/shared): Chats and Calls as proper PrimeVue `TieredMenu`
  items instead of hand-written rows.
  Chats open as the registered entity-less `chats` workspace page (see
  `workspace-pages.js`): a tab in the main pane area rendering `ChatSupport`
  full-page with its built-in inbox rail — chats are not a floating surface
  on this route and the desktop floating launcher is hidden; the Chats menu
  item carries the unread badge. The full-page chat splits into inbox rail
  plus thread through a container query on its host wrapper at 44rem; the
  row direction lives on the inner `.chat-page` node because a container
  query cannot restyle its own container element. The Calls submenu lists direct/group
  conversations from the chats store (choosing one rings the room through
  `/api/livekit/invite`) and, below a separator, currently joinable rooms
  from `/api/livekit/active-rooms` with participant-count badges, labeled
  from the chats store and organization data, kept live by refetching on
  `call.activity` events arriving on the caller's `user:`/`org:` topics.
  Every call opens as
  an ephemeral `call` workspace tab (`CallWorkspacePage.vue` — stage plus
  the conversation chat rail) in the active pane, never a floating dialog;
  the tab disappears when its `CallPanel` reports the call closed and is
  never persisted with the pane layout. Active rooms reach the sidebar
  Calls menu live through the LiveKit webhook fanout into `call.activity`
  events (see
  [server/features/livekit/README.md](../../server/features/livekit/README.md));
  `livekit.dev.yaml` points the webhook at the compose-internal app
  endpoint. `CallPanel` stays usable in small
  panes: tiles keep a small minimum height, the speaker stage scrolls
  instead of overflowing, and the wide side-strip/two-column arrangements
  apply only from the panel's own 40rem container width. Entity-less page definitions marked
  `ephemeral: true` are runtime-parameterized like this and never appear in
  add-tab lists.
- Entity navigation is a PrimeVue `Tree` explorer at Aura defaults in a
  self-scrolling wrapper. Home entity-list sections render as non-selectable
  folder nodes (entity-type icon and `generatedRegionLabel` label owned by
  the tree itself) and section folders expand/collapse. The tree
  passthroughs are layout-only: nested rows indent inside the row content so
  hover/selection keep the full row width, and the node label owns the
  remaining width so trailing row controls align to the row end.
- Entity rows are inline entity entries through the shared component:
  `EntityInlineRef variant="inline"` with `interactive: false` (non-expanding
  inline card, no detail popup), followed by the icon-variant `EntityStatus`
  and the separate ellipsis control at the end of the row. The tree owns
  selection. Entity nodes carry no tree-level icon — the inline chip owns the
  entity icon, and a tree icon would duplicate it.
- Generated mutation buttons follow the hierarchy and live behind one
  ellipsis menu per row: section folders expose the region's compiled create
  actions, and each entity row resolves the create actions of its entity
  type's compiled detail-screen child collection regions
  (`generatedDetailScreenForEntityType`) with the row entity bound as the
  opened parent through `mergeCollectionActionContext`, plus the compiled
  relation Link actions of the detail screen's main region, which execute
  against the row entity itself. The ellipsis opens a
  popover of menu-item `GeneratedActionButton`s and only renders when the
  row has actions. Nothing is hardcoded per entity type; a row without
  compiled mutations shows no ellipsis.
- The explorer shows the full hierarchy like the project page: entities nest
  beneath a loaded ancestor through the effective containment graph and
  canonical `lineage.*Id` references, and declared relation links participate
  beside containment — expanding a row resolves its relation refs
  (`resolveEntityRelationRefs` over the canonical DTO, fetching the full
  record when the list DTO omits relations) and nests the referenced
  entities under the row. Section roots never nest. Entity nodes whose type
  declares containment children or carries relation refs are expandable;
  expanding lazily loads children through the compiled detail-screen list
  sources (`linkedExplorerChildSources`) scoped to the parent's lineage and
  merges them into the workspace item pool. Entities opened through nested
  pane navigation nest the same way.
- Selecting an explorer row opens or selects that entity as a tab in the
  active pane; the active pane's selected key drives the tree selection. The
  desktop sidebar does not link out to hub entity-list screens; the full
  hierarchy is navigable in place.
- The sidebar footer mounts the shared `UserAccountMenu`, so on this route the
  desktop top navbar is hidden and its user controls live in the sidebar
  (`layouts/app.vue` resolves this from the active screen template).
- The pane area is the same recursive `WorkspaceSplitNode` tree used by the
  project workspace: IDE-style file tabs, wheel-scrollable tab strips, split
  right/down, pane-local close, registered workspace pages (for example the
  cassette designer), and `GeneratedEntityFile` bodies that scope each
  entity's own compiled detail screen. There is no Explorer header or project
  action strip; collection creation belongs to sidebar sections and entity
  operations belong to the opened file tabs.
- Tab and pane state persists as versioned browser UI state scoped to the
  current user and organization (`utils/home-workspace-state.js`). It stores
  the pane tree, tab selections, opened entity references, and opened page
  references using the same normalization contract as the project workspace,
  minus explorer fields. Entities opened through nested detail navigation are
  hydrated through the entity store like project workspace files; lazily
  fetched explorer children stay session-local.

## Project Workspace

`GeneratedProjectWorkspace.vue` renders project `entityDetail` screens as a
bounded IDE-style Explorer and file workspace:

- the Explorer is a dense PrimeVue tree containing the opened project, child
  collections loaded by the project screen, and direct child collections
  declared by a linked entity's own compiled detail screen. Linked children are
  fetched through that source's resolved filters (for example,
  `cassette?libraryId=<linked-library-id>`), never from a bounded summary
  preview. It is independently
  scrollable, starts directly below the workspace action strip without a local
  header, occupies the compact 15% side of the workspace split, and can collapse
  so file panes use the full workspace width. Its visibility is controlled from
  the left edge of the fixed workspace action strip. Collapse hides the mounted
  Explorer panel and its gutter instead of removing it from the PrimeVue
  Splitter, so reopening restores the 15/85 proportions rather than rebalancing
  to equal halves. It does not rebuild or change the recursive pane tree. Nested
  workspace chrome does not use the signal-orange action boundary. Explorer
  rows are width-contained and truncate identity text instead of creating
  horizontal scrolling. Below the narrow Explorer breakpoint, semantic nesting
  remains intact while additional visual indentation is removed so deep trees
  do not consume the row's usable width. Collection headings do not append
  decorative child counts. Every loaded list region retains its entity-type
  folder (for example, Queues); containment nests the region's root entities
  inside that folder instead of promoting them directly beneath the project.
- `GeneratedProjectActionPalette` renders directly in that top strip, outside
  both Explorer and pane content. It contains only action ids compiled onto the
  project screen/main region plus direct-project child creates from loaded child
  regions, resolves those ids through the effective user action manifest, and
  checks current project lifecycle applicability. It does not scan the global
  manifest or invent relation/upload controls. Multiple compiled ids that map
  to the same entity/parent create operation render as one visible button,
  matching the generated create-button label contract.
- `GeneratedWorkspacePane` accepts both entity pages and registered workspace
  pages. Each recursive pane owns an IDE-style tab list; Explorer navigation
  opens or selects a tab in the active pane, and tab order plus selection persist
  with that pane. `GeneratedEntityFile` is the pane adapter: each entity tab
  owns its DTO-backed icon-only interactive lifecycle status and close affordance;
  tabs without a persisted status state do not synthesize an `UNKNOWN` badge. The tab
  strip's add control opens a new empty tab (IDE-like) instead of a content
  picker; the empty tab renders the pane's open-content prompt, and the first
  real item opened into that pane replaces it. Tab keys that no longer resolve
  to a workspace item (for example a restored stale call room) render as empty
  tabs. Pane-level split and close commands live in
  one ellipsis menu. The add button follows the last tab instead of consuming
  the far edge of the header, inside the strip's border run. File bodies of
  bounded operational overloads (the cassette/facade/queue/sheet-design
  editors) render flush: when the entity type has a detail overload and the
  detail screen declares no child regions, the body fills the pane boundary
  without the scrolling EntityPage chrome, so the editor owns the whole file.
  Generated entity-action buttons render inside the active
  tab body below the strip only when the operational detail overload does not
  own its action surface. Cassette, queue, and sheet-design editors own that
  surface completely, including deletion. The body mounts the canonical
  `GeneratedEntityDetail`/`EntityPage` content for that entity with duplicate
  identity, lineage, status, actions, and divider chrome suppressed. Detail
  overload bodies therefore behave identically in a
  project pane and on a regular generated entity route. The adapter also scopes
  the selected entity type's compiled `entityDetail` screen with the selected
  entity id and loads its readable sources through `useGeneratedScreen()`.
  Child regions are nested under the entity page exactly as they are on the
  regular generated route. Their entity links and entity-bound workspace actions
  propagate back through the pane adapter: selecting a nested entity replaces
  the active pane, while editing a nested cassette opens the registered designer
  page in that pane. Project screen source data is not a substitute for the
  selected entity's own detail-screen contract.
- `GeneratedWorkspacePage` resolves a page id through the fixed app-owned
  `workspace-pages.js` registry. Process data never selects a Vue component,
  and workspace-level actions are not represented as a registered page or
  Explorer item.
- The built-in `cassette-designer` page opens from a workspace cassette file's
  access-gated designer action. It receives only cassette templates already
  available among the workspace's source-loaded or explicitly linked entities
  and mounts `CassetteDesignerV2` through the shared designer surface so the
  designer owns the pane rather than a dialog. Linked entities and source-loaded children use the same
  page-opening lookup; relation navigation does not reduce their capabilities.
  Additional app-owned pages register through the same fixed registry; pages
  without an entity binding (for example `chats`) are always-openable tabs in
  the home workspace.
- PrimeVue splitters form a recursive split tree. A pane can split right or
  down, and nested horizontal/vertical splits keep independent selections and
  scrolling. Split proportions, Explorer width/visibility, active pane,
  tab lists/selections, and opened registered pages are persisted as versioned browser UI
  state scoped to the current user, organization, and project. Stored data
  contains stable entity/page references, including entities discovered through
  nested detail regions, never entity DTOs, and is validated
  before restoration. A reference remains in its pane while asynchronous screen
  sources and linked entities load; temporary absence must not erase restored
  navigation state. There is no reserved right inspector pane.
  The active pane uses the neutral chrome-subtle surface on its pane header; tab
  selection remains the stronger indicator of the active file. Empty panes keep
  the normal tab strip and an open-content prompt instead of a blank body. File
  tabs scroll horizontally by wheel or touchpad when they overflow, without
  exposing a browser scrollbar beneath the strip.

Selectable rows still come from access-filtered screen source states; the
Explorer contains no workspace actions or unrelated controls. Clicking an
Explorer entity or registered page replaces the active pane selection;
the initial pane and each newly split pane remain empty until the user selects
content for that pane. Empty leaves still render the normal blank pane header
with pane-local split/close controls, rather than disappearing into undifferentiated
workspace space. Subsequent navigation is pane-local. Opened entity-bound pages
remain nested beneath their source entity in the Explorer.

Generated list regions render one collection toolbar above their table or card
surface. Search operates on entity identity and lifecycle state, the filter is
derived from lifecycle states actually present in the loaded source, and sort
offers stable identity/date orders. Region-compiled collection actions share
that toolbar; the renderer does not discover or synthesize additional actions.
Collection cards omit child-count and child-preview summary fields because the
collection itself is the authoritative child surface. An entity detail with one
or more compiled child regions applies the same suppression to its parent body,
so a library does not repeat cassette totals/previews above its cassette region;
unrelated operational fields such as material and description remain visible.
For a standalone generated detail route, `GeneratedScreen` compares route ids
with the open entity through exact compiled Lineage bindings and forwards only
matching ancestors as trace exclusions. This prevents the app breadcrumb and
entity trace from repeating the same ancestor without treating arbitrary route
parameters or `*Id` fields as hierarchy.
When a child file opens, its actions come from that entity type's compiled
detail screen in the current user's effective screen manifest. Parent-workspace
region actions are merged only when they also apply to the selected entity.
This lets an embedded queue consume queue-detail commands and cassette-design
producer actions without granting or discovering actions outside the user's
compiled process access. `GeneratedEntityDetailBody` passes only that scoped
action set into operational overloads. Child-region action ids travel through
the separate `bodyActions` channel: QueueEditor receives its compiled producer
operations while surrounding headers continue to exclude them. Those ids are
already compiler-scoped and access-filtered, so the body resolves them directly
from the user's action manifest instead of incorrectly comparing the producer's
output entity type to the open queue. The body never scans the global action
manifest for additional queue producers.
In a project pane, the screen-wide action list is only an aggregate used to
resolve the file's available contracts. `GeneratedEntityFile` subtracts every
child-region action from the tab action row; each child action renders only in
the region that owns it. The tab header must never duplicate a child collection
action such as adding a cassette to an opened library.

Registered screen overloads select the bounded workspace mode on
`GeneratedScreen`/`StandardPage`, and the authenticated app layout resolves the
same overload from the user's active screen manifest. The resulting frame is
flush to the app boundary and body scrolling is disabled. Explorer, editor, and
file panes own their scrolling independently.

`GeneratedActionButton` and `GeneratedCassetteDesignerAction` render in the
active project tab body. Generated hard deletion is a manual compiled
`deleteEntity` action rendered through `GeneratedActionButton`; `GeneratedScreen`
owns its confirmation and process-action execution. `GeneratedDeleteButton` is
reserved for static management surfaces and must not be added to generated
process screens.
Regular entity pages and cards may use their menu-item presentation inside
entity ellipsis menus; presentation does not change action resolution or access.
Generated relation-link actions render with a link icon and the target entity
label only (no verb), so the button does not repeat an "add" word; their label
and icon come from the shared `generatedActionLabel`/`GeneratedActionButton`
contract.
Operational editors may consume commands and construction producers they
implement, but generated relation mutations always remain on this generic action
surface. Their target entity, scoped choices, optional creator, execution, and
refresh behavior come from the compiled relation-action contract; editors must
not match entity types or relation keys locally.
Generated action placement is concern-based and has one owner: create actions
belong to collection/region surfaces, relation mutations to relation-aware
entity surfaces, and entity operations to the opened entity surface. Generated
deletion is owned by the compiled action placement for the entity; it is never
synthesized from domain operations or permission grants.

The Project Explorer projects declared containment within compiled collection
folders. Parent entities remain selectable files and become expandable when
currently available child entities reference them through a declared lineage
key. Ordinary project links stay in the Linked entities section; descendants
may nest beneath those linked parents when containment declares the relationship.
No entity type, relation key, or lineage field is inferred from naming.
