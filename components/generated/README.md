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
user's compiled manifest.

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
bounded three-pane operational workspace:

- the Explorer pane contains the opened project, generated child collection
  sources, and domain-declared project relations. Child creation controls come
  only from actions compiled onto the matching child region. Relation controls
  come only from compiled project `updateEntity` actions whose writable fields
  include that `relations.*` key.
- the editor pane contains the selected generated-source entity. It uses the
  standard entity card and display surface contract; it does not repeat route
  metrics or invent project-specific forms.
- the Inspector pane contains non-lifecycle process operations, access-gated
  deletion, and lifecycle history for the currently selected entity. Status
  mutations remain in `EntityStatus`; they are not duplicated in the operation
  rail.

The workspace header contains canonical project identity, trace, and status
only. Aggregate queue/area summaries are not repeated there. The component
does not fetch global child lists: selectable child rows come from the screen's
source states, which are filtered by process grants and assignment scope before
rendering. Relation refs come from the already-redacted project DTO and retain
the normal generated-detail/access behavior of `EntityInlineRef`.

`GeneratedActionButton` supports an icon-only presentation for Explorer section
toolbars. This changes presentation only: it still resolves the action from the
current user's action manifest and emits that compiled action to the generated
screen executor.
