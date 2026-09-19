# Database Seeding Scripts

Populate system data (layer standards, pens, tools) into MongoDB.

## Quick Start

**Seed everything:**
```bash
node server/scripts/seed-all.js
```

**Individual seeds:**
```bash
node server/scripts/seed-layer-standards.js  # OCCS layer standards from docs/specs/Cassette spec/layers.json
node server/scripts/seed-system-pens.js      # OCCS/default system pens
node server/scripts/seed-system-tools.js     # 6 common tools
node server/scripts/migrate-entity-revisions.js # Backfill cassette geometry revisions and design provenance
node server/scripts/migrate-nesting-provenance.js # Dry-run move of nesting data.*Snapshot fields into provenance.solve.effective
node server/scripts/migrate-nesting-provenance.js --apply # Persist provenance.solve.effective and drop legacy snapshot fields
node server/scripts/migrate-artifact-file-revisions.js # Dry-run artifact current-file revision backfill
node server/scripts/migrate-artifact-file-revisions.js --apply # Persist retained file revisions and scoped pointers
node server/scripts/migrate-instance-tenancy.js # Dry-run SPEC §3 tenancy slot backfill (lineage.organizationId -> organizationId)
node server/scripts/migrate-instance-tenancy.js --apply # Persist the tenancy slot and strip the legacy lineage key
node server/scripts/migrate-public-system-data.js # Mark system materials/layers/pens/tools public-read
node server/scripts/migrate-process-action-access-grants.js # Move process action role grants from trigger records to access records
node server/scripts/migrate-process-screens-to-generated-ui.js # Normalize stored screens into generated UI contracts
node server/scripts/migrate-process-roles-to-organizations.js # Dry-run organization-owned role migration
node server/scripts/migrate-process-roles-to-organizations.js --apply # Apply only organizations without unresolved references
node server/scripts/migrate-organization-owner-admins.js # Mark existing organization creator/admin memberships as owner admins
node server/scripts/migrate-process-compiled-runtime.js # Recompile active process runtime contracts after compiler changes
node server/scripts/migrate-process-update-actions.js # Replace legacy changeStatus actions with updateEntity status mutations
node server/scripts/migrate-process-producer-identities.js # Dry-run v4 producer output identity migration
node server/scripts/migrate-process-producer-identities.js --apply # Persist only when every scanned definition is unambiguous
node server/scripts/migrate-process-command-output-statuses.js # Apply graph-derived process statuses to existing command output entities
node server/scripts/migrate-strip-status-process-provenance.js # Dry-run removal of process provenance keys from entity status metadata
node server/scripts/migrate-strip-status-process-provenance.js --apply # Strip provenance from every affected domain entity
node server/scripts/migrate-process-transition-role-access.js # Remove stale transition permission checks from process-role workflow transitions
APPLY=1 node server/scripts/migrate-process-definition-draft-names.js # Collapse repeated trailing "draft" suffixes in process names
node server/scripts/migrate-entity-reference-contracts.js # Move legacy refs into canonical relations/provenance blocks
node server/scripts/migrate-queue-nesting-contracts.js # Backfill queue nesting settings, machine ids, and cassette-design item refs
node server/scripts/migrate-sheet-design-compositions.js # Backfill sheet-design cassette composition collapse keys
node server/scripts/migrate-artifact-sources.js # Backfill artifact source refs and upload provenance
node server/scripts/repair-nesting-run-completions.js # Complete runs that already have solver results but were blocked by missing process system intents
```

`migrate-process-compiled-runtime.js` intentionally scans only `ACTIVE`
definitions. Drafts have no runtime authority, and archived compiled snapshots
are audit history that may use a superseded graph protocol; neither is silently
rewritten as an active runtime migration.

## What Gets Created

### Layer Standards
- Seeded from [docs/specs/Cassette spec/layers.json](../../docs/specs/Cassette%20spec/layers.json)
- Stored as v24 DTO records with canonical fields under `data.*`
- Preserve OCCS metadata such as `group`, `kind`, `purpose`, `allowedGeometry`,
  `defaultExport`, `parameterSchema`, and registry `source`
- Resolve canonical `defaultPenId` values from layer-code defaults in
  `server/scripts/occs-layer-standards.js`; run system pens before layer
  standards so those names exist in MongoDB
- Store the frontend pen DTO id (`identity.uid` when present), not the raw
  Mongo `_id`, because DrawingCanvas and layer-standard cards match against the
  `/api/templates/pens` DTO `_id`
- Known legacy seed codes such as `1_1_FACE` and raw root-code records from the
  old root script are removed when the OCCS seed runs

### System Pens
- OCCS Contour Blue 0.35mm
- OCCS Flat Pattern Cyan 0.4mm
- OCCS Cut Red 0.6mm
- OCCS Cut Orange 0.45mm
- OCCS Fold Amber Dashed 0.35mm
- OCCS Engrave Indigo Dotted 0.25mm
- OCCS Code Green 0.35mm
- OCCS Dimension Violet Dotted 0.25mm
- OCCS Envelope Slate Dashed 0.25mm
- Black Solid 0.35mm
- Red Solid 0.5mm
- Blue Dashed 0.25mm
- Green Solid 0.7mm
- Gray Dotted 0.25mm

### System Tools (6)
- Flat End Mill 3.15mm (Ø3.15mm, 0°)
- Flat End Mill 5mm (Ø5mm, 0°)
- V-Bit 90° 6mm (Ø6mm, 90°)
- V-Bit 60° 6mm (Ø6mm, 60°)
- Engraving Bit 0.2mm 30° (Ø0.2mm, 30°)
- Drill 5mm (Ø5mm, 118°)

## System Data Characteristics

- **Public read:** System materials, layer standards, pens, and tools are marked
  with `lineage.scope: "system"`, `lineage.public: true`, and
  `data.visibility.public: true`. The access engine reads that marker directly;
  no user or process role receives `materials` or `layer_standards` grants just
  to view these catalogues.
- **Read-only:** System pens/tools cannot be edited or deleted through user
  ownership operations.
- **Can be copied:** Users can create custom templates based on system ones
  where the owning feature supports user-owned copies.

## Reset / Re-seed

To reset system data:

```bash
# In MongoDB shell
use cutkit;
db.layer_standards.deleteMany({ "lineage.userId": null });
db.pen_templates.deleteMany({ "lineage.userId": null });
db.tool_profiles.deleteMany({ "lineage.userId": null });

# Then re-run seed script
node server/scripts/seed-all.js
```

## Script Behavior

- **Idempotent:** Layer standards upsert by `data.code`; system pens upsert by
  system name and update stale stroke data
- **Error Handling:** Continues on per-record errors where possible
- **Summary Output:** Shows created/updated/skipped counts
- **Exit Codes:** 0 = success, 1 = failure

## Development

Add new system data by editing:
- `docs/specs/Cassette spec/layers.json` for layer standards
- `server/scripts/seed-system-pens.js`
- `server/scripts/seed-system-tools.js`

Layer standard seed flow:
1. `server/scripts/occs-layer-standards.js` loads the OCCS registry.
2. `server/scripts/seed-layer-standards.js` resolves default pen names to pen ids.
3. `layer-standards.service.seed()` upserts records by `data.code`.
4. The script removes known legacy seed records and reports the resulting catalogue.

### Migration & Repair Scripts

| Script | When to run | What it does |
|---|---|---|
| `assign-default-pens.js` | Repair helper for standards missing `data.defaultPenId` | Uses the same OCCS code/group pen mapping instead of round-robin assignment. |
| `migrate-public-system-data.js` | After adopting or repairing the public system catalogue contract | Marks existing records in `materials`, system `layer_standards`, system `pen_templates`, and system `tool_profiles` as public-read without modifying user grants. |
| `migrate-process-action-access-grants.js` | After adopting action access grants | Rewrites stored process actions so `trigger` contains only execution mode, rewrites old trigger/access role ids into `access.grants: [{ roleId, level }]`, defaults missing grant levels to `write`, derives status-action access conditions into `access.statusFrom/statusTo`, and recompiles active process contracts. |
| `migrate-process-screens-to-generated-ui.js` | After adopting generated operational screens | Normalizes stored screen records into fixed template/source/region contracts, filters stale screen action ids that are not defined in the process actions, preserves the previous route as `sourceRoute`, recompiles active process contracts, and picks up compiler-inferred screens from role grants for processes that have role access but no authored screens. |
| `migrate-process-roles-to-organizations.js` | For the role ownership cutover | Default run is read-only and reports label divergence, orphan assignment users, and invalid invitation role ids per organization. Active-process labels win; roles introduced by current drafts and already-canonical organization roles are preserved; archived-only roles are audit history. `--apply` moves identity and assignments to organization data, migrates singular membership `roleId` values when no canonical assignment exists, moves role grants into each process, recompiles active contracts, clears draft compiled output, removes user/membership role copies, and removes invitation scalar roles. An organization with unresolved references is not changed, and repeated apply runs are idempotent. |
| `migrate-organization-owner-admins.js` | After adopting owner memberships | Marks one active membership per organization as `owner: true`, preferring the organization creator, then an active admin membership, then the first active member. The selected owner receives `organizations:admin` and `users:admin` so every organization keeps at least one permanent tenant admin. |
| `migrate-process-update-actions.js` | After adopting unified process updates | Rewrites stored `changeStatus` action records to `updateEntity` actions with status inputs, preserves status window metadata, and recompiles stored runtime contracts. |
| `migrate-process-producer-identities.js` | After adopting producer-output-scoped runtime contracts | Rewrites v4 process-node entity outputs to stable `nodeId:socketId` records, carries that identity onto derived actions, and moves detached profiles only when one producer owns the entity contract. The default run is read-only; `--apply` writes only when every scanned definition has unambiguous node/socket ownership. |
| `migrate-entity-reference-contracts.js` | After adopting canonical entity references | Canonicalizes entity-type fields and entity-type-keyed workflow/policy maps across process definitions and registered entity collections, migrates legacy revision `entityType/entityId` fields to `data.source`, moves cassette-design `data.derivedFrom` and `lineage.templateId` into `provenance.derivedFrom.source`, and persists parent revision provenance where configured. The default run is a dry-run; `--apply` writes only when no unresolved canonical type remains. |
| `migrate-queue-nesting-contracts.js` | After adopting the current queue nesting contract | Converts legacy `data.nestingParams` and ambiguous queue items into `data.nestingSettings` plus strict `cassette_design` job items, resolving old template/source ids through existing design provenance and concrete parameters. Seeds the system default machine id when legacy queues have no machine selection. |
| `migrate-sheet-design-compositions.js` | After adopting sheet layout collapse by cassette composition | Stores normalized cassette-design composition metadata so same-multiset sheet layouts collapse to one sheet design per run without geometry comparison. |
| `migrate-artifact-sources.js` | After adopting artifact source refs | Backfills source relations for existing artifacts and cassette upload records so file provenance flows through canonical entity refs. |
| `migrate-process-command-output-statuses.js` | After adding runtime projection from command output handles to downstream process status nodes | Scans active process graphs, finds `runCommand -> updateEntity` edges, resolves each target's compiled producer-output workflow by `producerOutputId` (no type-keyed fallback; unmapped actions are skipped with a diagnostic), and updates existing command output entities whose current status is outside the active process state window. Written status metadata carries only the `migratedBy` marker and display metadata — no process, action, or producer identifiers. Supports `--dry-run` and must remain graph-derived, not status-name-specific. |
| `migrate-strip-status-process-provenance.js` | After removing process provenance from entity status writes | Removes process/run/action/node/producer/workflow identifier keys and the legacy command-output migration note from `status.metadata` on every domain entity collection while preserving display, lifecycle-evidence, and audit metadata. The default run is read-only; `--apply` writes the stripped status. Append-only `status_events` history is intentionally left untouched. |
| `migrate-process-transition-role-access.js` | After separating process-role transition authority from target-status access grants | Removes compiled workflow `access.permissions` from transitions that already have `processRoleIds`, including both v2 region transitions and root transition mirrors. Does not alter semantic action grants, user assignments, or status-scoped entity access windows. |
| `migrate-process-definition-draft-names.js` | Repair for process identities with repeated trailing `draft` suffixes | Reports the number of names that would change by default; set `APPLY=1` to collapse any repeated trailing `draft` suffixes to one. Does not rename ordinary process names. |
| `repair-nesting-run-completions.js` | After fixing process workflow resolution for domain system intents | Finds `nesting_run` records that are still in `NESTING` but already have solver `data.results` and `data.sheetDesignIds`, then writes the normal `COMPLETE` status snapshot and status event without calling the nesting worker or recreating sheet designs. |

## Entity Revision Migration

`server/scripts/migrate-entity-revisions.js` creates or reuses
`entity_revisions` records for every cassette template's current geometry scope
and writes `data.revisions.geometry` pointers back to the templates. Legacy
cassette-design source fields are migrated separately by
`migrate-entity-reference-contracts.js` into `provenance.derivedFrom`.
Backfilled design provenance is marked with `migration.inferred: true` when
historical designs created before revision tracking cannot prove which old
template geometry state was used.
