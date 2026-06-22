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
- `ui.js` - design-system policy metadata, not Vue components.
- `index.js` - public exports and aggregate `cncDomain`.

## Vocabulary

Commands are the access/business intent boundary. Tasks are retryable async
execution. Attachments are persisted entity-linked file records; attachment
kinds declare how a file should be stored and previewed.

The `solveNesting` command accepts virtual-sheet parameters or warehouse
material context (`materialMode: WAREHOUSE`, `inventoryItems`, and normalized
`materialPool`). `solveNesting` and the `nesting.solve` task produce
`nesting_run` and `sheet_design` entities only. DXF/SVG/PDF files are requested
later through the artifacts service and `AttachmentKind` contracts, not as
primary nesting-run outputs.
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

`entity-create-inputs.js` declares create-action data sockets. These contracts
are operation inputs, not display fields: process create nodes use them to show
which data must arrive to create an entity, while post-creation data mutation
belongs in a separate action contract.

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
- `ui-surfaces.js` declares which groups and display modes belong to surfaces
  such as inline, compact, card, and detail.
- `field-access.js` remains the hard visibility boundary. A field group path
  that is not covered by field access must fail validation instead of rendering
  through a component-local escape hatch.

Field access is also declared here. `cncEntityFieldAccess` maps each entity UI
key to a feature permission and read/write/admin field path lists. Runtime code
treats missing policy paths as hidden, so adding a card field requires adding a
matching field policy entry instead of relying on ad hoc component checks.
The user policy intentionally exposes team-list identity fields (`identity`,
`data.email`, role, and membership summary) at `users:read`, while copied
permission JSON remains admin-only compatibility data.

## Related

- [@cutkit/core](../core/README.md)
- [Runtime registry](../../server/runtime/README.md)
