```yaml
doc_id: COMPONENTS-PROCESS-DESIGNER-SPEC-001
classification: reference
status: active
owner: product-owner
created: 2026-10-24
updated: 2026-10-24
```

# SPEC: Process Designer

The authoring surface for CTS declarations and process graphs: a Vue Flow canvas with palette,
inspector, lanes, and apply ceremonies, mounted by `pages/organization/process.vue`. The grammar
it renders — palette membership, node/edge species, wire legality — is authored through the
designer contract owned by [packages/processes](../../packages/processes/README.md); this folder
owns the surface: channels, arrangement, gestures.

## Scope boundary

The primary canvas in this component is the CTS process-definition designer:
its declaration graph and process graph follow the
[CTS graph protocol](../../packages/cts/SPEC.md#14-graph-protocol-declaration-bound-process-definitions).
It is not the editor/runtime for portable `perigram.graph` documents, whose
canonical format and evaluator belong to
[@perigram/core](../../packages/core/README.md#canonical-graph-documents)
(root SPEC §28). The `GraphDocument*` components in this directory are
support surfaces for that separate procedural-graph workspace; their
execution and persistence contracts are not inherited from the CTS process
graph protocol.

## Contracts owned here

### Canvas channel vocabulary

One channel encodes exactly one fact; anything unlisted is chrome.

| Channel | Encodes |
|---|---|
| Socket color | transported payload family (reference, structure, quantity, decision, temporal, external, effect, projection, data); events use the primary accent |
| Socket mark | the connection point: one uniform filled circle; color is the only socket channel |
| Wire line style | cargo: solid = instances, dashed = values, dotted = events (the one wire family allowed color), demuted structure-dashed = declaration bindings |
| Handle position | direction: left input, right output |
| Wire selection | primary color, 3px |
| Card size | species family: `sm` declaration leaf, `md` type/class reference, `lg` operation, `inline` one-line literal |
| Card surface | population primacy via the one predicate `utils/processDesignerPopulation.js`: effect species (except remove) primary-tinted, everything else plain content surface |
| Card border | quiet content border; selection is the single card state |

Canvas nodes carry no category accent; the frame is plain. Wires are bezier, one elliptical arc
for self-loops, no markers. Access (Item/List/Tree) is a hover/runtime fact, carried by no
socket visual.

### Card anatomy

Top to bottom: header (neutral icon chip + label), socket rail (labeled rows, inputs left /
outputs right, handles centered on the outer rail, labels always render), event section (effects
only). Cards are socket manifests, never authoring surfaces: typed defaults, literal values,
operation parameters, casts, conversions, and structured values are edited in the inspector.
The inspector also owns live input/output evaluation; the card exposes only identity, diagnostics,
preview visibility, collapse, and socket contracts. Sections separate by spacing
alone; the hover/focus tooltip carries the socket contract (`Expects`/`Outputs`: name — type ·
access · optional) from the real ports. All cards compose `DesignerNodeCard` /
`DesignerSocketHandle` from [components/shared](../shared/README.md): enforced by construction.

### Lanes (the authorization surface)

Lanes are permanent and ARE role assignment for effect nodes: dropping an effect in a role lane
writes that grant; the implicit unlabeled bottom lane catches grantless effects and clears
grants; dropping any other node makes that lane its persisted home. Grant LEVELS per role stay
inspector-owned. One lane per role in fixed order (empty roles keep their lane); bands are a
background layer beneath nodes and wires — hairline separators, spanning the node domain,
titles counter-scaled to screen size. A node's vertical coordinate is authored lane-relative
(`data.laneY`); membership is an authored fact (effects by grant record, others by `data.lane`);
one deterministic idempotent projection (`laneContainerLayout` in utils/processDesignerArrangement.js)
derives absolutes: bands hug seated content (150px minimum for empty lanes), stack in role
order, invent no coordinates, reseat nothing across lanes; Tidy rewrites offsets inside lanes
only. Position is presentation; the grant record is the authorization.

### Authoring interactions

- Box-select, Shift extends; two-finger scroll pans, pinch zooms at the pointer, Space+drag
  pans; coarse pointers pan with one finger, long-press opens the context palette.
- Right-click on empty canvas opens the palette there; dropping a wire on empty canvas opens it
  filtered to compatible sockets and connects on choice; dropping the loop item creates the
  `control.forEach`/`forEachEnd` pair together. Nodes place at the nearest unoccupied grid
  position around the viewport center, joining the lane under it.
- Node cards are socket manifests, never authoring surfaces. Inputs, outputs, defaults,
  operation configuration, structured values, and live values are derived from the normalized
  operation/port contract and edited in the inspector. The renderer uses generic controls and
  declarative presentation hints; provider-specific execution logic never lives in node SFCs.
  A connected wire owns its input; otherwise the inspector exposes the declared default or an
  appropriate schema-driven editor. Single-value sockets reject a second wire on the connect
  gesture, socket named in the notice.
- Live evaluation: authoring state folds into one semantic signature; any change re-runs wire
  interpretation and the sync pass in the same tick; the compile is gated on the authoring
  signature. Declaration authoring validates live (id grammar, `compileTreeDeclarations`,
  `normalizeType` diagnostics).

### Node-data and identity

`enrichNodeData` is the single enrichment pass (record sync, derived labels, port specs, option
lists); `stripRuntimeNodeData` lists the derived keys; `operationKindOf` classifies for shared
behavior and no path changes a record's kind or ports. Class identity is the authored name —
renaming is a pure label change; the registry id is opaque, randomly generated (`mintId` in
utils/processDesignerIdentity.js: time + counter + random, minted at node creation), shown
nowhere, edited nowhere; the same module mints every canvas/definition id.

### Apply ceremony

Save/validate/activate run as one operation with first-diagnostic focus; declaration-post
failures abort before validation and land in the persistent validation feedback the canvas
renders. A migration-gate refusal pauses Apply with `pendingTypeMigration` and opens
`TypeMigrationStepsDialog` — one row per breaking change, labeled by authored NAME/LABEL,
offering the declarative steps (`rename-field`, `rename-enum-value`, `retype-field`, …).
Removed workflow states with live instances that the draft's declared migrations leave
uncovered pause with `pendingMigration` on `ApplyMigrationDialog` (one target state per
removed state, confirmed as a declaration on the draft). Types outlive
definition activation and deletion; class metadata edits in the class
dialog (SPEC §27).

### Screens tab

The compiled preview IS the station inventory, rendered through the real generator
(`composeScreen` + the ui-mapping registry) over the CTS-vocabulary UI contract, lowered through
the same `prepareAuthoredDefinition` acceptance seam the server uses. Inferred stations render
read-only; their only authoring gesture is Customize, which duplicates the station into an
authored record (fresh id and route, compile-only keys dropped, kind preserved) — an untouched
duplicate stays projection-equal and Apply's redundancy guard refuses it. Authored stations
suppress only the station they equal in kind. This folder owns the
preview-through-real-generator contract.

### Inspector anatomy

Per-kind sections in `inspector/`, pure presentation — every mutation is an event back to the
page's update/sync entry points. `ProcessNodeInspector` owns effect construction, declared edge
selection, the transition guard AST editor, output inspection, and grant LEVELS;
`DeclarationInspector` authors class/field/state/type-reference records;
`DeclarationEdgeInspector` authors typed edge integrity. Pure and read nodes expose the
on-demand Output data inspector (selected node + upstream dependencies; `missing(<path>)`
distinguishes present null from absent field; secrets arrive redacted).

## Structure

10 SFCs at folder root (canvas nodes, palette, preview channel mount, dialogs, TypedValueControl)
+ `inspector/` (3 SFCs: DeclarationEdgeInspector, DeclarationInspector,
ProcessNodeInspector).
Selection, draft persistence, graph sync, connection inference, palette queries, roles, screens,
and panel state live in the focused `useProcessDesigner*` composables; pure projections in
`utils/processDesigner*.js`.

## Laws

- Palette membership and node/edge grammar:
  [packages/processes/README.md](../../packages/processes/README.md) — the single home; this
  folder's README links it.
- Declaration semantics and naming grammar: [packages/cts/SPEC.md](../../packages/cts/SPEC.md).
- Runtime status model (snapshot + `status_events`):
  [server/core/machines/README.md](../../server/core/machines/README.md).
- Frame primitives: [components/shared](../shared/README.md).
- Socket tones, signals, population, arrangement utils: [utils/README.md](../../utils/README.md).
- Parent: [components](../README.md); its [SPEC](../SPEC.md).

## End state

README ≈300 lines: channel vocabulary tables, lanes/tidy, apply/migration
ceremonies as tables, interactions, Screens tab; palette membership and
runtime contracts link their owning homes.
