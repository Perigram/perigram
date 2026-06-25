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
node server/scripts/migrate-public-system-data.js # Mark system materials/layers/pens/tools public-read
node server/scripts/migrate-org-types-to-processes.js # Backfill active process definitions from stored organization type labels
node server/scripts/migrate-process-action-access-grants.js # Move process action role grants from trigger records to access records
node server/scripts/migrate-process-screens-to-generated-ui.js # Normalize stored screens into generated UI contracts
node server/scripts/migrate-process-role-memberships.js # Clear preset permissions from process-role memberships and recover tenant admins
node server/scripts/migrate-process-create-status-grants.js # Normalize create construction/input policies and recompile process contracts
node server/scripts/migrate-process-compiled-runtime.js # Recompile active process runtime contracts after compiler changes
node server/scripts/migrate-queue-job-item-entity-types.js # Backfill queue job item entityType/id contract
```

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

Use `server/scripts/assign-default-pens.js` only as a repair helper for
standards missing `data.defaultPenId`; it uses the same OCCS code/group pen
mapping instead of round-robin assignment.

Use `server/scripts/migrate-public-system-data.js` after adopting or repairing
the public system catalogue contract. It marks existing records in `materials`,
system `layer_standards`, system `pen_templates`, and system `tool_profiles`
as public-read without modifying user grants.

Use `server/scripts/migrate-org-types-to-processes.js` once when introducing
process definitions to existing data. It maps stored `organization.data.type`
labels to starter process templates, creates an active compiled
`process_definition` for organizations without `data.activeProcessDefinitionId`,
and removes organization type branching from runtime behavior.

Use `server/scripts/migrate-process-action-access-grants.js` after adopting
action access grants. It rewrites stored process actions so `trigger` contains
only execution mode, rewrites old trigger/access role ids into
`access.grants: [{ roleId, level }]`, defaults missing grant levels to `write`,
derives status-action access conditions into `access.statusFrom/statusTo`, and
recompiles active process contracts.

Use `server/scripts/migrate-process-screens-to-generated-ui.js` after adopting
generated operational screens. It normalizes stored screen records into fixed
template/source/region contracts, filters stale screen action ids that are not
defined in the process actions, preserves the previous route as `sourceRoute`,
recompiles active process contracts, and picks up compiler-inferred screens
from role grants for processes that have role access but no authored screens.

Use `server/scripts/migrate-process-role-memberships.js` after changing
membership/process role separation. It clears copied permission presets from
memberships whose `role` or `roleIds` are process role ids (`role_*`) while
preserving the process role assignment data. It also promotes an active
team-management member to explicit `organizations:admin` when an organization
has no tenant admin, so creator/admin recovery does not depend on membership
role labels.

Use `server/scripts/migrate-process-create-status-grants.js` after compiler
changes that affect generated screens, create-action status grants,
action-derived workflows, construction contracts, or other compiled runtime
contracts. It rewrites stored create actions to include the current domain
`construction` and `inputPolicy` records, resets stale invalid construction
modes to the current entity-type default, and rewrites every stored semantic
process action, including drafts. Definitions that already have a compiled
runtime contract are recompiled, so existing active processes pick up compiler
fixes without editing their semantic graph records.

Use `server/scripts/migrate-queue-job-item-entity-types.js` after adopting the
canonical queue job item source contract. It inspects existing queue item ids
against `cassette_designs` and `cassettes`, writes `entityType` plus canonical
`id`, and preserves the nesting `type`, quantity, and parameters.

## Entity Revision Migration

`server/scripts/migrate-entity-revisions.js` creates or reuses
`entity_revisions` records for every cassette template's current geometry scope
and writes `data.revisions.geometry` pointers back to the templates. It also
backfills `cassette_design.data.derivedFrom` when a design has
`lineage.templateId` but no recorded source revision. Backfilled design
provenance is marked with `migration.inferred: true` because historical designs
created before revision tracking cannot prove which old template geometry state
was used.
