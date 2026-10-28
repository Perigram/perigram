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
  and store in either block: the construct boundary scalarizes a ref
  draft to its bare id under `fields.<name>`, relation operations write
  ref objects under `relations.<name>`; readers accept both shapes. **The wire DTO is this stored document verbatim** (owner
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
  row. The lineage chain derives at `createValidated`: every referenced
  parent contributes its own `lineage` to the created record (authored
  axes win over derived ones; ref objects scalarize to ids; a parent in
  another organization refuses), so a create submits immediate parent
  axes alone and construction contracts prompt no grandparent.
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
- Type-lifetime purge (`purge.js`): the confirmed death of an orphaned
  type (cts SPEC §4; candidates and the disclaimer live in
  [cts-types](../cts-types/README.md)) removes every instance of the
  type from its per-class collection, its `status_events` history
  (keyed by `targetType`), and every stored file whose GridFS metadata
  names the type (both buckets) — one home for the bulk data death.
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
  (`payload-replaced`, `rederived`). `rederive(id, mode, { provenance })`
  is the construct re-run: it rebuilds the stored-inputs draft
  (`storedConstructionDraft`), executes the bound construction service
  against the refs' pinned revisions, and patches the same instance's
  fields, payload, and provenance under the same access gate as payload
  replacement.
- Field updates (`patch`): `PATCH /api/instances/:type/:id` carries the
  same wire patch `processUpdate` writes (the `name` rename channel,
  `fields` leaves, non-tenancy `lineage` edges, `relations` — state
  writes are status-runtime owned) through the identical §3 mapping. It gates through the
  shared access engine exactly like the payload transport (write level
  on the class-collection feature, type-id filter — fail-closed). This
  is the generated detail surfaces' inline-edit persistence path; the
  process effect boundary keeps its own `processUpdate` with execution
  auth. Both paths land in `processUpdate`, which also enforces the
  current state's field policy (CTS SPEC §7 `fieldPolicy`): when the
  resolved workflow declares `visible`/`editable` whitelists for the
  instance's state, row-field writes outside them fail with 409. The
  workflow resolves through
  [workflow-overrides](../workflow-overrides/README.md) — the same seam
  the status runtime uses; vocabularies without authored facets write
  unrestricted and read no instance document.
- Creates (`createForHttp`): `POST /api/instances/:type` carries the §3
  draft `createValidated` stores (the `name` rename channel, flat
  `fields`, `lineage` edges, payload references) under the same
  access-engine gate as `patch`. This is the server side of the
  contract-2 `records` host capability — editors composing other types'
  records (the facade plugin's profile library writes ride it). The
  construct boundary keeps its own `create` with execution auth;
  framework feature types keep their feature create routes (no
  `createForHttp`, the generic route 404s for them).
- Construction transport (`POST /api/instances/:type/construct` with
  `{ mode, draft }`): runs a declared construction mode through its
  handler — the standard payload protocols and the service-backed modes
  alike — under the same write gate the create transport takes. This is
  the server side of the contract-5 `construct` host capability; the
  multi-sheet canvas constructs blank sheet designs through it.
- Remove transport (`DELETE /api/instances/:type/:id`): the record death
  behind the same write gate `patch` takes (`removeForHttp` loads the
  entity and checks the compiled grant — fail-closed). The server side
  of the contract-5 `remove` host capability. The remove path sweeps
  relation refs (SPEC §22.12: a dangling ref is a defect): every
  declared relation edge targeting the type — explicit `edges.relations`
  entries and ref fields alike, derived over the same per-org view the
  lineage keys use — has its referrers' slots rewritten in both storage
  blocks; a single ref nulls, an array drops its matching entries
  (`relations.<key>` ref objects, `fields.<key>` bare ids). A system
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
- per declared relation edge, on the owner's class collection:
  `{ type, organizationId, 'relations.<key>' }`.

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
{ base64, mime, name? } | null, fields }` (the fill dialog's composed
preview), 204 when the org binds no service for the mode, or the same
structured refusal; the create write gate applies.
`constructionHandlers` reports every mode as served (the
capability projections filter on it); genuinely unbound modes fail
loudly at dispatch. Types that declare construction modes never offer a
bare `genericCreate` — the per-call declaration check refuses it.

See [plugins](../plugins/README.md) for the listing grammar and
[workers/facade](../../../workers/facade/README.md) for the reference
executor.

Ref resolution stamps the version fabric (SPEC §24): every resolved ref
of a revision-scoped source type pins the revision it read — a declared
ref field on the constructed record stores `{ type, id, revision }`,
and the causal refs in `provenance.sources` carry the same `revision`
slot. A stored pin re-reads the frozen revision bytes (a missing pin
refuses); a ref with no pin follows the source's current payload.
