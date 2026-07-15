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
`materialPool`). `solveNesting` creates a live `task_run`; the
`nesting.solve` task creates a terminal queue `entity_revision`, canonical
`sheet_design` entities, and the required `sheet_instance` digital twins.
DXF/SVG/PDF files are requested later through artifacts and `AttachmentKind`
contracts.

`relations.js` is the ownership source of truth. Nesting outputs persist a
structured queue reference with the terminal revision id. Queue revisions and
sheet designs are rendered by the specialized queue revision surface rather
than generic child regions, because only the explicitly selected successful
revision is current.
It also declares `cassette` as a `library` child through
`lineage.library`. Libraries are organization-scoped containers for cassette
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
Queue nesting is a parallel Status region with `IDLE`, `RUNNING`, `REVIEW`,
`SELECTED`, and `ERROR`. `requestNesting`, `nestingSolveCompleted`,
`nestingSolveFailed`, and `selectNestingRevision` are intents on that region.
The Status lifecycle block owns active/latest/selected revision pointers;
queue data does not duplicate them.
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

`entity-construction.js` declares create-time construction contracts. These are
not authorization rules and not display fields. A construction contract names
the supported construction modes and required inputs for each entity type:
ordinary entities use `genericCreate`, while derived entities such as
`cassette_design` use a typed mode (`bakeCassetteDesignFromTemplate`) so the
runtime can call the correct construction service and preserve editor
contracts. `cassette` templates also use a typed constructor,
`createDefaultOccsTemplate`, which requires a prompted name and creates a full
default OCCS template document instead of an empty generic row.
`artifact` uses `createArtifactFromAttachment`; its required attachment input
supports upload and device capture through the generated form contract.
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
`entity-create-inputs.js` projects those construction contracts into
process-designer data sockets for older imports; new code should read
`cncEntityConstruction` directly. Post-creation data mutation belongs in an
`mutateEntity` process action.

`profile_template` is reusable master data for OCCS profile-section sketches.
Cassette templates insert profile workpieces as snapshots with a
`profileTemplateId` reference so old templates remain reproducible when the
library profile changes.

## UI Boundary

This package may declare UI policy: entity surface keys, status visibility,
icons, docs, component paths, field groups, surface contracts, and field paths.
It must not import Vue components. `@cutkit/vue` turns this metadata into
frontend lookup helpers.

Display constructor metadata is split from access policy:

- `ui-fields.js` declares reusable entity field groups such as summary,
  geometry, stock, production, relations, and provenance.
  Aggregate child-count facts may also mark `role: 'childCount'`; generated
  cards use that metadata together with explicit `summary.*Preview`
  `entityRefList` fields to swap a numeric count for a compact child gallery.
  Current preview-backed replacements include project queues, library
  cassettes, and catalog colors. Queue revisions and selected sheet designs are
  owned by the specialized queue revision panel, not summary preview rollups.
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
## Entity Classification And Relations

Entity definitions use `meta: true` for organization/system configuration such
as users, machines, tools, pens, and layer standards. The process compiler does
not infer operational list/detail screens for these types; organization and
asset templates own their UI. Operational entities remain eligible for
generated screens.

`cncRelations` is the source of truth for ownership. A `containment` relation
declares parent/child types, `lineageRole`, collection `filterKey`, and display
policy. Generated top-level child lists receive a missing-lineage filter;
parent details load the same relation through the concrete parent id. A
specialized surface may set `display.parentDetail: false` when it applies a
stricter selector, as queue revisions do.

Lineage roles are `{ entityType, entityId, revisionId? }`. `link` relations are
non-owning references stored under the root `relations` block with the same
shape. Project-to-library and artifact-to-source are current examples: targets
remain top-level entities. Text references use
`entityType/entityId@revisionId`, with the revision suffix optional.

## Nesting Resources And Outputs

`solveNesting` serializes the selected machine work area and boundary offsets,
tool diameter/kerf, material, and sheet thickness. The tool diameter is the
placement gap. Material thickness overrides cassette parameter `T` before
parametric baking.

Equivalent layouts produce one `sheet_design` and one or more planned
`sheet_instance` records. The terminal queue revision stores output entries
with design id, layout hash, quantity, and instance ids. Every output has
revision-qualified queue lineage, and each instance has revision-qualified
sheet-design lineage. Live execution remains in `task_runs`; there is no
`nesting_run` entity.
