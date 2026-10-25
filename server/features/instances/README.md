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
  patched). **The wire DTO is this stored document verbatim** (owner
  decision 2026-10-11: ids JSON-safe). `organizationId: null` marks a
  system instance
  (pack-seeded reference catalogs): read-admitted beside org rows in
  every organization's list, written only by seeding/admin paths. Org
  customization of a system instance is an org-authored instance
  shadowing it by declared key (e.g. `code`), never a mutation of the
  system row. Naming follows SPEC §4: the stored `name` slot is the
  explicit rename channel; the declared identifier row's value resolves
  client-side through the display contract (`titleFor`), never by
  copying row data into a second wire field.
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
uploaded payload as base64; the executor returns computed field values
the platform merges before creating the record through the generic
machinery. `constructionHandlers` reports every mode as served (the
capability projections filter on it); genuinely unbound modes fail
loudly at dispatch. Types that declare construction modes never offer a
bare `genericCreate` — the per-call declaration check refuses it.

See [plugins](../plugins/README.md) for the listing grammar and
[workers/facade](../../../workers/facade/README.md) for the reference
executor.
