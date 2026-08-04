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
  the left edge of the fixed workspace action strip; collapsing it does not
  rebuild or change the recursive pane tree. Nested workspace chrome does not
  use the signal-orange action boundary.
- `GeneratedProjectActionPalette` renders directly in that top strip, outside
  both Explorer and pane content. It contains only action ids compiled onto the
  project screen/main region plus direct-project child creates from loaded child
  regions, resolves those ids through the effective user action manifest, and
  checks current project lifecycle applicability. It does not scan the global
  manifest or invent relation/upload controls.
- `GeneratedWorkspacePane` accepts both pane-native entity files and registered
  workspace pages. `GeneratedEntityFile` still owns entity identity, lifecycle,
  local ellipsis actions, and detail-body overloads; the project entity itself
  now renders its regular generated detail surface instead of a special action
  launcher.
- `GeneratedWorkspacePage` resolves a page id through the fixed app-owned
  `workspace-pages.js` registry. Process data never selects a Vue component,
  and workspace-level actions are not represented as a registered page or
  Explorer item.
- The built-in `cassette-designer` page opens from a workspace cassette file's
  access-gated designer action. It receives only cassette templates already
  available in the project workspace sources and mounts `CassetteDesignerV2` in
  embedded mode so the designer owns the pane rather than a dialog. Additional
  app-owned pages register through the same fixed registry.
- PrimeVue splitters form a recursive split tree. A pane can split right or
  down, and nested horizontal/vertical splits keep independent selections and
  scrolling. There is no reserved right inspector pane.

Selectable rows still come from access-filtered screen source states; the
Explorer contains no workspace actions or unrelated controls. Clicking an
Explorer entity or registered page replaces the active pane selection;
the initial pane and each newly split pane remain empty until the user selects
content for that pane, and subsequent navigation is pane-local. Opened
entity-bound pages remain nested beneath their source entity in the Explorer.
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
