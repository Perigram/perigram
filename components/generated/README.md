# COMPONENT: Generated Screens

Generated components render user-specific process screen manifests. They do not
load arbitrary Vue component names from process data; the manifest selects fixed
screen templates, sources, regions, surfaces, and action ids, and the app
renderer maps those contracts to registered Vue surfaces.

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
  workspace chrome does not use the signal-orange action boundary.
- `GeneratedProjectActionPalette` renders directly in that top strip, outside
  both Explorer and pane content. It contains only action ids compiled onto the
  project screen/main region plus direct-project child creates from loaded child
  regions, resolves those ids through the effective user action manifest, and
  checks current project lifecycle applicability. It does not scan the global
  manifest or invent relation/upload controls.
- `GeneratedWorkspacePane` accepts both entity pages and registered workspace
  pages. `GeneratedEntityFile` is only the pane adapter: its compact header
  identifies the open entity and owns split/close controls, while its body
  mounts the canonical `GeneratedEntityDetail`/`EntityPage` for that entity.
  It must not rebuild lifecycle, actions, or a compact summary surface. Detail
  overloads therefore behave identically in a
  project pane and on a regular generated entity route. The adapter also scopes
  the selected entity type's compiled `entityDetail` screen with the selected
  entity id and loads its readable sources through `useGeneratedScreen()`.
  Child regions are nested under the entity page exactly as they are on the
  regular generated route; Project screen source data is not a substitute for
  the selected entity's own detail-screen contract.
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
  selections, and opened registered pages are persisted as versioned browser UI
  state scoped to the current user, organization, and project. Stored data
  contains stable entity/page references, never entity DTOs, and is validated
  before restoration. A reference remains in its pane while asynchronous screen
  sources and linked entities load; temporary absence must not erase restored
  navigation state. There is no reserved right inspector pane.

Selectable rows still come from access-filtered screen source states; the
Explorer contains no workspace actions or unrelated controls. Clicking an
Explorer entity or registered page replaces the active pane selection;
the initial pane and each newly split pane remain empty until the user selects
content for that pane. Empty leaves still render the normal blank pane header
with pane-local split/close controls, rather than disappearing into undifferentiated
workspace space. Subsequent navigation is pane-local. Opened entity-bound pages
remain nested beneath their source entity in the Explorer.
When a child file opens, its actions come from that entity type's compiled
detail screen in the current user's effective screen manifest. Parent-workspace
region actions are merged only when they also apply to the selected entity.
This lets an embedded queue consume queue-detail commands and cassette-design
producer actions without granting or discovering actions outside the user's
compiled process access.

Registered screen overloads select the bounded workspace mode on
`GeneratedScreen`/`StandardPage`, and the authenticated app layout resolves the
same overload from the user's active screen manifest. The resulting frame is
flush to the app boundary and body scrolling is disabled. Explorer, editor, and
file panes own their scrolling independently.

`GeneratedActionButton`, `GeneratedDeleteButton`, and
`GeneratedCassetteDesignerAction` support menu-item presentation for entity
ellipsis menus. Presentation does not change action resolution or access.
