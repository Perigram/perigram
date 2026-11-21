```yaml
doc_id: COMPONENTS-PROCESS-DESIGNER-SPEC-001
classification: reference
status: active
owner: product-owner
created: 2026-10-24
updated: 2026-11-19
```

# SPEC: Process Designer

The authoring surface for CTS declarations and process graphs: a Vue Flow canvas with palette,
inspector, lanes, and apply ceremonies, mounted by `pages/organization/process.vue`. The grammar
it renders — palette membership, node/edge species, wire legality — is authored through the
designer contract owned by [packages/processes](../../packages/processes/README.md); this folder
owns the surface: channels, arrangement, gestures.

## Scope

This component supplies the one editor mount (`GraphEditorSurface`) over the
shared canvas presentation. The process page mounts it with the process
profile; graph-document files mount it with the canonical graph-document
session. Both use the same canvas, selection, viewport, and provider
protocols.

The canonical persisted graph document, node/port contract, compatibility
rules, provider discovery, validation, composition, and procedural execution
are owned by [@perigram/core](../../packages/core/README.md#canonical-graph-documents),
[@perigram/plugin-sdk](../../packages/plugin-sdk/README.md), and root SPEC §28.

CTS declarations remain domain records and process-specific semantics remain
owned by [@perigram/cts](../../packages/cts/SPEC.md) and
[@perigram/processes](../../packages/processes/SPEC.md). They are projected
onto the shared graph surface; they do not justify a second canvas protocol,
socket algebra, provider registry, or reusable-graph mechanism.

Process definitions persist the canonical graph envelope. The process
compiler reads the authored projection of that envelope; process-specific
declarations, authorization, workflow, and effects remain process-profile
semantics.

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
| Card surface | population primacy: effect species primary-tinted, everything else plain content surface |
| Card border | quiet content border; selection is the single card state |

Canvas nodes carry no category accent; the frame is plain. Wires are bezier, one elliptical arc
for self-loops, no markers. Access (Item/List/Tree) is a hover/runtime fact, carried by no
socket visual.

### Card anatomy

Top to bottom: header (neutral icon chip + label), socket rail (labeled rows, inputs left /
outputs right, handles centered on the outer rail, labels always render), event section (effects
only). Socket rows carry the socket name; the element type, access, and qualifier ride the row's
hover/focus tooltip — a per-socket connection icon is chrome encoding nothing. A collapsed card is
one header line — the name and its icons — with every socket centered on the card's top and bottom
edges at distinct positions (inputs top, outputs bottom, names on the handle tooltips). Cards are socket manifests, never authoring surfaces: typed defaults, literal values,
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

## Unified editor workspace and migration

This component implements root SPEC §28.14. The process designer and
graph-document editor are two entry contexts for one graph authoring
system, not two products that happen to share a Vue Flow canvas.

### Surface composition

The editor uses the application's shared visual system and primitives.
It must not introduce a separate floating/glass visual language.

The workspace has six distinct concerns:
1. Graphs list (inspector rail): graph identity, open, create, rename,
   dirty/saved state, and save for process definitions and graph
   documents; process definitions carry their lifecycle actions (new
   draft, apply, activation, versions) on the list entry. The editor is
   headerless.
2. Node library: searchable semantic node catalog and insertion.
3. Canvas: graph composition and navigation.
4. Inspector: the graphs list and selected node/edge configuration.
5. Preview workspace: selected graph output and its available renderers,
   in a resizable region with sufficient space for document and 3D views.
6. Diagnostics: validation, execution errors, and optional intermediate
   node-output inspection. Diagnostics render on condition — errors,
   warnings, and apply diffs — and the canvas carries no standing state
   chrome: a valid draft shows no badge, and evaluation state has no
   permanent pill.

The preview workspace is not an inspector tab or right-side inspector
section. It is a separate bottom panel or dedicated workspace pane. The
Use Graph node's source graph/revision picker is node configuration and
remains in that node's inspector.

### One editor

The unified editor is one UI: the organization graphs page hosts both
process authoring and graph-document authoring (root SPEC §28.14). The
graph-document file-surface mount retires; opening a graph file
navigates to the unified editor with that graph loaded. The process
profile rides the same page for process definitions.

### Node library and configuration

The palette's platform groups are semantic: values/literals,
data/queries, flow/collections, graph boundaries/reusable graphs, and
the profile's operation families. The dedicated Use Graph group remains
distinct. Installed plugin contributions form one palette section per
plugin, named by the plugin, with the plugin's declared semantic groups
as subgroups inside; a blanket "operations" group name is a defect in
the declaring plugin.

Search indexes labels, descriptions, provider identity, stable operation
identity, category, and declared keywords. Palette entries accurately
represent the node they create. There is no UI-maintained duplicate
operation catalog.

The inspector derives configuration from normalized port contracts,
configuration schemas, defaults, and declarative presentation hints.
Generic code must not grow operation-ID/provider-specific branches.
Specialized editors enter through an explicit provider or process-profile
contribution contract with a named owner.

Generic Create/Construct is driven by the target type's construction
contract: type, construction mode, required fields, defaults, and typed
output. It does not carry hardcoded event, trigger, schedule, or
subscription fields. Those are process-profile semantics and must be
authored by process-specific node definitions with schema-driven
configuration. Do not erase legitimate process event/effect behavior;
remove it from generic construction UI.

Node cards remain socket manifests. Generic node configuration is not
duplicated as ad-hoc inline fields on the canvas. Unknown definitions
remain inspectable and preserve identity, configuration, and wires with
actionable diagnostics.

### Preview and diagnostics

The preview workspace selects a declared graph output and then presents
the representations available for that output. Its default is the best
supported user-facing renderer. Raw JSON is an explicit structured-data
or diagnostic view, never the universal default.

The host owns output selection, representation tabs, layout, loading,
errors, and empty states. Generic representations use platform viewers;
specialized plugin values use the declared plugin renderer. Supported
scene/geometry representations mount the actual host-provided interactive
3D viewer. An SVG projection or a list of serialized node entries is not
an acceptable substitute for a 3D viewer.

Intermediate node outputs and execution traces are optional diagnostics.
They must not replace the selected graph output, and they must not be
rendered as though the entire execution envelope were the output value.
Page graph-result embeds consume the selected declared output and its
representation contract.

### Process profile boundary

The process profile may contribute declarations, lanes, grants, role
semantics, event entry, durable effects, process validation, migration
gates, and Apply/activation. It may not own a second generic graph
document, generic canvas protocol, generic node catalog, generic
inspector framework, or competing procedural evaluator.

The procedural evaluator and durable-process execution profile retain
their distinct scheduling guarantees. Shared authoring and graph semantics
do not imply that ordinary preview runs durable process effects.

The legacy Hide secondary toggle and its primary/secondary visibility
state are removed from the generic editor. If node visibility is required,
it must be designed as an explicit semantic layer/filter model. Do not
reintroduce the old toggle under a new label.

### Migration checklist

- Inventory and classify both editor sessions, canvas adapters, palettes,
  inspectors, preview components, toolbars, panel state, and node-specific
  configuration branches.
- Retire the graph-document file-surface mount; the organization graphs
  page becomes the one editor for process definitions and graph
  documents, with the graphs list in its inspector owning open, create,
  rename, save, and process lifecycle actions.
- Consolidate generic graph authoring on the canonical graph document and
  session; retain process-only behavior as profile extensions.
- Rebuild the workspace regions and responsive transitions without
  overlapping overlays.
- Move preview out of the inspector/support rail into the resizable
  preview workspace region and connect declared output representations
  to host/plugin viewers.
- Rebuild plugin palette contributions as per-plugin sections with the
  plugin's declared semantic groups as subgroups; retire blanket
  "operations" group names from plugin declarations.
- Make Create/Construct schema-driven and remove generic event/schedule
  fields.
- Remove Support and Hide secondary affordances and dead state paths.
- Replace source-text-only tests with rendered layout, interaction,
  accessibility, responsive, preview, and process-profile acceptance
  coverage.

This section supersedes older surface descriptions that place preview
inside the inspector/support rail, expose generic Support or Hide
secondary controls, or treat the process and graph-document sessions as
permanent parallel authoring implementations. Process-specific lanes and
Apply semantics remain valid profile behavior.

## Structure

20 SFCs at folder root (canvas nodes, canvas presentation, editor mount, inspectors, preview
panel/channel strip/outputs channel/output-value renderer, value controls, palette dock and
context palette, lanes, loop edge, preview channel mount, dialogs)
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
