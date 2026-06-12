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

- **Read-Only:** System data has no user owner (`lineage.userId = null`)
- **Cannot be Modified:** Users cannot edit or delete system templates
- **Can be Copied:** Users can create custom templates based on system ones

## Reset / Re-seed

To reset system data:

```bash
# In MongoDB shell
use cutkit;
db.layer_standards.deleteMany({ "lineage.userId": null });
db.pen_templates.deleteMany({ "lineage.userId": null });
db.tool_profiles.deleteMany({ownerId: null});

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

## Entity Revision Migration

`server/scripts/migrate-entity-revisions.js` creates or reuses
`entity_revisions` records for every cassette template's current geometry scope
and writes `data.revisions.geometry` pointers back to the templates. It also
backfills `cassette_design.data.derivedFrom` when a design has
`lineage.templateId` but no recorded source revision. Backfilled design
provenance is marked with `migration.inferred: true` because historical designs
created before revision tracking cannot prove which old template geometry state
was used.
