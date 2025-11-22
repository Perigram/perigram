# Database Seeding Scripts

Populate system data (layer standards, pens, tools) into MongoDB.

## Quick Start

**Seed everything:**
```bash
node server/scripts/seed-all.js
```

**Individual seeds:**
```bash
node server/scripts/seed-layer-standards.js  # 7 parametric layer templates
node server/scripts/seed-system-pens.js      # 5 default pens
node server/scripts/seed-system-tools.js     # 6 common tools
```

## What Gets Created

### Layer Standards (7)
- Parametric templates with `nameTemplate` + `parameters`
- Examples: `"Обрезь_{diameter}"`, `"Фрезеровка_{angle}"`
- Used for generating actual layer names at runtime

### System Pens (5)
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

- **Read-Only:** System data has `ownerId = null`
- **Cannot be Modified:** Users cannot edit or delete system templates
- **Can be Copied:** Users can create custom templates based on system ones

## Reset / Re-seed

To reset system data:

```bash
# In MongoDB shell
use nest2d-v2;
db.layer_standards.deleteMany({ownerId: null});
db.pen_templates.deleteMany({ownerId: null});
db.tool_profiles.deleteMany({ownerId: null});

# Then re-run seed script
node server/scripts/seed-all.js
```

## Script Behavior

- **Idempotent:** Scripts check for existing data
- **Error Handling:** Continues on duplicate errors
- **Summary Output:** Shows created/skipped counts
- **Exit Codes:** 0 = success, 1 = failure

## Development

Add new system data by editing:
- `server/scripts/seed-layer-standards.js`
- `server/scripts/seed-system-pens.js`
- `server/scripts/seed-system-tools.js`

All scripts follow same pattern:
1. Import service + connectDB
2. Define DATA array
3. Loop and call `service.create(data, null)` (null = system)
4. Report results
