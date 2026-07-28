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

- the borderless Explorer is a dense PrimeVue tree containing the opened
  project and only the child collections loaded by the screen's list regions.
- each file is a `GeneratedEntityFile`: a single header line with entity icon,
  identity, status, an ellipsis action menu, and split controls. A project file
  is the workspace's operational home: its body contains only the runnable
  project and direct-child actions compiled for the current user, rather than a
  duplicate project summary. Child entity bodies resolve through the same
  registered entity-detail overload registry as a generated detail page,
  without nesting `EntityPage` or an entity card. Operational entities
  therefore keep their real editor—queues render
  `GeneratedQueueDetail`/`QueueEditor`—while entities without an overload fall
  back to the pane-width-safe generic detail surface. The file rendering mode
  asks operational bodies for flush chrome; queue workspace panels remove
  rounded outer borders because the surrounding file already owns the pane
  boundary.
- PrimeVue splitters form a recursive split tree. A file can split right or
  down, and nested horizontal/vertical splits keep independent entity
  selections and scrolling. There is no reserved right inspector pane.

The opened project file aggregates its runnable project operations from the
compiled contract and renders them as a compact launcher in the otherwise empty
file body. Direct-child create actions come from the matching child list region
and must declare `project` as their parent. Screen/main action ids join the
launcher only when their typed inputs mutate `relations`/`attachments` or
consume an attachment; normal entity and lifecycle commands stay in the header
ellipsis. The component resolves only those ids through the current user's
action manifest; it does not scan the global manifest, import domain relation
metadata, or call link/upload APIs directly. If the organization process does
not compile an upload or relation action onto this screen, that control is
intentionally absent; no generic project-information fallback replaces missing
operations.

Selectable rows still come from access-filtered screen source states. Clicking
an Explorer entity replaces the active file selection; splitting duplicates the
current selection and subsequent navigation is pane-local.
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
