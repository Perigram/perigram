# COMPONENT: @cutkit/domain-cnc

CNC domain implementation package. It owns manufacturing vocabulary and
contracts, but imports no Vue, Nuxt, MongoDB, or worker implementation code.

## Modules

- `entities.js` - CNC entity definitions.
- `workflows.js` - entity lifecycle machines and transition hooks.
- `effects.js` - effect policy declarations consumed by the runtimes.
- `commands.js` - business intent contracts: `saveCassetteTemplate`,
  `solveNesting`, `generateAttachment`, `generateConfigBotDraft`,
  `reindexConfigBotKnowledge`.
- `tasks.js` - async task contracts: DXF parsing, cassette baking, nesting
  solve, attachment generation, and geometry capture extraction.
- `attachment-kinds.js` - file/blob kinds, buckets, MIME types, preview modes.
- `hooks.js` - typed transition hook parameter contracts.
- `summaries.js` - aggregate summary contracts and frontend route metadata.
- `field-access.js` - per-entity field visibility policy consumed by backend
  DTO redaction and frontend shared blocks.
- `field-schemas.js` - exact process-programming field paths with canonical
  blocks, structured value/shape/domain/unit types, and read/write capability.
  `origin.timestamp` and `status.timestamp` are date-time values, so process
  date operations preserve their time component when scheduling from a
  lifecycle entry.
- `entity-construction.js` - create-time construction contracts used by process
  action nodes and generated action dialogs.
- `ui.js` - design-system policy metadata, not Vue components.
- `index.js` - public exports and aggregate `cncDomain`.

## Vocabulary

Commands are the access/business intent boundary. Tasks are retryable async
execution. Attachments are persisted entity-linked file records; attachment
kinds declare how a file should be stored and previewed.

The `solveNesting` command accepts virtual-sheet parameters or warehouse
material context (`materialMode: WAREHOUSE`, `inventoryItems`, and normalized
`materialPool`), plus a selected machine and tool profile. The machine supplies
the working-area preset and boundary offset; the selected material source still
supplies the actual sheet size/thickness, and the tool profile supplies kerf.
For parametric queue items, material thickness updates the queued `T` parameter;
the nesting handler uses the source cassette provenance to evaluate
request-local worker geometry when that parameter snapshot differs from the
saved baked geometry. It does not create another persisted cassette design for
that nesting run.
`solveNesting` and the `nesting.solve` task produce
`nesting_run` and `sheet_design` entities only. DXF/SVG/PDF files are requested
later through the artifacts service and `AttachmentKind` contracts, not as
primary nesting-run outputs.
`summaries.js` declares both `nesting_run` and `sheet_design` as queue children
because nesting output access, generated queue detail regions, and aggregate
summary sync all use the same lineage relation contract. Services that create
those outputs must persist `lineage.queueId` and, when available,
`lineage.projectId`.
It also declares `cassette` as a `library` child through
`lineage.libraryId`. Libraries are organization-scoped containers for cassette
templates that share `data.material`; summary sync writes
`summary.cassetteCount` on the parent library.
`field-access.js` keeps `sheetDesign` on the `sheet_designs` access feature.
Queue lineage scopes can restrict which layouts a user sees, but queue grants
do not replace explicit sheet-design output grants from the active process.
Queue workflow UI actions start with `DRAFT -> NESTING`; any system-only
`DRAFT -> READY` recovery transition is marked `display: 'hidden'` so operators
cannot skip nesting from status controls. Queues can be moved to `ARCHIVED`
from any current queue state through a menu transition; admin users can restore
archived queues to `DRAFT`.
CNC workflows export the v2 workflow contract from `@cutkit/workflows`. Current
CNC lifecycles use a single `main` region, so persisted entity status stores
`status.state.primary` plus `status.state.active.main`; future independent
lifecycle axes should add regions instead of overloading the primary state.
Organization process definitions can compile entity profile lifecycles into
runtime workflows that override these domain defaults for that organization.
The domain workflows remain the fallback and starter-template source.
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
`generateAttachment` is a polymorphic command: its process-designer contract is
one abstract `Attachment source` input with `attachments.generate` capability
and accepted source types.
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
contracts. Cassette creation supports only `createDefaultOccsTemplate`: a
process-created cassette is an editable OCCS template, never a shallow entity
with `data.definition: null`. The constructor accepts a template name and owns
the complete starter OCCS document.
When a `cassette` create action is connected to a `library` parent, the process
runtime sends `libraryId` to that typed constructor so the resulting template
is stored as a child of the library.
Queue creation is intentionally a shell creation contract: `jobItems`,
`materialPool`, and nesting parameters are optional construction inputs because
queue composition belongs to the queue editor and nesting command readiness
checks, not to the initial create action dialog. Queue creation still requires
a prompted `name` input so process-generated queues do not enter the system as
unnamed shells.
`cassette_design` creation uses `bakeCassetteDesignFromTemplate` with a
prompted `name`, a source `cassette` template, and typed `cassetteParameters`.
The frontend must derive those parameter controls from the chosen cassette's
OCCS definition instead of asking users to enter a raw object string.
`producers.js` declares source categories that can provide derived entities to
workspaces and fixed construction services at runtime. These declarations do
not become one-off process palette nodes. Queue UI resolves the domain
producers and binds matching process actions at runtime instead of hardcoding
page-local source buttons.
`entity-create-inputs.js` projects those construction contracts into
process-designer data sockets for older imports; new code should read
`cncEntityConstruction` directly. Post-creation data mutation belongs in an
`updateEntity` process action.

`profile_template` is reusable master data for OCCS profile-section sketches.
Cassette templates insert profile workpieces as snapshots with a
`profileTemplateId` reference so old templates remain reproducible when the
library profile changes.

## UI Boundary

This package may declare UI policy: entity surface keys, status visibility,
icons, docs, component paths, field groups, surface contracts, and field paths.
It must not import Vue components. `@cutkit/vue` turns this metadata into
frontend lookup helpers.

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

Commands that persist an entity hierarchy beyond their immediate return refs
declare `requiredEntityProfiles`. `solveNesting` requires `nesting_run`,
`sheet_design`, and physical `sheet` profiles, and declares all three output
entity types because task completion persists all three.

Display constructor metadata is split from access policy:

- `ui-fields.js` declares reusable entity field groups such as summary,
  geometry, stock, production, relations, and provenance.
  Aggregate child-count facts may also mark `role: 'childCount'`; generated
  cards use that metadata together with explicit `summary.*Preview`
  `entityRefList` fields to swap a numeric count for a compact child gallery.
  Current preview-backed replacements include project queues, queue runs,
  queue sheets, nesting-run sheet designs, library cassettes, and catalog
  colors. The nesting-run `card` surface includes the `production` group so
  generic card and popup surfaces can render `data.sheetDesignIds` as a
  relation gallery; custom nesting-run cards still filter that group to sheet
  designs so material source context stays in its dedicated source section.
- `ui-surfaces.js` declares which groups and display modes belong to surfaces
  such as inline, compact, card, and detail.
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

Entity definitions may also declare `meta: true` for configuration,
administration, or provenance records that are not operational work items.
Current meta entities include users, organizations, process definitions,
entity revisions, layer and pen standards, tool profiles, and profile
templates. The process compiler keeps their access grants but does not infer
generated list/detail work screens for them. Explicit organization/system
templates remain responsible for placing those management surfaces.

## Related

- [@cutkit/core](../core/README.md)
- [Runtime registry](../../server/runtime/README.md)
