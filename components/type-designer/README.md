# COMPONENT: Type Designer

Class declaration authoring for the platform: the class/field/state
Vue Flow node cards, the recursive field-descriptor editor, the class
dialog, and the class page (SPEC §27).
[pages/organization/process.vue](../../pages/organization/process.vue)
mounts the cards as its `ctsClass`/`ctsField`/`ctsState` node templates,
the process designer's
[DeclarationInspector](../process-designer/README.md#inspector-anatomy)
hosts the descriptor editor for the selected field node, and the home
sidebar mounts the class page and dialog
([components/generated](../generated/README.md)). Parent:
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
|---|---|
| `TypeNode.vue` | `ctsClass` | Class declaration card (`md`): class icon from `data.class` (file/item/group/process), label, class tag; scope version, editor tag, and field/state counts live in the header tooltip. Sockets: `input:declare` (declares/children wires land here), `output:type` (renders once the class carries its type id). |
| `FieldNode.vue` | `ctsField` | Field card (`sm`): inline rename input emitting `rename`; the descriptor renders as a tag (`unit`, `Ref(accepts)`, `base?`) with accepted type ids resolved to labels through the enrichment pass's `data.fieldTypeLabelFor` resolver (SPEC §4); `output:field` wires the field into its type, and a `ref`-base field gains `input:targets` for wired accepted targets. |
| `StateNode.vue` | `ctsState` | State value token (`sm`): inline rename input emitting `rename`; terminal marker; `output:state` wires the value into create/transition sockets, `input:state` nests another state inside it. |

`rename` events route to the page's `renameDeclarationNode`.

## Class library and class dialog (SPEC §27)

The class library is the organization's `scope: 'org'` registry view
(`GET /api/admin/cts/types` through
[useFileTypeView](../../composables/README.md)). Organization classes
appear as sidebar type panels and every entry opens its bound Page
instance ([components/generated](../generated/README.md) — the regular
page whose collection mounts the class's compiled list screen and whose
header carries the class dialog action); the panel context menu opens
`ClassDialog.vue`. The sidebar's New class action creates a class.

| Piece | Contract |
|---|---|
| `ClassDialog.vue` | Create/edit one org declaration: name, class, glyph, fields, states, and children edges. The identity row stays above a tab set whose counts mirror the collection sizes; the footer stays fixed and each tab scrolls its own table. Saves through `POST /api/admin/cts/types` with the loaded declaration and those facets replaced. Delete removes an existing org declaration through the removal ceremony; a refusal keeps the dialog open with its blast radius and an explicit Delete anyway confirmation. A `group` class cannot save without a child. |
| Fields | `ClassFieldRow` — one compact row (name, base, empty, remove) with the descriptor qualifiers beneath, stacked below `sm`; the tab toolbar owns the Names-record select. The registry key is an internal id minted from the initial label via `rowFieldId` and kept stable across renames. |
| States | `ClassStateRow` — one compact row (value, severity, icon, remove), stacked below `sm`; the tab toolbar adds rows. The vocabulary persists on the declaration and overrides the compiled process policy for the same values. |
| Children | Existing classes attach through the parent's `edges.children` entry; each type keeps its entry's `lineageKey` and `onRemove`. Add child class opens a draft `ClassDialog` — the child persists with the parent save, never on the click; the draft dialog offers every declarable class, group included. |
| Capability | `organizations:admin`, the same seam as declaration authoring. |
| `FieldDeclarationForm.vue` / `StateDeclarationForm.vue` | The process-designer inspector's declaration forms; both declaration surfaces share the descriptor grammar and state-severity vocabulary. |
| `GlyphSelect.vue` | The one icon-sized glyph picker, shared by the class dialog (class glyph and state icons) and the process-designer declaration inspector. It searches the full PrimeIcons set plus every generated `ck-` family glyph; `class-glyphs.js` carries the option set. |

## DescriptorEditor

`DescriptorEditor.vue` is the v-model editor for the whole field
descriptor grammar: `DescriptorBaseControl` (base select over the CTS
`FIELD_BASES` plus the `Can be empty` toggle), and the per-base qualifiers — unit
(CTS `UNITS`) for `quantity`, `accepts` from `typeOptions` for `ref`
(beside its unlink policy over CTS `UNLINK_POLICIES`),
chip-authored values/tags for `enum`/`variant`, recursive `itemType`
for `list`/`map`, and named record fields recursing the editor; the
qualifier blocks label through the §22.8 label cell (`text-label
text-muted`). The base, unit, and unlink pickers are single `Select`
controls; accepted ref targets are a `MultiSelect`. Every change emits a
fresh object through
`update:modelValue`; switching the base preserves the SPEC §4
naming-facet keys (`label`, `display`, `control`, `identifier`,
`depiction`) and `nullable`. `simple` mode (the class dialog) hides the
advanced `writable`/`constructible` flags and the ref unlink policy;
`details-only` mode renders only the qualifiers beneath the field form's
name/type row. The qualifier grid adapts to its container: one column in
the inspector, two in the wide class dialog;

those remain in the contract for system rows and the process-designer
inspector. Validation runs live through the registry's `describeType`,
its message rendering inline; an unset `ref` (no accepted targets) is
authored-in-progress and stays out of the declaration until targets are
picked.

## Conventions

- The card face stays quiet — identity, tag, sockets; meta detail rides
  the tooltip ([process-designer](../process-designer/README.md) card
  anatomy).
- `state-severities.js` homes the state-severity vocabulary shared with the
  [process-designer](../process-designer/README.md) inspector and the class
  state rows;
  `stateSeverityOptions(t)` labels it through
  `processDesigner.stateSeverities.*` (en+ru).
- The descriptor vocabulary (bases, units, naming facets, mutability
  semantics) is owned by [packages/cts](../../packages/cts/SPEC.md);
  this folder renders and edits it, adding none.

## Related

- Parent: [components](../README.md)
- [process-designer](../process-designer/README.md) — canvas contract, inspector, wire grammar
- [ui-mapping](../ui-mapping/README.md) — the record surfaces the field facts render on
- [shared](../shared/README.md) — `DesignerNodeCard`, `DesignerSocketHandle`
- [packages/cts](../../packages/cts/SPEC.md) — declaration and descriptor grammar
- [server/features/cts-types](../../server/features/cts-types/README.md) — the org registry write gate
