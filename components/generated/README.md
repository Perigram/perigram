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

- the Explorer pane is a PrimeVue tree containing the opened project and the
  child collections already loaded for the screen's list regions. Child
  creation controls come only from `createEntity` actions compiled onto the
  matching child region.
- the editor pane contains the selected generated-source entity. It uses the
  standard entity card and display surface contract. Relation fields are
  rendered there only when the entity DTO and effective display contract expose
  them.
- the right lane contains non-lifecycle operations compiled onto the selected
  entity's screen/region, access-gated deletion, and lifecycle history. Status
  mutations remain in `EntityStatus`; they are not duplicated in the operation
  rail.

The overload composes the canonical `EntityPage`, `WorkspaceLanes`, and
`ScrollablePanel` primitives; it does not add an overload-only mode to a shared
primitive. The component does not fetch global child lists or infer relation
sections from domain metadata. Selectable child rows come from the screen's
source states, which are filtered by process grants and assignment scope before
rendering. Screen-level actions apply to the project, while child operations
come from the selected child's region. The overload resolves only those
compiled ids through the current user's action manifest.

`GeneratedActionButton` supports an icon-only presentation for Explorer section
toolbars. This changes presentation only: it still resolves the action from the
current user's action manifest and emits that compiled action to the generated
screen executor.
