# COMPONENT: Type Designer

Declaration authoring vocabulary for the platform: the class/field/state
Vue Flow node cards, the recursive field-descriptor editor, and the
surface declaration authoring session with its affordances (SPEC §1).
[pages/organization/process.vue](../../pages/organization/process.vue)
mounts the cards as its `ctsClass`/`ctsField`/`ctsState` node templates,
the process designer's
[DeclarationInspector](../process-designer/README.md#inspector-anatomy)
hosts the descriptor editor for the selected field node, and the
generated record surfaces mount the authoring affordances
([ui-mapping](../ui-mapping/README.md)). Parent:
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

## DescriptorEditor

`DescriptorEditor.vue` is the v-model editor for the whole field
descriptor grammar: base select over the CTS `FIELD_BASES`, `nullable`,
`writable`/`constructible`, and the per-base qualifiers — unit (CTS
`UNITS`) for `quantity`, `accepts` from `typeOptions` for `ref`
(beside its unlink policy over CTS `UNLINK_POLICIES`),
chip-authored values/tags for `enum`/`variant`, recursive `itemType`
for `list`/`map`, and named record fields recursing the editor; the
qualifier blocks label through the §22.8 label cell (`text-label
text-muted`). Every change emits a fresh object through
`update:modelValue`; switching the base preserves the SPEC §4
naming-facet keys (`label`, `display`, `control`, `identifier`,
`depiction`) and `nullable`. Validation runs live through the
registry's `describeType`, its message rendering inline; an unset `ref`
(no accepted targets) is authored-in-progress and stays out of the
declaration until targets are picked.

## Surface declaration authoring (SPEC §1)

Declaration authoring happens on the generated surfaces — fields in the
record page's property block, states in the state surface — with no
separate editor surface. One authoring model: the pure gesture layer
below mutates the same canvas declaration records the designer authors,
and every surface affordance is a projection of one session.

| Piece | Contract |
|---|---|
| Session | `useDeclarationAuthoring.js` — resolves the stationing definition (`useDeclarationStation`), loads it through the designer's persistence seam, projects with `definitionToCanvas`/`canvasToDefinition`, runs `interpretDeclarationEdges` after each structural edit, and mutates only through the pure layer. Diagnostics recompute on every change (`compileTreeDeclarations` + `normalizeType`); save is a draft `PATCH` (`saveDraft`); Apply stays in the designer. |
| Provider | `DeclarationAuthoring.vue` renders a bare slot and provides the session as `declarationAuthoring`; [ui-mapping](../ui-mapping/README.md)'s RegionBlock mounts it around the depth-0 record. It gates on the process-design capability (`organizations:admin`, the designer's own seam) and the declaration station; non-holders and pack types get no session and the surfaces stay byte-identical. |
| Fields | The record page's property block projects the draft for holders: every declared scalar field in authored order, empty ones included, one author affordance per row. The row popover (`DeclarationFieldMenu` → `DeclarationFieldPanel`) composes the shared `DescriptorEditor` — kind, qualifiers, relation targets offered from the live registry view (`typeOptions` over the designer's CTS type view) — beside the name, the identifier-holder move, move up/down (`moveDeclarationField`), and removal gated by live diagnostics (an orphaning remove refuses with the compiler's fresh reason). The block ends in the add-field affordance (`DeclarationAddField`, minting through `newFieldDeclaration` with the authored name and descriptor); rendered structural sections carry the same popover at their label. |
| States | The state popover ([ui-mapping](../ui-mapping/README.md) SurfaceHeader) gains the authoring lane `DeclarationStatePanel`: the vocabulary states edit value, label, severity/icon (`state-severities.js`), transitions author from/to the type's live vocabulary with the intent label, removal is diagnostics-gated, and the machine view (`machineModelOf` + `mermaidFlowchartOf` through the shared markdown pipeline) opens one dialog away. Add-state carries the SPEC §7 law — the first construct without an initial state gets it, else a targeting transition is minted — and the consequence is stated beside the input before commit. A stateless record of a stationed type carries the quiet add-states affordance at the state surface position instead. |
| Save | `DeclarationSaveButton` — the one save affordance, dirty-gated, mounted in the property block's end cluster and the state panel. |
| Guard | A dirty session warns on route leave through the standard confirm host (`onBeforeRouteLeave` in the session) and on browser unload; closing a host pane tab without a route change carries no veto seam (canvas parity). |

`DeclarationStateRow.vue` and `DeclarationTransitionRow.vue` are
pure-presentation rows the state panel composes — every mutation an
event up (the process-designer inspector law); the panels bind them to
the session's gestures.

Glyph authoring, payload-traits authoring, the transition guard
editor, actor assignment, field policy, grants, and the dataflow wiring
stay on the canvas inspector (v1 boundary).

The pure projection and gesture layer lives in
[utils](../../utils/README.md) → `processDesignerDeclarationEditor.js`
(spec-pinned: the surface round-trip must serialize to the document the
canvas gestures save); the stationing-definition resolution in
[composables](../../composables/README.md) → `useDeclarationStation`.

## Conventions

- The card face stays quiet — identity, tag, sockets; meta detail rides
  the tooltip ([process-designer](../process-designer/README.md) card
  anatomy).
- `state-severities.js` homes the state-severity vocabulary shared with the
  [process-designer](../process-designer/README.md) inspector;
  `stateSeverityOptions(t)` labels it through
  `processDesigner.stateSeverities.*` (en+ru).
- The descriptor vocabulary (bases, units, naming facets, mutability
  semantics) is owned by [packages/cts](../../packages/cts/SPEC.md);
  this folder renders and edits it, adding none.

## Related

- Parent: [components](../README.md)
- [process-designer](../process-designer/README.md) — canvas contract, inspector, wire grammar
- [ui-mapping](../ui-mapping/README.md) — the record surfaces the affordances mount on
- [shared](../shared/README.md) — `DesignerNodeCard`, `DesignerSocketHandle`
- [packages/cts](../../packages/cts/SPEC.md) — declaration and descriptor grammar
