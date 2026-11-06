# COMPONENT: Type Designer

Declaration authoring surfaces for the process designer: the class/field/
state Vue Flow node cards, the recursive field-descriptor editor, and the
in-place declaration editor page. 
[pages/organization/process.vue](../../pages/organization/process.vue)
mounts the cards as its `ctsClass`/`ctsField`/`ctsState` node templates,
and the process designer's
[DeclarationInspector](../process-designer/README.md#inspector-anatomy)
hosts the descriptor editor for the selected field node. Parent:
[components](../README.md).

## Nodes

All three cards compose the shared frame and handle primitives
(`DesignerNodeCard`, `DesignerSocketHandle` from
[components/shared](../shared/README.md)) and render sockets from the
pre-derived `data.inputSpecs`/`data.outputSpecs` — port derivation stays
in the page's enrichment pass. Props are `{ data, selected }`; card
sizes, socket tones, and the quiet-card law follow the
[canvas channel vocabulary](../process-designer/README.md#canvas-channel-vocabulary).

| File | Node | Contract |
|---|---|---|
| `TypeNode.vue` | `ctsClass` | Class declaration card (`md`): class icon from `data.class` (file/item/group/process), label, class tag; scope version, editor tag, and field/state counts live in the header tooltip. Sockets: `input:declare` (declares/children wires land here), `output:type` (renders once the class carries its type id). |
| `FieldNode.vue` | `ctsField` | Field card (`sm`): inline rename input emitting `rename`; the descriptor renders as a tag (`unit`, `Ref(a|b)`, `base?`); `output:field` wires the field into its type, and a `ref`-base field gains `input:targets` for wired accepted targets. |
| `StateNode.vue` | `ctsState` | State value token (`sm`): inline rename input emitting `rename`; terminal marker; `output:state` wires the value into create/transition sockets, `input:state` nests another state inside it. |

`rename` events route to the page's `renameDeclarationNode`.

## DescriptorEditor

`DescriptorEditor.vue` is the v-model editor for the whole field
descriptor grammar: base select over the CTS `FIELD_BASES`, `nullable`,
`writable`/`constructible`, and the per-base qualifiers — unit (CTS
`UNITS`) for `quantity`, `accepts` from `typeOptions` for `ref`
(beside its unlink policy over CTS `UNLINK_POLICIES`),
chip-authored values/tags for `enum`/`variant`, recursive `itemType`
for `list`/`map`, and named record fields recursing the editor. Every
change emits a fresh object through `update:modelValue`; switching the
base preserves the SPEC §4 naming-facet keys (`label`, `display`,
`control`, `identifier`, `depiction`) and `nullable`. Validation runs
live through the registry's `describeType`, its message rendering
inline; an unset `ref` (no accepted targets) is authored-in-progress
and stays out of the declaration until targets are picked.

## The in-place declaration editor (SPEC §1)

`TypeDeclarationEditor.vue` is the registered `typeDeclaration` workspace
page (`/types/declaration` as its mobile/deep-link route), opened by the
author affordance on a stationed type's surfaces
([generated](../generated/README.md)). It receives the `typeId` (and the
resolved stationing definition id) through the page-open params channel
and is a **second projection of the same declaration records the canvas
authors** — one authoring model, two projections:

| Concern | Contract |
|---|---|
| Load | The stationing definition document through the designer's read API (`GET /api/process-definitions/:id`); the page subtitle names the definition, the title the type — both through their label chains. |
| Projection | `definitionToCanvas`/`canvasToDefinition` (packages/processes transpiler) between the document and the edited node/edge arrays — the same seam the canvas round-trips through. |
| Fields | One property row per declared field: name, kind + qualifier summary (`fieldDescriptorSummary`), the required/nullable state, the identifier mark; row affordances rename, host the shared `DescriptorEditor`, move the single identifier holder (`applyFieldDisplayRole`), add, and remove. |
| Lifecycle | The states of the type's vocabulary (value, severity, icon — the state authoring pieces the inspector hosts) and the bound transition records (intent label, target; the row's from column shows the wiring-derived source states, an authored `state.from` appended as legacy data, else "any"). A state enters the vocabulary through an operation (SPEC §7): add-state carries it into the first construct without an initial state, else mints the targeting transition. |
| Writes | The same declaration records: class node data, field nodes and their `declares` wires, state nodes and their `entry` wires into `cts.construct`/`cts.transition` records. `interpretDeclarationEdges` runs after each structural edit — the same live interpretation the canvas runs. |
| Validation | `compileTreeDeclarations` + `normalizeType` diagnostics on every change (the class-inspector chain, pinned in `utils/processDesignerDeclarationEditor.js`); a removal that would orphan consumers is refused and its fresh diagnostics surfaced inline. |
| Save | `PATCH /api/process-definitions/:id` with the `canvasToDefinition` snapshot — draft persistence only; the Apply ceremony stays the only activation path. Dirty state gates the save button; leaving the routed page with unsaved changes prompts through the standard confirm host, and a dirty mount guards the browser unload. Closing the editor's pane tab drops unsaved edits. |
| Machine view | One dialog from the lifecycle header: `machineModelOf` + `mermaidFlowchartOf` render through the shared markdown pipeline (mermaid fences as diagrams app-wide); the initial state derives from the construct's entry target, each transition renders one edge per wiring-derived source state (`transitionSourcesOf`, the draft-side twin of the compiled `declaredTransitionSources` — [packages/processes](../../packages/processes/README.md) → Workflow synthesis), and a transition with no derived sources renders from the initial state, else from every other state. |

Glyph authoring, payload-traits authoring, the transition guard
editor, actor assignment, field policy, grants, and the dataflow wiring
stay on the canvas inspector (v1 boundary).

The pure projection and gesture layer lives in
[utils](../../utils/README.md) → `processDesignerDeclarationEditor.js`
(spec-pinned: the in-place round-trip must serialize to the document the
canvas gestures save); the stationing-definition resolution in
[composables](../../composables/README.md) → `useDeclarationStation`.

## Conventions

- The card face stays quiet — identity, tag, sockets; meta detail rides
  the tooltip ([process-designer](../process-designer/README.md) card
  anatomy).
- `state-severities.js` homes the state-severity options shared with the
  [process-designer](../process-designer/README.md) inspector.
- The descriptor vocabulary (bases, units, naming facets, mutability
  semantics) is owned by [packages/cts](../../packages/cts/SPEC.md);
  this folder renders and edits it, adding none.

## Related

- Parent: [components](../README.md)
- [process-designer](../process-designer/README.md) — canvas contract, inspector, wire grammar
- [generated](../generated/README.md) — the author affordance and the workspace-page registry
- [shared](../shared/README.md) — `DesignerNodeCard`, `DesignerSocketHandle`
- [packages/cts](../../packages/cts/SPEC.md) — declaration and descriptor grammar
