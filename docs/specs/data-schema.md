# Nesting Data Schema
_Industrial-grade data structures for 2D vector cassette nesting platform_

**Current Scope:** Store multi-layer DXF cassettes, map user layers to standards via hand-mapping, display with user-defined pens and doc templates.

---

## 1. Layer Standard

**Collection:** `layer_standards`

System catalogue of standardized layer definitions. User maps their DXF layers to these standards during cassette upload.

```typescript
interface LayerStandard {
  _id: ObjectId;
  code: string;              // e.g., "1_1_FACE", "2_1_CUT_3_15"
  category: LayerCategory;   // "CONTOUR" | "CUT" | "BEND" | "MARKING"
  i18n: {
    en: { name: string; };
    ru: { name: string; };
  };
  
  // Display defaults (user can override per cassette)
  defaultPenId: ObjectId;    // Reference to pen template
  
  isActive: boolean;         // Soft-delete capability
  createdAt: Date;
}

enum LayerCategory {
  CONTOUR = "CONTOUR",       // Outer boundary (1_x)
  CUT = "CUT",               // Through cuts, holes (2_x)
  BEND = "BEND",             // Bend lines (3_x)
  MARKING = "MARKING"        // Text, dimensions
}
```

**Indexes:** `code` (unique), `category`, `isActive`

**Seed from layers.md:**
```json
[
  { "code": "1_1_FACE", "category": "CONTOUR", "i18n": { "ru": { "name": "Лицо кассеты" }, "en": { "name": "Cassette Face" } } },
  { "code": "1_2_UNFOLD", "category": "CONTOUR", "i18n": { "ru": { "name": "Развертка кассеты" }, "en": { "name": "Cassette Unfold" } } },
  { "code": "2_1_CUT_3_15", "category": "CUT", "i18n": { "ru": { "name": "Обрезь 3.15" }, "en": { "name": "Cut 3.15mm" } } },
  { "code": "2_2_HOLE_5", "category": "CUT", "i18n": { "ru": { "name": "Отверстие 5" }, "en": { "name": "Hole 5mm" } } },
  { "code": "3_1_BEND_90", "category": "BEND", "i18n": { "ru": { "name": "Фрезеровка 90°" }, "en": { "name": "Mill 90°" } } }
]
```

---

## 2. Pen Template

**Collection:** `pen_templates`

Visual style for displaying layers in SVG previews, PDF documents, and exports.

```typescript
interface PenTemplate {
  _id: ObjectId;
  name: string;
  ownerId?: ObjectId;        // null = system default, ObjectId = user custom
  
  stroke: {
    color: string;           // Hex: "#FF0000"
    weight: number;          // mm: 0.25, 0.35, 0.5, 0.7
    pattern: "SOLID" | "DASHED" | "DOTTED";
  };
  
  createdAt: Date;
}
```

**Indexes:** `ownerId`, `name`

**Note:** Users can copy system pens (ownerId=null) and customize them (ownerId=userId)

**Example:**
```json
{
  "name": "Red contour",
  "stroke": { "color": "#FF0000", "weight": 0.35, "pattern": "SOLID" }
}
```

---

## 3. Tool Profile

**Collection:** `tool_profiles`

Physical cutting tools for CNC machining.

```typescript
interface ToolProfile {
  _id: ObjectId;
  name: string;
  ownerId?: ObjectId;        // null = system library, ObjectId = user custom
  
  diameter: number;          // mm
  angle: number;             // degrees (0 = flat, 90 = V-bit, etc.)
  
  createdAt: Date;
}
```

**Indexes:** `ownerId`, `diameter`

**Note:** Users can copy system tools (ownerId=null) and customize them (ownerId=userId)

---

## 4. Cassette Template

**Collection:** `cassette_templates`

Parametric 2D vector template with multi-layer DXF and parameter bindings.

```typescript
interface CassetteTemplate {
  _id: ObjectId;
  slug: string;              // URL-safe identifier
  name: string;
  ownerId: ObjectId;
  
  // Source files
  dxfId: ObjectId;           // GridFS: original uploaded DXF
  svgId: ObjectId;           // GridFS: SVG preview
  
  // User hand-mapped layers
  layerMappings: LayerMapping[];
  
  // Parametric definition
  parameters: Parameter[];
  
  // Geometry metadata
  boundingBox: { width: number; height: number; }; // mm
  area: number;              // mm²
  
  // Default material
  defaultMaterial: {
    alloy: string;           // "Al5052", "Steel"
    thickness: number;       // mm
  };
  
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  createdAt: Date;
  updatedAt: Date;
}

**Indexes:** `slug` (unique), `ownerId`, `status`, `dxfId`

interface LayerMapping {
  dxfLayerName: string;      // Original DXF layer name
  layerStandardId: ObjectId; // Reference to layer_standards
  penId: ObjectId;           // User can override pen
  toolId?: ObjectId;         // Optional tool reference
  // Note: disabled layers not stored (omit from array)
}

interface Parameter {
  name: string;              // "A", "B", "WIDTH", "HEIGHT"
  label: { en: string; ru: string; };
  type: "FLOAT" | "INTEGER";
  unit: string;              // "mm"
  range: { min: number; max: number; };
  defaultValue: number;
  
  // Future: parametric geometry engine (not implemented yet)
  geometryBinding?: {
    target: string;          // "face.width"
    expression?: string;     // "A + 2 * thickness"
  };
}

**Note:** `geometryBinding` reserved for Phase 3 parametric engine
```

---

## 5. Batch

**Collection:** `batches`

Production run that instantiates cassette templates with concrete parameters and quantities.

```typescript
interface Batch {
  _id: ObjectId;
  projectSlug: string;
  batchNumber: number;       // Sequential within project
  name: string;
  ownerId: ObjectId;
  
  // Cassette instances
  entries: BatchEntry[];
  
  // Additional files
  additionalFiles: string[]; // File slugs
  
  // Material carry-over
  previousRemainder?: {
    material: string;
    quantity: number;
  };
  
  // Output artifacts
  artifacts: ObjectId[];     // References to artifact documents
  
  // Lifecycle
  status: "DRAFT" | "READY" | "NESTING" | "COMPLETE" | "FAILED";
  
  createdAt: Date;
  updatedAt: Date;
}

**Indexes:** `projectSlug`, `ownerId`, `status`, `batchNumber` (unique within projectSlug)

interface BatchEntry {
  entryId: string;           // Unique within batch
  cassetteTemplateId: ObjectId;
  quantity: number;
  
  // Instantiated parameters
  parameters: Record<string, number>;
  
  // Material override
  material?: {
    alloy: string;
    thickness: number;
  };
}
```

---

## 6. Artifact

**Collection:** `artifacts`

Unified output document for all generated files (layouts, G-code, PDFs).

```typescript
interface Artifact {
  _id: ObjectId;
  type: ArtifactType;
  batchId: ObjectId;
  name: string;
  
  // Storage
  fileId: ObjectId;          // GridFS file ID
  mimeType: string;          // "image/svg+xml", "application/dxf", "text/plain"
  fileSize: number;          // bytes
  
  // Type-specific metadata
  metadata: LayoutMetadata | GcodeMetadata | DocumentMetadata;
  
  // Provenance
  generatedBy: {
    service: string;         // "nesting-orchestrator", "gcode-generator"
    version: string;
    parameters: Record<string, any>;
  };
  
  status: "GENERATING" | "READY" | "FAILED";
  createdAt: Date;
}

**Indexes:** `batchId`, `type`, `status`, `createdAt`

enum ArtifactType {
  LAYOUT_SVG = "LAYOUT_SVG",
  LAYOUT_DXF = "LAYOUT_DXF",
  GCODE = "GCODE",
  PDF_PASSPORT = "PDF_PASSPORT",
  NESTING_REPORT = "NESTING_REPORT"
}

interface LayoutMetadata {
  sheets: {
    material: string;
    dimensions: { width: number; height: number; };
    usedArea: number;
    scrapArea: number;
    efficiency: number;      // percentage
  }[];
  totalUsedArea: number;
  totalScrap: number;
  remainder: {
    material: string;
    quantity: number;
  };
}

interface GcodeMetadata {
  machineModel: string;
  toolIds: ObjectId[];
  estimatedTime: number;     // seconds
  bounds: {
    x: { min: number; max: number; };
    y: { min: number; max: number; };
  };
}

interface DocumentMetadata {
  pageCount: number;
  format: "A4" | "A3";
  sections: string[];        // "cover", "layout", "cut-list"
}
```

---

## 7. Project (Extended)

**Collection:** `projects`

Existing project collection extended with metadata and TEP.

```typescript
interface Project {
  slug: string;
  name: string;
  ownerId: ObjectId;
  
  // Extended metadata
  metadata: {
    address?: string;
    supplier?: string;
    projectNumber?: string;
    custom: Record<string, any>;
  };
  
  // Technical-Economic Parameters
  tep: {
    materialCostPerSqM: number;
    laborCostPerHour: number;
    totalEstimate: number;
  };
  
  // Related entities
  batchIds: ObjectId[];
  
  // Statistics
  statistics: {
    totalCassettes: number;
    totalArea: number;
    completedBatches: number;
  };
  
  status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  createdAt: Date;
  updatedAt: Date;
}
```

---

## 8. User (Extended)

**Collection:** `users`

Existing user collection extended with template libraries and preferences.

```typescript
interface User {
  id: string;
  email: string;
  balance: number;
  
  // Template library
  templates: {
    penIds: ObjectId[];
    toolIds: ObjectId[];
    layerStandardIds: ObjectId[]; // Custom layer standards
  };
  
  // RBAC
  roles: {
    userId: ObjectId;
    role: "ADMIN" | "EDITOR" | "VIEWER";
  }[];
  
  // Preferences
  preferences: {
    locale: "en" | "ru";
    units: "METRIC" | "IMPERIAL";
    defaultMaterial: string;
  };
}
```

---

## Relationships Diagram

```
User
 ├─ templates → PenTemplate[]
 ├─ templates → ToolProfile[]
 ├─ templates → LayerStandard[] (custom)
 └─ projects → Project[]
                 └─ batches → Batch[]
                              ├─ entries → CassetteTemplate (instantiated)
                              └─ artifacts → Artifact[]

LayerStandard
 └─ defaultPenId → PenTemplate

CassetteTemplate
 └─ layerMappings[]
      ├─ layerStandardId → LayerStandard
      ├─ penId → PenTemplate
      └─ toolId → ToolProfile

BatchEntry
 └─ cassetteTemplateId → CassetteTemplate

Artifact
 └─ batchId → Batch
```

---

## Workflow

1. **Upload DXF:** User uploads multi-layer DXF cassette
2. **Detect Layers:** System extracts all layer names from DXF
3. **Hand-Mapping:** User maps each DXF layer → LayerStandard → Pen
4. **Store Template:** Save as CassetteTemplate with mappings
5. **Create Batch:** User selects cassettes, sets parameters, creates batch
6. **Run Nesting:** Batch triggers nesting job
7. **Generate Artifacts:** Create layouts, G-code, PDFs
8. **Display Results:** Show with pen styles, download artifacts

---

## Collections Summary

**Core Collections:**
- `layer_standards` - System catalogue (seeded from layers.md)
- `pen_templates` - System + user display styles
- `tool_profiles` - System + user tool library
- `cassette_templates` - User cassettes with layer mappings
- `batches` - Production runs
- `artifacts` - Generated outputs
- `projects` - Extended with metadata/TEP
- `users` - Extended with templates/preferences

**GridFS Buckets:**
- `cassettes` - Cassette DXF files
- `cassetteSvg` - SVG previews
- `artifacts` - Generated files (layouts, G-code, PDFs)

---

## Schema Review Notes

**Review Date:** 2025-11-22

### Changes Made for Efficiency

1. **LayerStandard:**
   - Added `isActive` boolean for soft-delete capability
   - Added indexes: `code` (unique), `category`, `isActive`

2. **PenTemplate:**
   - Kept simple: users copy system pens (ownerId=null) and customize
   - Added indexes: `ownerId`, `name`

3. **ToolProfile:**
   - Simplified to essential fields: `diameter`, `angle` only
   - Removed over-engineered fields (material, feedRates, status, geometry.type)
   - Users copy system tools (ownerId=null) and customize
   - Added indexes: `ownerId`, `diameter`

4. **CassetteTemplate:**
   - Removed `LayerMapping.enabled` field (disabled layers simply omitted from array)
   - Clarified `Parameter.geometryBinding` as Phase 3 feature
   - Added indexes: `slug` (unique), `ownerId`, `status`, `dxfId`

5. **Batch:**
   - Added indexes: `projectSlug`, `ownerId`, `status`, `batchNumber` (compound unique)

6. **Artifact:**
   - Added indexes: `batchId`, `type`, `status`, `createdAt`

### Review Criteria Met

✅ **No redundant fields** - Removed `enabled` boolean, simplified ToolProfile  
✅ **Future-proof but not over-engineered** - Reserved `geometryBinding` for Phase 3, kept tools minimal  
✅ **Relationships clear** - All foreign keys documented with types  
✅ **Indexes planned** - Complete index specifications for all collections

### Status

✅ Schema review approved and finalized (2025-11-22)

### Next Steps

Proceed to Phase 1.2 (Module Architecture) and Phase 1.3 (Database Indexes).
