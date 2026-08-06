# COMPONENT: Generated Screens

Generated components render user-specific process screen manifests. They do not
load arbitrary Vue component names from process data; the manifest selects fixed
screen templates, sources, regions, surfaces, and action ids, and the app
renderer maps those contracts to registered Vue surfaces.

Relation Link dialogs load their options through the active action contract.
When the relation is fed by a process Create Entity effect, the dialog offers a
compact `Create new` path using that embedded constructor and links the returned
entity in the same submission. Both existing target choices and constructor
source choices are scoped by the opened owner, process-authored ancestor
relations, domain containment, and derivation provenance; the component never
substitutes a global entity list for that scoped contract.

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

- project `entityDetail` screens render `GeneratedProjectWorkspace.vue`, an
  IDE-style project workspace over the generated project source and child
  sources.
- queue detail bodies render `GeneratedQueueDetail.vue`.
- sheet-design detail bodies render `SheetDesignEditor.vue`.

## Project Workspace

`GeneratedProjectWorkspace.vue` renders project `entityDetail` screens as a
bounded IDE-style Explorer and file workspace:

- the Explorer is a dense PrimeVue tree containing the opened project and only
  child collections loaded by the screen's list regions. It is independently
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
  strip ends with an add-tab picker. Pane-level split and close commands live in
  one ellipsis menu. The add button follows the last tab instead of consuming
  the far edge of the header. Generated entity-action buttons render inside the active
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
  and mounts `CassetteDesignerV2` in embedded mode so the designer owns the pane
  rather than a dialog. Linked entities and source-loaded children use the same
  page-opening lookup; relation navigation does not reduce their capabilities.
  Additional app-owned pages register through the same fixed registry.
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

`GeneratedActionButton`, `GeneratedDeleteButton`, and
`GeneratedCassetteDesignerAction` render in the active project tab body.
Regular entity pages and cards may use their menu-item presentation inside
entity ellipsis menus; presentation does not change action resolution or access.
Operational editors may consume commands and construction producers they
implement, but generated relation mutations always remain on this generic action
surface. Their target entity, scoped choices, optional creator, execution, and
refresh behavior come from the compiled relation-action contract; editors must
not match entity types or relation keys locally.
Generated action placement is concern-based and has one owner: create actions
belong to collection/region surfaces, relation mutations to relation-aware
entity surfaces, and entity operations to the opened entity surface. Project
entity deletion is a management operation owned by the Explorer row ellipsis;
it is confirmed before execution, removed from the tab body, and closes every
tab/page reference to the deleted entity after success.

The Project Explorer projects declared containment within compiled collection
folders. Parent entities remain selectable files and become expandable when
currently available child entities reference them through a declared lineage
key. Ordinary project links stay in the Linked entities section; descendants
may nest beneath those linked parents when containment declares the relationship.
No entity type, relation key, or lineage field is inferred from naming.
