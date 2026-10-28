# COMPONENT: Type Designer

Declaration editor nodes for the process designer: the class/field/state
Vue Flow node cards and the recursive field-descriptor editor.
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

## Conventions

- The card face stays quiet — identity, tag, sockets; meta detail rides
  the tooltip ([process-designer](../process-designer/README.md) card
  anatomy).
- The descriptor vocabulary (bases, units, naming facets, mutability
  semantics) is owned by [packages/cts](../../packages/cts/SPEC.md);
  this folder renders and edits it, adding none.

## Related

- Parent: [components](../README.md)
- [process-designer](../process-designer/README.md) — canvas contract, inspector, wire grammar
- [shared](../shared/README.md) — `DesignerNodeCard`, `DesignerSocketHandle`
- [packages/cts](../../packages/cts/SPEC.md) — declaration and descriptor grammar
