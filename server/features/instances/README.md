# COMPONENT: Instances

Generic per-class instance services (CTS SPEC §13):
[packages/cts/SPEC.md](../../../packages/cts/SPEC.md) §21/§13). One service
serves every type that has no hand-registered feature service — pack types
and org-authored types — so the type system is executable without
hand-written services.

## Contract

- Storage: per-class collections (`files`, `items`, `groups`, `processes`)
  with the type id as discriminator; documents carry the §3 stored shape —
  `type`, `typeVersion`, `name`, flat `fields`, `states.main`, `lineage`
  (pure tree edges), `relations`, the top-level `organizationId` tenancy
  slot, `payload` (iff the type declares payload traits), and `provenance`
  (set by the construct boundary, never patched). Tenancy never lives
  inside `lineage` (SPEC §3): the wire DTO still projects it as
  `lineage.organizationId` for the legacy block vocabulary, and that
  projection is owned by this service boundary (`toDto`/`create`) and
  nowhere else. `migrate-instance-tenancy.js` backfills the slot and
  strips the legacy lineage key one-way.
- Payload (SPEC §3/§4): create accepts a payload reference — §3-honest
  callers pass `payload`, legacy wire callers pass
  `attachments.primary` — shaped `{ fileId, mime?, size?, name? }`. The
  reference is validated against the type's declared payload traits at
  construct (fileId required; `mime` must be in the declared list;
  `size` within `maxSize` when both are known) and stored as the §3
  payload slot. `toDto` projects the slot back onto the wire
  `attachments.primary` block. Payload, tenancy, and provenance are
  immutable after construct: `processUpdate` ignores their wire keys.
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
  `invalidateInstanceDeclarations` on writes).
- Service surface: the feature-service shape (getById/list/create/
  processUpdate/remove) plus the process bindings (processList,
  processGetById, processDelete, processCapabilities, genericCreate
  construction handler). Wire patches map to §3 writes; wire
  `lineage.organizationId` is ignored on update (tenancy is immutable
  after construct).
- Registration: the core registry's entity-service resolver consults
  `instanceServiceResolver`; explicit feature services always win.

## Derived indexes (SPEC §13)

`indexes.js` owns the registry-derived index set — no hand-mirrored index
list exists. `deriveInstanceIndexes(view)` is pure over the organization's
registry view; `ensureInstanceIndexes(view)` applies every definition
idempotently (`createIndex`):

- per class collection in use: `{ type, organizationId, createdAt }`
  (list ordering) and `{ type, organizationId, 'states.main' }`;
- per declared children edge, on each child type's class collection:
  `{ type, organizationId, 'lineage.<key>' }`;
- per declared relation edge, on the owner's class collection:
  `{ type, organizationId, 'relations.<key>' }`.

Type declarations and process activation are the write paths that can
change the view, so `defineType`/`removeType` (cts-types) and activate
(process-definitions) re-derive after their writes.

## Related

- [server/runtime/README.md](../../runtime/README.md) — resolver registration.
- [server/features/cts-types/README.md](../cts-types/README.md) — org type storage.
