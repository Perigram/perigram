# COMPONENT: @perigram/domain-cnc

CNC domain implementation package. It owns manufacturing vocabulary and
contracts, but imports no Vue, Nuxt, MongoDB, or worker implementation code.

## Modules

- `entities.js` - CNC entity definitions.
- `workflows.js` - entity lifecycle machines and transition hooks.
- `effects.js` - effect policy declarations consumed by the runtimes.
- `commands.js` - business intent contracts: `saveCassetteTemplate`,
  `solveNestingValue` (the nesting solver's V→V boundary — parameter
  sockets mirror the `nesting.solve` service signature exactly, values in
  and values out with no entity inputs or outputs),
  `generateAttachment`, `generateConfigBotDraft`,
  `reindexConfigBotKnowledge`, and the retired queue-era `solveNesting`.
- `tasks.js` - async task contracts: DXF parsing, cassette baking, nesting
  solve, attachment generation, and geometry capture extraction.
- `attachment-kinds.js` - file/blob kinds, buckets, MIME types, preview modes.
- `hooks.js` - typed transition hook parameter contracts.
- `relationships.js` - legacy pack-internal containment/relation tables
  (SPEC §21), trimmed to pairs whose endpoints survive in `cncEntities`;
  nothing new may be added.
- `summaries.js` - aggregate summary contracts projected from
  `cncContainment`; the projection is empty since the relationship trim.
- `field-access.js` - per-entity field visibility policy consumed by backend
  DTO redaction and frontend shared blocks.
- `field-schemas.js` - exact process-programming field paths with canonical
  blocks, structured value/shape/domain/unit types, and read/write capability.
  Entity-reference descriptors normalize UI aliases such as `nestingRun` to
  canonical process entity ids such as `nesting_run`.
  `origin.timestamp` and `status.timestamp` are date-time values, so process
  date operations preserve their time component when scheduling from a
  lifecycle entry.
- `entity-construction.js` - create-time construction contracts used by process
  action nodes and generated action dialogs. `artifact` is a derived
  `uploadArtifact` constructor: it accepts only attachment kinds whose domain
  contract allows upload, capture, or editor creation, never a name-only
  generic artifact record.
- `ui.js` - design-system policy projected directly from the canonical entity
  registry, not Vue components or a second entity registry.
- `index.js` - public exports and aggregate `cncDomain`.

Facade vocabulary includes project-scoped `facade` entities and organization-
scoped `facade_pattern` entities. A facade points to an immutable GLB or
self-contained GLTF artifact and records mesh-part pattern placements. A
pattern holds a validated typed visual graph and an immutable algorithm
revision. Neither entity bakes cassette designs or starts nesting.

## Vocabulary

Commands are the access/business intent boundary. Tasks are retryable async
execution. Attachments are persisted entity-linked file records; attachment
kinds declare how a file should be stored and previewed.

The `solveNesting` command accepts virtual-sheet parameters or warehouse
material context (`materialMode: WAREHOUSE`, `inventoryItems`, and normalized
`materialPool`), plus a selected machine and tool profile. The machine supplies
the working-area preset and boundary offset; the selected material source still
supplies the actual sheet size/thickness, and the tool profile supplies kerf.
For parametric queue designs, the nesting handler overlays material thickness as
request-local `T` and uses source cassette provenance to evaluate worker
geometry. It does not mutate the linked design or create another persisted
cassette design for that nesting run.
`solveNesting` and the `nesting.solve` task produce
`nesting_run` and `sheet_design` entities only. DXF/SVG/PDF files are requested
later through the artifacts service and `AttachmentKind` contracts, not as
primary nesting-run outputs.
`relationships.js` holds the legacy static containment/relation tables
(SPEC §21). They are trimmed to pairs whose endpoints survive in
`cncEntities`: containment keeps only `cassette -> cassette_design`
(`lineage.templateId`), relations keep only the `sourceDxf -> artifact`
references on `cassette` and `cassette_design`. The queue-, library-, and
production-sheet-era edges died with their entity types in the
deleted-domain retirement, so the `cncSummaries` projection is empty.
Static containment describes non-process domain relationships and may
validate persisted data, but it never authors process source classification,
generated hierarchy, or Home placement. Those concerns use compiled Lineage
bindings from the active process graph.
`field-access.js` keeps `sheetDesign` on the `sheet_designs` access feature.
Queue lineage scopes can restrict which layouts a user sees, but queue grants
do not replace explicit sheet-design output grants from the active process.
Queue workflow UI actions start with `DRAFT -> NESTING`; any system-only
`DRAFT -> READY` recovery transition is marked `display: 'hidden'` so operators
cannot skip nesting from status controls. Queues can be moved to `ARCHIVED`
from any current queue state through a menu transition; admin users can restore
archived queues to `DRAFT`.
CNC workflows export the v2 workflow contract from `@perigram/workflows`. Current
CNC lifecycles use a single `main` region, so persisted entity status stores
`states.main` plus `status.state.active.main`; future independent
lifecycle axes should add regions instead of overloading the primary state.
Organization process definitions can compile entity profile lifecycles into
runtime workflows that override these domain defaults for that organization.
The domain workflows remain the fallback and starter-template source.
Process-visible lifecycles come from type declarations: `cassette` declares
its `ACTIVE -> ARCHIVED` machine on the pack type (SPEC §7), so construction
never carries a lifecycle-entry socket and process compilation reads the
declaration — the legacy workflow table alone is not a process contract.
The first intent-based nesting flow now uses transition intents instead of raw
status names:
- `requestNesting` moves `queue` from `DRAFT -> NESTING`.
- `completeNestingProduction` moves `queue` from `NESTING -> READY`.
- `nestingSolveCompleted` and `nestingSolveFailed` move `nesting_run` from `NESTING` to its terminal solver states.
- `acceptNestingRun` moves `nesting_run` from `COMPLETE -> CHOSEN`.
Nesting run acceptance still declares a synchronous preflight hook and a
synchronous application hook, but the hook now emits declared effects that the
status runtime executes after the status snapshot is written.
Machine entities store CNC working-area presets. The domain ships a public
system default through the machines feature, while organization-owned machines
use normal `machines` grants for writes/admin changes.

Material pile and remnant workflows are also declared here: material piles use
`STOCKED -> DEPLETED`, while remnants use `AVAILABLE -> USED`. `ui.js` contains
matching status labels/icons so live cards and framework/UI-lab previews use the
same lifecycle vocabulary.

`geometry_capture` is the generic photo-to-vector bridge for remnant capture and
facade draft capture. It queues `vision.extractGeometry`, stores polygon
geometry with hole rings, accepts optional normalized image-space prompt rings
for model-assisted extraction, and keeps facade output draft-only until facade
domain entities are introduced. Geometry capture lifecycle writes use workflow
intents: `queueExtraction`, `extractionReady`, `extractionFailed`,
`activateRevision`, and `confirmGeometry`.

`generateConfigBotDraft` and `reindexConfigBotKnowledge` are admin capability
commands. They require `config_bot: admin`, produce command `data`, and do not
write generated Vue/domain files to the repository.

`artifact` remains the current persisted entity type for generated file records.
File behavior is declared by `AttachmentKind`.
Each attachment kind also declares its creation affiliation (`upload`,
`capture`, `editor`, `command`, or `workflow`), preview mode, editor
affiliation (`none`, `text`, `csv`, or `layout`), and server-enforced file
rules. UI
surfaces resolve those capabilities through the domain UI adapter instead of
branching on artifact names. A kind marked `layout` opens the shared artifact
layout editor only when the persisted artifact carries editable layout and
template provenance; an upload-backed kind supports primary-file replacement,
while workflow preview files remain read-only.
File creation contracts also declare accepted file types, byte limits, and
creator fields. `capture` uses the browser-native camera chooser and `editor`
creates a blank TXT/CSV artifact.
The shared artifact creator and detail editor consume that contract, so adding
an upload-backed kind does not require a relation-, cassette-, or page-specific
upload implementation. Creator fields are user-authored typed values only;
storage metadata such as the original filename is maintained by the artifact
service and is not a generic JSON form field. `DXF_SOURCE` therefore asks for a
name and file, while its stored metadata remains internal.
`generateAttachment` is a polymorphic command: its process-designer contract is
one abstract `Attachment source` input with `attachments.generate` capability
and accepted source types.
`artifact-conversions.js` declares supported source-kind to target contracts.
`convertArtifact` is the corresponding process command: it accepts the current
artifact, filters its target choices by source kind, and delegates the actual
work to the server conversion capability. The current contracts are
`LAYOUT_DXF → DXF_SOURCE`, which copies the stored DXF into the upload-backed
source kind with artifact provenance, and `DXF_SOURCE → cassette_design`, which
uses the typed cassette import constructor. New conversions belong in this
registry and must have a server implementation; a matching MIME type alone is
not an implicit conversion.
`artifact_template` is separate organization-owned master data for DXF/PDF
generation layouts. The command accepts it as an optional entity input and
accepts typed assignments through `parameters.values`. Generated artifacts pin
the selected template revision in provenance and keep a separate revision-backed
editable layout.

`entity-construction.js` declares create-time construction contracts. These are
not authorization rules and not display fields. A construction contract names
the supported construction modes and required inputs for each entity type:
ordinary entities use `genericCreate`, while derived entities such as
`cassette_design` use a typed mode (`bakeCassetteDesignFromTemplate`) so the
runtime can call the correct construction service and preserve editor
contracts. `cassette` uses the ordinary entity-create contract because a valid
OCCS template is an invariant of the cassette service, not an optional
construction strategy. Without an explicit definition, every create receives
the complete starter OCCS document. The construction contract declares no
constructor-field inputs: process nodes compose cassette identity, lineage, and
other canonical blocks like any ordinary entity.
When a `cassette` create action is connected to a `library` parent, the process
runtime sends `libraryId` to the cassette service so the resulting template
is stored as a child of the library.
Queue creation is intentionally a shell creation contract: `materialPool` and
nesting parameters are optional construction inputs because
queue composition belongs to the queue editor and nesting command readiness
checks, not to the initial create action dialog. Queue creation still requires
a prompted `name` input so process-generated queues do not enter the system as
unnamed shells.
Queue composition is no longer declared in the pack tables: the legacy
`queue.cassettes -> cassette_design` relation row was removed with the queue
retirement. Where an organization still composes queues, the relation is
authored as a CTS relation edge in the type view, and the process compiler
generates the link mutation from that projection. Producers create or import
a complete design and then link it; no queue construction socket or embedded
item contract duplicates the design.
`cassette_design` creation uses `bakeCassetteDesignFromTemplate` with a source
`cassette` template and typed `cassetteParameters`. Design identity is derived
by the owning creation service from that source; it is not a separate required
constructor input.
The frontend must derive those parameter controls from the chosen cassette's
OCCS definition instead of asking users to enter a raw object string.
`producers.js` declares source categories that can provide derived entities to
workspaces and fixed construction services at runtime. These declarations do
not become one-off process palette nodes. Queue UI resolves the domain
producers and binds matching process actions at runtime instead of hardcoding
page-local source buttons. Linking an existing design to a queue is not a
producer: it is the process compiler's generated mutation action for the
declared `queue.cassettes` relation.
`entity-create-inputs.js` projects those construction contracts into
process-designer data sockets for older imports; new code should read
`cncEntityConstruction` directly. Post-creation data mutation belongs in an
`updateEntity` process action.

`getEntityConstruction()` has no generic-create fallback. It returns the explicit
construction contract or `null`, so construction presence is the canonical
create signal: an entity is process-creatable only when it declares an explicit
construction entry. Excluded entities fall into two documented classes. Meta
admin/config master data are authored or provisioned outside the process graph
(`artifact_template`, `facade_pattern`, `layer_standard`, `machine`,
`organization`, `pen_template`, `process_definition`, `profile_template`,
`tool_profile`, `user`). System- or command-produced records are created by
their owning service or task, not by a process create action (`entity_revision`,
`geometry_capture`, `nesting_run`, `sheet`, `sheet_design`). `cassette_instance`
is deliberately absent from the construction registry: instances are derived at
nesting time through the `cassette-instances` service
`createFromSheet`/`createFromCutSheet` constructors, not authored from an empty
process graph. The explicit creatable entities are `artifact` (upload
constructor), `cassette`, `cassette_design` (typed bake/import constructors),
`catalog`, `color`, `facade`, `library`, `material`, `material_pile`,
`project`, `queue`, `remnant`, `requisition`, and `warehouse`.

`profile_template` is reusable master data for OCCS profile-section sketches.
Cassette templates insert profile workpieces as snapshots with a
`profileTemplateId` reference so old templates remain reproducible when the
library profile changes.

## UI Boundary

This package may declare UI policy: entity surface keys, status visibility,
icons, docs, component paths, field groups, surface contracts, and field paths.
It must not import Vue components. `@perigram/vue` turns this metadata into
frontend lookup helpers.

Entity icons are CSS class strings. CNC production entities (cassette
template/design/instance, sheet design/instance, remnant) use the
`ck-entity-icon-*` classes of the generated `ck-entity-icons` icon font (built
from `public/icons/data-model/cnc-domain/*.svg` into `public/fonts/` by
`npm run icons:build`, classes emitted into `assets/css/main.css`); they
render in `currentColor` anywhere a PrimeIcon class is accepted. All other
entities use PrimeIcon (`pi pi-*`) classes.

`cncBlockFieldSchemas` projects the explicit framework-owned
`CANONICAL_BLOCK_SCHEMAS`; it is not generated from entity field inventories.
Fixed blocks expose their fixed fields. `cncBlockComposition` declares how open
blocks are authored as typed named entries, so entity-specific paths never
accumulate into a global selector and users never have to manufacture a raw
map. Lineage and Relations rows do not aggregate domain relationship names into
global selectors. Relations derive their key, referenced entity type, and
cardinality from the connected entity socket. Lineage resolves its key from the
consumer's declared containment ancestry, so a consuming Create/Modify node can
validate a generic Lineage block without teaching the block composer about that
consumer.
`cncEntityFieldSchemas` separately declares which of those fields belong to an
entity and whether they are readable, writable, or constructible. The registry
also preserves framework structural capabilities: `identity.uid` remains
readable for inspection but is excluded from Compose/Modify Block because uid
generation belongs to the owning feature service. The registry
keeps intrinsic arrays (`base: array` plus `itemType`) separate from process
packet shape (`item`, `list`, or `tree`), so a field containing entity refs does
not turn one composed block into a list of blocks.
`field-access.js` wildcards authorize families of fields but never generate a
selectable field or a guessed type. A new process-visible field must therefore
be added to the structural registry (normally through its UI descriptor or an
explicit exact access entry) before record, predicate, or patch nodes can use
it.

Every command and task entity output is declared as a per-output record
`{ type, persistenceOwner, timing }`. `persistenceOwner` is `commandOwned`
when the registered command/task business boundary persists the entity (all
current CNC outputs) and `graphOwned` when the result only carries raw
construction data for an explicit Create/Modify Entity graph node. `timing` is
`immediate` for outputs present in the synchronous command return and
`completion` for outputs that only exist after the queued task finishes —
`solveNesting` declares `nesting_run` immediate while `sheet_design` and
`sheet` are completion outputs of `nesting.solve`. The legacy
`requiredEntityProfiles` requirement key is gone; result boundaries enforce
the per-output contract (see `server/core/commands/README.md`).

Display constructor metadata is split from access policy:

- `ui-fields.js` is the RESIDUAL fact vocabulary, reduced by the live-type
  audit to the artifact family only: `artifact_template` keeps its rows
  because the artifact family is undeclared master data that Phase 7 cuts
  later (`artifact` itself is framework-declared and resolves from the
  bundle). Every other key — the retired production family (project, queue,
  nesting run, sheets, remnants, catalog, …) and the master-data leftovers
  whose surfaces are gone — was deleted with the legacy fact channel;
  nothing new may land here (declare the type instead). Every declared type
  carries its fact vocabulary as field descriptors on the declaration,
  compiled into the served client bundle and resolved by
  `utils/instance-display-contract.js` (`factsFor`) as the only fact source.
  Descriptor vocabulary, child-count roles, and preview-backed galleries are
  identical in both homes.
  Aggregate child-count facts may also mark `role: 'childCount'`; generated
  cards use that metadata together with explicit `summary.*Preview`
  `entityRefList` fields to swap a numeric count for a compact child gallery.
  Color summary facts declare the hex swatch through
  `display: 'swatch'`, which `DataBlock` renders as a color dot beside the
  value.
- `ui-surfaces.js` declares the design-system surface chrome vocabulary and
  the per-entry chrome contracts (preview mode, data display, relations,
  actions, status, trace per surface: inline, compact, card, detail) that
  the UI lab manifest validates. It consults no field-group table and pins
  no per-key group lists — which GROUPS a surface shows is class-level
  generic policy at resolve time in `utils/instance-display-contract.js`
  (cards are recognition surfaces: preview, identity, and the leading
  summary facts with relation chips; production internals and revision
  provenance render only on the detail surface). The legacy per-key
  synthesized-group overrides (queue, catalog, geometry capture, warehouse,
  the nesting-run special case) are deleted.
- `field-access.js` remains the hard visibility boundary. A field group path
  that is not covered by field access must fail validation instead of rendering
  through a component-local escape hatch.

Field access is also declared here. `cncEntityFieldAccess` maps each entity UI
key to a feature permission and read/write/admin field path lists. Runtime code
treats missing policy paths as hidden, so adding a card field requires adding a
matching field policy entry instead of relying on ad hoc component checks.
Derived entities with their own collections must use their exact feature key in
field access. For example, `cassette_design` records use
`cassette_designs`, not the broader `cassettes` template feature, so generated
process screens, DTO redaction, and process grants all target the same entity
collection.
The user policy intentionally exposes team-list identity fields (`identity`,
`data.email`, role, and membership summary) at `users:read`, while copied
permission JSON remains admin-only compatibility data.

Entity definitions may declare operation capabilities such as
`operations.delete`. Generated UI uses those capabilities together with
process-derived access grants before showing destructive controls. A delete
button requires both the domain capability and an active `delete`/admin grant
for the exact entity; endpoint presence alone is not enough.

The process capability matrix is derived from four domain signals, never from
inferred collection presence: construction presence means create,
`operations.delete` means hard delete, a workflow `ARCHIVED` state means archive,
and the runtime service `processUpdate` method means update. The canonical
projection that combines these signals with the explicit runtime bindings lives
in [`packages/processes`](../processes/README.md)
(`projectEntityProcessCapabilities`); this package owns only the domain half of
that derivation.

Entity definitions may also declare `meta: true` for configuration,
administration, or provenance records that are not operational work items.
Current meta entities include users, organizations, process definitions,
entity revisions, layer and pen standards, tool profiles, and profile
templates. The process compiler keeps their access grants but does not infer
generated list/detail work screens for them. Explicit organization/system
templates remain responsible for placing those management surfaces.

## Related

- [@perigram/core](../core/README.md)
- [Runtime registry](../../server/runtime/README.md)

## Pack direction (SPEC §21)

This package is the CNC plug-in. Its type-system content is
`src/pack.js`: the cassette (OCCS payload with preview mode `occs`,
cassette-designer editor), sheet design, and facade design file types,
the nesting solver service registration (`cncServices`: `nesting.solve`,
whose declared signature is the honest contract of its bound command
handler — the parameter names match one-to-one), and the OCCS attachment
kind —
browser-safe data mounted by `server/packs/cnc`. Generated surfaces
serve cassettes through the generic instance transport: the OCCS
document is the instance payload (previewed and edited through the
unified file contracts in
[components/generated/README.md](../../components/generated/README.md)),
and only the legacy UI surfaces keep the cassette feature routes. The
legacy entity/workflow/construction tables are
not part of the process path: the CTS projection does not read them, the
designer palette does not offer them, and the runtime serves none of
them. They remain as pack-internal content for the non-process surfaces
that still import them (editors' feature modules, the legacy UI
fallbacks) and shrink as those surfaces are deleted.

`cncEditors` is the canonical editor-binding contract of the pack: one
`{ type, surface, modes }` record per file type that has an authoring
surface. Cassette binds `cassette-designer` (create/edit), sheet design
binds `sheet-design-editor` (create/edit), facade design binds
`facade-designer` (create/edit), and the facade pattern graph binds
`facade-pattern-designer` (edit) — the pattern designer keeps its
pack-internal feature route for persistence, the cassette pattern; the
`facade-pattern` file type itself (`name`, `graph`) serves the registry
and generated-surface layer, and legacy `facade_patterns` records are
abandoned data (SPEC §19). The editing surface receives the instance
plus the caller's resolved write grant, exactly like the legacy
sheet-design detail overload did. The bindings are served with the
organization type view by the cts-types feature and drive the app's
generated surface registries through
[components/generated/file-surfaces](../../components/generated/README.md);
they must not be restated as entity-keyed maps anywhere else.
