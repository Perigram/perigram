# COMPONENT: Instances

Generic per-class instance services (CTS SPEC §13):
[packages/cts/SPEC.md](../../../packages/cts/SPEC.md) §21/§13). One service
serves every type that has no hand-registered feature service — pack types
and org-authored types — so the type system is executable without
hand-written services.

## Contract

- Storage: per-class collections (`files`, `items`, `groups`, `processes`)
  with the type id as discriminator; documents carry the §3 stored shape —
  `type`, `typeVersion`, `name`, flat `fields`, one canonical active leaf
  path per declared state axis under `states`, `lineage` (pure tree edges),
  `relations`, the top-level `organizationId` tenancy slot, `payload` (iff
  the type declares payload traits), and `provenance` (set by the construct
  boundary, never patched).
  `organizationId: null` marks a system instance (pack-seeded reference
  catalogs): read-admitted beside org rows in every organization's list,
  written only by seeding/admin paths. Tenancy never lives
  inside `lineage` (SPEC §3): the wire DTO still projects it as
  `lineage.organizationId` for the legacy block vocabulary, and that
  projection is owned by this service boundary (`toDto`/`create`) and
  nowhere else. `migrate-instance-tenancy.js` backfills the slot and
  strips the legacy lineage key one-way. The wire `identity.name` is the
  same kind of boundary projection: it carries the stored name when one
  was set explicitly (wire rename), else the declared identifier field's
  value resolved through the one canonical law (`normalizeType` — an
  explicit `identifier` flag wins, else the minted first string field;
  the same identity `titleFor` resolves client-side), so wire-block
  consumers such as chats, pickers, and inline refs render the
  identifier value instead of the raw instance id.
- Type migration executor (`migrations.js`): runs a covered `migrate` step
  set against the type's persisted instances when
  [cts-types](../cts-types/README.md) lands a breaking redefinition.
  Contract: total scan (no limit) of the type's per-class collection in
  the org scope; every behind instance transforms through all steps in
  one pass — `rename-enum-value` rewrites the exact axis/path and descendant
  prefixes, `rename-field`,
  `remove-field`, `add-default-field`, and `retype-field` (CEL expression
  over `{ value }`, step-budgeted) rewrite flat `fields` — then the doc
  takes the new `typeVersion` stamp, so re-running skips finished
  documents (idempotent resume) and each rewrite publishes the shared
  typed invalidation event with reason `type-migration`. The whole
  `fields` object and `states` axis map are written back per document; the
  summary (per-step counts, failures) returns to the caller for the
  declaration's `migrated` record.
- Payload (SPEC §3/§4): create accepts a payload reference — §3-honest
  callers pass `payload`, legacy wire callers pass
  `attachments.primary` — shaped `{ fileId, mime?, size?, name? }`. The
  reference is validated against the type's declared payload traits at
  construct (fileId required; `mime` must be in the declared list;
  `size` within `maxSize` when both are known) and stored as the §3
  payload slot. Payload blobs live in the `files` GridFS bucket — the
  §3 Blob home; upload callers pass `bucket=files` and the wire payload
  reference carries no bucket by design. `toDto` projects the slot back
  onto the wire `attachments.primary` block. Payload, tenancy, and
  provenance are immutable after construct: `processUpdate` ignores
  their wire keys.
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
  `upload`/`capture`/`editor` declared on payload types — upload and
  capture require a payload reference (validated by the construct-time
  trait checks), editor constructs a blank instance whose first editor
  save fills the payload). Wire patches map to §3 writes; wire
  `lineage.organizationId` is ignored on update (tenancy is immutable
  after construct).
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
  undeclared keys are transport noise, never a Mongo path). This is
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
  feature `resolveEntityFeature` compiles grants against) with the type
  id as the type-id filter, so a write requires a compiled process
  grant — fail-closed.
- Field updates (`patch`): `PATCH /api/instances/:type/:id` carries the
  same wire patch blocks `processUpdate` writes (`identity.name`,
  `data`/`specs` leaves, declared non-main state axes are status-runtime
  owned, non-tenancy `lineage` edges, `relations`) through the identical §3
  mapping. It gates through the
  shared access engine exactly like the payload transport (write level
  on the class-collection feature, type-id filter — fail-closed). This
  is the generated detail surfaces' inline-edit persistence path; the
  process effect boundary keeps its own `processUpdate` with execution
  auth.
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
