# COMPONENT: Instances

Generic per-class instance services ([packages/cts/SPEC.md](../../../packages/cts/SPEC.md)
§13, §16). One service
serves every type that has no hand-registered feature service — pack types
and org-authored types — so the type system is executable without
hand-written services.

Parent: [server/features](../README.md).

## Contract

- Storage: per-class collections (`files`, `items`, `groups`, `processes`)
  with the type id as discriminator; documents carry the §3 stored shape —
  `type`, `typeVersion`, `name`, flat `fields`, the flat `state` string and
  its `stateChangedAt` entered-state clock (the deadline clock, SPEC §7),
  `lineage` (pure tree edges), `relations`, the top-level
  `organizationId` tenancy slot, `payload` (iff the type declares payload
  traits), and `provenance` (set by the construct boundary, never
  patched). Declared ref fields follow SPEC §6's one relation grammar
  and store under `relations.<name>`, the same slot explicit relation
  edges use; `fields` carries row values alone. The create and update
  boundaries refuse ref values under `fields`. **The wire DTO is this stored document verbatim** (owner
  decision 2026-10-11: ids JSON-safe). `organizationId: null` marks a
  system instance
  (pack-seeded reference catalogs): read-admitted beside org rows in
  every organization's list, written only by seeding/admin paths. Org
  customization of a system instance is an org-authored instance
  shadowing it by declared key (e.g. `code`), never a mutation of the
  system row. Naming follows SPEC §4: the stored `name` slot is the
  explicit rename channel; upload/capture constructs fill it from the
  uploaded file's name (extension stripped) when the draft carries
  none, and the declared identifier row's value resolves
  client-side through the display contract (`titleFor`), staying in its
  row. The lineage chain derives at `createValidated`: each authored parent axis
  must match a declared `children` edge for the child type and resolve an
  instance of that parent type in the same organization or system scope.
  The parent's ancestor axes are inherited, authored ancestor axes win,
  and ref objects scalarize to ids. Process updates apply the same parent
  edge and scope checks to changed lineage axes and store scalar parent ids.
  `organizationId` remains the top-level tenancy slot.
- Type migration executor (`migrations.js`): runs a covered `migrate` step
  set against the type's persisted instances when
  [cts-types](../cts-types/README.md) lands a breaking redefinition.
  Contract: a total scan of the type's per-class collection in the org
  scope; every behind instance transforms through all steps in one pass;
  the whole `fields`, `lineage`, and `states` axis maps are written back
  per document; the doc then takes the new `typeVersion` stamp, so
  re-running skips finished documents (idempotent resume); each rewrite
  publishes the shared typed invalidation event with reason
  `type-migration`; the summary (per-step counts, failures) returns to
  the caller for the declaration's `migrated` record.

  | Step | Rewrite |
  |---|---|
  | `rename-enum-value` | the exact axis/path and descendant prefixes |
  | `rename-field` / `remove-field` / `add-default-field` | flat `fields` |
  | `retype-field` | flat `fields` through a CEL expression over `{ value }`, step-budgeted |
  | `remove-edge` | the removed entry's stored lineage key out of `lineage` (SPEC §11: children of the edge become roots) |

  `remove-edge` steps whose declared child types are OTHER types detach
  those children in their own collections through the caller's
  `collectionForType` resolver — an in-place `$unset` that leaves the
  child's `typeVersion` untouched; the declaring type's own documents
  (self-containment) ride the normal stamped pass.
- Payload (SPEC §3/§4): create accepts a `payload` reference shaped
  `{ fileId, mime?, size?, name? }`. The reference is validated against
  the type's declared payload traits at construct (fileId required;
  `mime` must be in the declared list; `size` within `maxSize` when both
  are known — the shared `payloadAccepts` predicate from
  [packages/cts](../../../packages/cts/README.md)) and stored as the §3
  payload slot. Payload blobs live in the `files` GridFS bucket — the
  §3 Blob home; the wire payload reference carries no bucket by design.
  Payload, tenancy, and provenance are immutable after construct:
  `processUpdate` ignores their keys.
- Provenance (SPEC §3/§8): create accepts `provenance` shaped
  `{ op, sources: [{ type, id }], effective }` and stores it verbatim as
  the causal record. The process effect boundary stamps it for every
  process-constructed instance: `op` names the effect node and its
  construction mode, `sources` collects the typed entity construction
  inputs plus the run-context entity, and `effective` carries the via
  mode, resolved construction parameters, and target state — the
  replay-safety inputs of the conversion that ran.
- Declaration resolution per call: framework and pack types from static
  declarations, org types from `cts_types` (cached;
  `invalidateInstanceDeclarations` on writes). The cached accessor is
  exported as `declarationForType(typeId, organizationId)` for sibling
  features — the workflow-overrides declaration-machine fallback reads it,
  so its cache invalidation rides the same write hooks;
  `staticTypeDeclaration(typeId)` is the synchronous static-only twin.
  Both return raw declarations; callers normalize for their own use.
- Service surface: the feature-service shape (getById/list/create/
  processUpdate/remove) plus the process bindings (processList,
  processGetById, processDelete, processCapabilities, and construction
  handlers: `genericCreate` plus the payload creation protocols
  `upload`/`capture`/`editor`/`content` declared on payload types — upload and
  capture require a payload reference (validated by the construct-time
  trait checks), editor constructs a blank instance whose first editor
  save fills the payload, and content stores the wired or prompted text
  as the payload blob at construct (SPEC §4).
  Wire patches map to §3 writes (tenancy is
  immutable after construct).
- List filters (the compiled screen-source transport contract, the same
  vocabulary the feature routes speak — cassettes' `libraryId`):
  `list`/`processList` accept the flat scalar filter map defined as the
  projection of the canonical instance-filter tree
  ([shared/instance-filters](../../../shared/instance-filters/README.md)).
  `filters.js` normalizes the map with the registry-derived declared
  lineage-key gate — a bare key applies as `lineage.<key>` iff some
  parent's declared children edge stamps that lineage key for the listed
  type (the derivation walks the same view the derived indexes walk:
  static pack declarations plus the organization's stored declarations,
  cached per organization beside the declaration cache and invalidated
  with it) — then projects the tree onto the stored §3 paths
  (ObjectId-shaped lineage and `_id` values match both stored id forms;
  undeclared keys are dropped at normalization). This is
  what scopes an org-authored parent detail's child collection to the
  opened parent.
- Payload replacement (`replacePayload`, the editor concern SPEC §3
  names): multipart file in, validated against the declared payload
  traits through the same construct-time checks, stored in the `files`
  bucket, recorded as an immutable `entity_revision` under the type's
  declared `revisions` scope (revision attachment metadata carries the
  bucket), then swapped into the payload slot. Refused when the type
  declares no payload or no revision scope. `PUT
  /api/instances/:type/:id/payload` is the transport; it gates through
  the shared access engine on the class-collection feature (the same
  feature `resolveInstanceFeature` compiles grants against) with the type
  id as the type-id filter, so a write requires a compiled process
  grant — fail-closed.
- Version fabric (SPEC §24): every payload write on a revision-scoped
  type records an immutable revision through `recordPayloadRevision` —
  creation mints revision 1 (`created`), replacement and re-derive bump
  (`payload-replaced`, `rederived`), and restore mints
  (`payload-restored`). Every mint stamps the acting principal
  (`data.actor`, the status-events stamp shape); every write past
  creation also appends a `payload_revision` record to the source
  record's `status_events` audit trail (reason, revision ref, restore's
  source ref) beside transitions and field edits. `rederive(id, mode,
  { provenance })`
  is the construct re-run: it rebuilds the stored-inputs draft
  (`storedConstructionDraft`), executes the bound construction service
  against the refs' pinned revisions, and patches the same instance's
  fields, payload, and provenance under the same access gate as payload
  replacement.
- Revision restore (`restorePayloadRevision`, SPEC §24 restore-as-new):
  a prior revision's frozen bytes re-enter through the payload channel
  as a new revision — the bytes are read from the revision's primary
  attachment and re-run `replacePayload` with reason `payload-restored`
  and `restoredFrom: { id, number }` naming the restored revision, so
  trait validation, storage, revisioning, and the write gate are the
  replacement path's own. The revision must belong to the target record
  and the type's declared revision scope; anything else refuses 400.
  `POST /api/instances/:type/:id/restore-revision` with
  `{ revisionId }` is the transport.
- Field updates (`patch`): `PATCH /api/instances/:type/:id` carries the
  `name` rename channel and declared `fields` leaves through the §3
  mapping. Structural lineage and relation changes use their validated
  edge-write boundary; state writes remain status-runtime owned. HTTP
  relation link/unlink and authorized delete run in a Mongo snapshot
  transaction, so target checks, revision CAS, relation-ref cleanup, persisted
  field-change events, and organization sequence updates commit or abort
  together. In-memory refresh hints publish only after a successful commit.
  It gates through the shared access engine exactly like the payload
  transport (write level on the class-collection feature, type-id filter —
  fail-closed). This is the generated detail surfaces' inline-edit
  persistence path; the process effect boundary keeps its own
  `processUpdate` with execution auth. Both paths land in `processUpdate`,
  which rejects field ids absent from the resolved CTS declaration, validates
  changed relation slots against declared targets/cardinality/domain and
  lineage slots against declared parent edges and same-organization parents, and
  enforces the current state's field policy (CTS SPEC §7 `fieldPolicy`): when the
  resolved workflow declares `visible`/`editable` whitelists for the
  instance's state, row-field writes outside them fail with 409. The
  workflow resolves through
  [workflow-overrides](../workflow-overrides/README.md) — the same seam
  the status runtime uses; vocabularies without authored facets write
  unrestricted and read no instance document. Every patch carries the
  source `updatedAt` into its final compare-and-swap filter; a concurrent
  edit returns 409. Internal patch callers may also supply
  `expectedRevision`; stale proposals return 409, including after a
  constrained update's fresh validation read.
- Creates (`createForHttp`): `POST /api/instances/:type` carries the §3
  draft `createValidated` stores (the `name` rename channel, flat
  `fields`, `lineage` edges, payload references) under the same
  access-engine gate as `patch`. This is the server side of the
  contract-2 `records` host capability — editors composing other types'
  records (the facade plugin's profile library writes ride it). The
  construct boundary keeps its own `create` with execution auth;
  framework feature types keep their feature create routes (no
  `createForHttp`, the generic route 404s for them). Draft fields must be
  declared. A bound construction executor may add only the exact field keys
  returned by its service output; those keys travel through a private
  in-process marker, while caller-supplied undeclared fields remain rejected.
- Remove transport (`DELETE /api/instances/:type/:id`): the record death
  behind the same write gate `patch` takes (`removeForHttp` loads the
  entity and checks the compiled grant — fail-closed), completing the
  generic instance transport the client store speaks. The remove path
  sweeps
  relation refs (SPEC §22.12: a dangling ref is a defect): every
  declared relation edge targeting the type — explicit `edges.relations`
  entries and ref fields alike, derived over the same per-org view the
  lineage keys use — has its referrers' `relations.<key>` slots
  rewritten; a single ref nulls, an array drops its matching entries. A system
  target (`organizationId: null`) sweeps every org over the static
  view's edges; each swept referrer publishes the shared entity event
  with reason `ref-sweep`.
- Write-gate delegation (`access.inherits`): a type may authorize its
  record writes by another type's grant — the declaration's
  `access: { inherits: <typeId> }` (listing grammar; the parent must be
  a type the same plugin declares) re-scopes the `patch`/`createForHttp`
  gate to the parent's feature and type id, one hop, no chains; an
  unresolvable parent refuses fail-closed. Types that exist only beside
  a parent (the facade `profile` library beside cassettes) inherit that
  parent's rights.
- Registration: the core registry's entity-service resolver consults
  `instanceServiceResolver`; explicit feature services always win.

`linkRelationForHttp` and `unlinkRelationForHttp` are the authorized structural relation-write boundaries, exposed as `POST` and `DELETE /api/instances/:type/:id/relations/:key`. They validate the declared edge/ref field, accepted target type, one/many cardinality, duplicate/missing targets, target-domain predicates, organization scope, and expected owner revision. An optional non-negative `expectedOrganizationSequence` fences the write against a preview read set. The routes pass one snapshot-transaction session through target reads, relation writes, and the organization sequence update.

## Organization change sequence (SPEC §28)

`organization-sequence.js` owns the durable per-organization mutation boundary. Snapshot transaction mechanics live in [the database layer](../../db/README.md#files). Every authoritative write reserves a pending token before mutation and advances the sequence only after the write succeeds. Failed writes release their reservation; readers fail closed while writes remain pending. `runOrganizationChange` accepts a Mongo session and an expected sequence. Constraint-bearing creates, updates, relation mutations, deletes, payload writes, and lifecycle transitions capture the sequence before validation and reserve it exclusively for the write; the expected-sequence form reserves only when the sequence matches and the pending count is zero, then holds an exclusive token. Ordinary writes cannot begin while that preview-based reservation is held; completion or cancellation releases it. Instance insert/update repositories pass the same session to their writes. Type-migration batches (`migrations.js`) run inside the invoking declaration mutation's reservation — `defineType` in [cts-types](../cts-types/README.md), plugin upgrades in [plugins](../plugins/README.md) — and advance the sequence once per batch. `withOrganizationDataSnapshot` runs reads in a Mongo snapshot transaction where supported, passes its session through the generic list/detail repository reads, and checks the organization sequence before and after. It retries changed boundaries and falls back to `withOrganizationChangeSequence` when snapshot transactions are unsupported. `withOrganizationChangeSequence` is the sequence-bracketed fallback. New mutation paths use `runOrganizationChange`; `recordOrganizationChange` remains for legacy write paths during migration.

## Derived indexes (SPEC §13)

`indexes.js` owns the registry-derived index set — no hand-mirrored index
list exists. `deriveInstanceIndexes(view)` is pure over the organization's
registry view; `ensureInstanceIndexes(view)` applies every definition
idempotently (`createIndex`):

- per class collection in use: `{ type, organizationId, createdAt }`
  (list ordering) and one `{ type, organizationId, 'states.<axis>' }` index
  for every declared state axis;
- per declared children edge, on each child type's class collection:
  `{ type, organizationId, 'lineage.<lineageKey>' }` — the edge's declared
  storage key (see `packages/cts/SPEC.md` §6), not the entry's map key;
- per declared relation — an explicit edge or a ref/list-of-ref field — on
  the owner's class collection: `{ type, organizationId,
  'relations.<key>' }`.
- per declared unique constraint, on `fields.<path>`: an exact, simple-collation
  unique index scoped globally or to the owning organization. Missing values
  are excluded by a scalar-type partial filter; duplicate writes return 409.

Type declarations and process activation are the write paths that can
change the view, so `defineType`/`removeType` (cts-types) and activate
(process-definitions) re-derive after their writes.

## Related

- [server/runtime/README.md](../../runtime/README.md) — resolver registration.
- [server/features/cts-types/README.md](../cts-types/README.md) — org type storage.

## Service-backed construction (installed plugins)

`construction-services.js` dispatches construction modes with no standard
protocol — and the compute half of the payload protocols — to the
organization's installed-plugin services: the operator's input record
travels to the executor with ref inputs resolved to values (`{ id, name,
fields, payloadBase64 }`, cross-org references refuse) and the draft's
uploaded payload as base64; a `list` input whose `itemType` is a `ref`
resolves item by item into an array of those same values; the executor
returns computed field values
the platform merges before creating the record through the generic
machinery. The executor may also return `payload: { base64, mime,
name? }`: the bytes are stored in the `files` bucket and become the
created instance's payload — validated through the same construct-time
trait check every wire payload reference takes (`payloadFromWire`), the
stored blob deleted on refusal; an executor payload overrides the
draft's uploaded one. A refusal may be structured (SPEC §24): the
executor answers `{ failures: [{ name?, message }] }` naming its
offenders, and the platform refuses the construction with the same body
on the error's `data.failures` — the create dialog renders the list.
Template fills ride this shape (SPEC §24): a
`template` ref input plus wired values in, the filled file out.
`POST /api/instances/:type/construction-preview` runs the same service
over `{ mode, draft }` with nothing persisted: it answers `{ payload:
{ base64, mime, name? } | null, fields, meta? }` (the fill dialog's
composed preview; `meta` is the executor's ephemeral channel, verbatim),
204 when the org binds no service for the mode, or the same
structured refusal; the create write gate applies.
`constructionHandlers` reports every mode as served (the
capability projections filter on it); genuinely unbound modes fail
loudly at dispatch. Types that declare construction modes never offer a
bare `genericCreate` — the per-call declaration check refuses it.
Executor-declared relation arrays are relation slots: refs duplicate by
type+id collapse to the first, so a computed per-placement list stores
each target once.

See [plugins](../plugins/README.md) for the listing grammar and
[workers/facade](../../../workers/facade/README.md) for the reference
executor.

Ref resolution stamps the version fabric (SPEC §24): every resolved ref
of a revision-scoped source type pins the revision it read — a declared
ref field on the constructed record stores `{ type, id, revision }`
under `relations.<key>`, and the causal refs in `provenance.sources`
carry the same `revision` slot. A source type without a revision scope
(a payload-less geometry record) stores `{ type, id }`; the ref field is
written either way. A
stored pin re-reads the frozen revision bytes (a missing pin refuses); a
ref with no pin follows the source's current payload.


## Action-specific gates

HTTP create, patch, and delete use the corresponding `create`, `update`, and `delete` action. Reads use `view`. The shared access contract maps `delete` to admin level; a generic write grant cannot delete. Payload replace, restore, and rederive use `update`.


## Instance constraints

Instance-scoped CTS constraints are evaluated asynchronously against
organization-scoped relation, child, and descendant resolvers before generic
create, constrained updates, re-derive, and flat-instance lifecycle transitions.
Resolver failures fail closed. Constrained updates and re-derive
compare the source `updatedAt` at write time and reserve the organization
change sequence around the mutation. The `validateCandidate` service seam
also serves flat CTS lifecycle transitions; their status event and entity
snapshot commit together against the loaded `updatedAt` value.

## Graph-backed validation

A type whose declaration carries `graphValidation: { graphId, revision,
outputId }` (grammar: [packages/cts](../../../packages/cts/README.md)) has
every generic create and field patch validated by that pinned saved graph:
the pin resolves through the acting principal's read grant
(`resolvePinnedGraph`), the graph evaluates through the saved-graph
evaluator's preview boundary
([graph-executions](../graph-executions/README.md)) — typed-IR preflight,
pure/read-only operations, recorded execution evidence — and the write
proceeds only when the declared output exists and evaluates to boolean
`true`. Graph interface inputs bind by convention: a port named `instance`
receives the candidate projection `{ fields }`, and a port whose id matches
a declared field receives the candidate's field value; a required port with
neither refuses the write naming the port. Unresolvable pins, evaluation
failures, and every other verdict refuse the write with `400` diagnostics —
fail closed. A validation that consumed organization instances, relations,
or queries must return a stable organization sequence; that sequence becomes
the write's expected sequence, so a dependency change between validation and
commit rejects the write with a retryable `409`. The instance write under
validation is the path's only mutation.

## Instance revisions

Every stored CTS instance carries a numeric `revision` independent of
`typeVersion` and payload content-history revisions. Creation starts at 1;
field, payload, migration, lineage, and flat lifecycle writes increment it.
Existing per-class documents adopt baseline revision 1 through
`server/scripts/backfill-instance-revisions.js` (dry-run by default).
