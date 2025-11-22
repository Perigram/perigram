# Architecture Documentation

**Last Updated:** 2025-11-22

---

## Overview

Cutkit-Demo is a DXF nesting application for CNC manufacturing. It handles multi-layer cassette templates with parametric capabilities, batch production workflows, and generates artifacts (layouts, G-code, PDFs).

**Stack:**
- **Frontend:** Nuxt.js 3 (SSR), Vue 3, PrimeVue (migrating), Tailwind CSS
- **Backend:** Nuxt.js Server (Nitro), MongoDB (native driver), GridFS
- **Auth:** Session-based (cookies) + OAuth
- **Workers:** Python workers for DXF processing and nesting
- **Payment:** Stripe for credit purchases

---

## Data Model

**Full schemas:** See `/docs/specs/data-schema.md`

### Core Collections

**Current (v1):**
- `users` - User accounts, balance, sessions
- `projects` - User projects (slug, name, ownerId, statistics)
- `user_dxf_files` - Uploaded DXF files
- `nesting_jobs` - Nesting results
- `tables` - Project tables for batch data
- `cassettes` - User cassette templates (basic)

**Target (v2 - New Architecture):**
- `layer_standards` - System layer catalogue (seeded from layers.md)
- `pen_templates` - Display styles for layers
- `tool_profiles` - CNC tool library
- `cassette_templates` - Parametric templates with layer mappings
- `batches` - Production runs
- `artifacts` - Unified outputs (layouts, G-code, PDFs)
- `projects` - Extended with metadata and TEP
- `users` - Extended with template libraries

### Indexes

**Index Management:** `/server/db/indexes.js`

All collections have indexes for efficient queries. Key indexes:

- `layer_standards`: `code` (unique), `category`, `isActive`
- `pen_templates`: `ownerId`, `name`
- `tool_profiles`: `ownerId`, `diameter`
- `cassette_templates`: `slug` (unique), `ownerId`, `status`, `dxfId`
- `batches`: `(projectSlug, batchNumber)` compound unique, `ownerId`, `status`
- `artifacts`: `batchId`, `type`, `status`, `createdAt`

**Create indexes:**
```bash
node server/db/indexes.js create
```

**List indexes:**
```bash
node server/db/indexes.js list batches
```

**Strategy:**
- Unique indexes on natural keys (slug, code)
- Indexes on foreign keys (ownerId, batchId)
- Indexes on filter fields (status, category)
- Compound indexes for common query patterns

### GridFS Buckets

- `avatars` - User profile images
- `userDxf` - Original uploaded DXF files
- `userDxfFilesSvg` - SVG previews
- `cassettes` - Cassette DXF files (migrating)
- `artifacts` - Generated outputs (new)

---

## Module Structure

### Service Pattern

**Location:** `/server/features/[module]/`

```
module-name/
├── repository.js      # Database operations only
├── service.js         # Business logic + validation
└── index.js           # Exported interface
```

**Principles:**
1. Each module owns one collection
2. Services export typed interfaces
3. No cross-module DB access (use service calls)
4. API handlers are thin wrappers

**Layer Responsibilities:**

**Repository Layer** (`repository.js`):
- ONLY database operations (find, create, update, delete)
- No business logic
- No validation
- No ownership checks
- Returns raw MongoDB results

```javascript
// Example: repository.js
import { connectDB } from '~~/server/db/mongo';
import { ObjectId } from 'mongodb';

const COLLECTION = 'pen_templates';

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
}

export async function findMany(query = {}, options = {}) {
  const db = await connectDB();
  const { limit = 100, skip = 0, sort = { createdAt: -1 } } = options;
  return await db.collection(COLLECTION)
    .find(query)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .toArray();
}

export async function create(data) {
  const db = await connectDB();
  const doc = { ...data, createdAt: new Date() };
  const result = await db.collection(COLLECTION).insertOne(doc);
  return { ...doc, _id: result.insertedId };
}
```

**Service Layer** (`service.js`):
- ALL business logic
- ALL validation
- Ownership checks
- Error handling with `createError()`
- Orchestrates repository calls
- NEVER accesses database directly

```javascript
// Example: service.js
import * as repository from './repository.js';
import { ObjectId } from 'mongodb';

export async function getById(id, userId = null) {
  if (!ObjectId.isValid(id)) {
    throw createError({ statusCode: 400, message: 'Invalid ID format' });
  }
  
  const item = await repository.findById(id);
  
  if (!item) {
    throw createError({ statusCode: 404, message: 'Item not found' });
  }
  
  // Validate ownership if userId provided
  if (userId && item.ownerId?.toString() !== userId) {
    throw createError({ statusCode: 403, message: 'Access denied' });
  }
  
  return item;
}

export async function listForUser(userId) {
  return await repository.findMany({ ownerId: new ObjectId(userId) });
}

export async function create(data, userId) {
  // Validate required fields
  if (!data.name || typeof data.name !== 'string') {
    throw createError({ statusCode: 400, message: 'Name is required' });
  }
  
  // Attach owner
  return await repository.create({
    ...data,
    ownerId: userId ? new ObjectId(userId) : null
  });
}
```

**API Handler** (thin wrapper):
- Extract auth from `event.context.auth`
- Call service layer
- Format response

```javascript
// Example: /server/api/pens/index.get.js
import { service } from '~/server/features/pen-templates';

export default defineEventHandler(async (event) => {
  const userId = event.context.auth.userId;
  
  // Get both system and user pens
  const [systemPens, userPens] = await Promise.all([
    service.listSystem(),
    service.listForUser(userId)
  ]);
  
  return [...systemPens, ...userPens];
});
```

### Module Template

Template available at `/server/features/_template/`

To create new module:
```bash
cp -r server/features/_template/ server/features/your-module/
```

Then update:
1. `COLLECTION` constant in `repository.js`
2. Validation logic in `service.js`
3. Export in `index.js`

**Modules:**
- `layer-standards/` - Parametric layer templates
- `pen-templates/` - Display styles
- `tool-profiles/` - Tool library
- `cassettes/` - Cassette template management
- `batches/` - Production run management
- `artifacts/` - Generated output files
- `nesting/` - Orchestrator (doesn't own data)

### Module APIs

**Layer Standards:**
- `GET /api/layer-standards` - List all standards
- `GET /api/layer-standards?category=CUT` - Filter by category
- Parametric templates with nameTemplate + parameters

**Pen Templates:**
- `GET /api/templates/pens` - List system + user
- `POST /api/templates/pens` - Create user pen
- `PUT /api/templates/pens/:id` - Update
- `DELETE /api/templates/pens/:id` - Delete
- System pens read-only

**Tool Profiles:**
- `GET /api/templates/tools` - List all
- `POST /api/templates/tools` - Create (diameter, angle)
- `PUT /api/templates/tools/:id` - Update
- `DELETE /api/templates/tools/:id` - Delete

**Cassettes:**
- `GET /api/cassettes` - List user cassettes
- `GET /api/cassettes/:id` - Get by ID
- `PUT /api/cassettes/:id/mappings` - Update layer mappings
- `PUT /api/cassettes/:id/parameters` - Update parameters
- `DELETE /api/cassettes/:id` - Delete

**Batches:**
- `POST /api/project/:slug/batches` - Create
- `GET /api/project/:slug/batches` - List for project
- `GET /api/batch/:id` - Get details
- `PUT /api/batch/:id` - Update
- `GET /api/batch/:id/artifacts` - Get artifacts

**Artifacts:**
- `GET /api/artifacts/:id` - Get metadata
- `DELETE /api/artifacts/:id` - Delete

---

## Frontend Architecture

### State Management

**Pattern:** Readonly reactive stores (NOT Pinia)

```javascript
// Example: composables/layerStandards.js
const state = reactive({ standards: [], loading: false });

const actions = {
  async fetchStandards() {
    state.loading = true;
    state.standards = await $fetch('/api/layer-standards');
    state.loading = false;
  }
};

export const layerStandardsStore = readonly({
  getters: {
    standards: computed(() => state.standards),
    loading: computed(() => state.loading)
  },
  actions
});
```

**Current Stores:**
- `authStore` - User auth state
- `filesStore` - Project files
- `globalStore` - Projects list, modals, notifications
- `themeStore` - Theme switching
- `tablesStore` - Project tables
- `cassettesStore` - User cassettes

**New Stores (v2):**
- `layerStandardsStore`
- `penTemplatesStore`
- `toolProfilesStore`
- `batchesStore`

### Component System

**Current:** Custom components with BEM-like SCSS  
**Migrating to:** PrimeVue

**Design Tokens (CSS Variables):**
```css
--background-primary, --background-secondary
--label-primary, --label-secondary, --label-tertiary
--fill-secondary, --fill-tertiary
--accent-primary, --accent-secondary
--separator-primary, --separator-secondary
```

Themes applied via `data-theme` attribute on `<html>`.

---

## API Patterns

### Current Endpoints

```
# Projects
POST   /api/project
GET    /api/project/:slug
DELETE /api/project/:slug
POST   /api/project/:slug/addfiles
DELETE /api/project/:slug/files/:fileSlug
POST   /api/project/:slug/nest
GET    /api/project/:slug/results
GET    /api/project/me

# Tables
GET    /api/project/:slug/tables
POST   /api/project/:slug/tables/create
POST   /api/project/:slug/tables/upload
GET    /api/tables/:id
PUT    /api/tables/:id
DELETE /api/tables/:id

# Cassettes
GET    /api/cassettes
POST   /api/cassettes/upload
GET    /api/cassettes/:id
PUT    /api/cassettes/:id
DELETE /api/cassettes/:id

# Auth
POST   /api/auth/logout
GET    /api/user
POST   /api/user/add-credits
```

### New Endpoints (v2)

See `/docs/planning/implementation_plan.md` for complete API specification.

### Auth Flow

**Middleware:** `/server/middleware/auth.js`
- Runs on ALL requests
- Reads `sessionId` cookie
- Fetches user from DB
- Attaches `event.context.auth = { userId, isAdmin }`

**Client middleware:** `/middleware/auth.js`
- Redirects unauthenticated users

---

## Workers

### Nesting Worker Integration

**Architecture:** Python worker + MongoDB job queue

```
API → nesting_jobs collection → Python Worker → Results → Artifacts
```

**Batch Flow:**
1. User creates Batch with cassettes + quantities
2. Frontend calls `POST /api/batch/:id/nest` with material params
3. API creates `nesting_job` document (worker compatibility layer)
4. API updates batch status → NESTING
5. API creates placeholder Artifacts (GENERATING status)
6. Python worker polls `nesting_jobs` collection
7. Worker fetches DXF files from GridFS
8. Worker runs nesting algorithm
9. Worker uploads results to GridFS
10. Worker updates nesting_job status → complete
11. Worker updates Artifact fileIds + status → READY
12. API updates Batch status → COMPLETE

**Job Document:**
```javascript
{
  slug: "batch-123-abc456",
  projectSlug: "my-project",
  batchId: ObjectId("..."),
  files: [
    { slug: "cassette-1", simpleName: "Part_A", count: 10 },
    { slug: "cassette-2", simpleName: "Part_B", count: 5 }
  ],
  params: {
    height: 2440,
    width: 1220,
    space: 5,
    sheetCount: 10
  },
  status: "pending" | "processing" | "complete" | "failed",
  createdAt: Date,
  ownerId: ObjectId("...")
}
```

**Worker Responsibilities:**
- Poll nesting_jobs for status="pending"
- Download DXF files via slug
- Run nesting algorithm
- Generate outputs (SVG, DXF, PDF, reports)
- Upload to GridFS
- Update Artifact documents with fileIds
- Update nesting_job status
- Update Batch status via API

**Error Handling:**
- Worker failures set nesting_job.status = "failed"
- API monitors jobs and updates Batch.status = "FAILED"
- Artifacts marked as FAILED
- User can retry nesting

---

## Workflows

### Current: Project Creation & Nesting

1. **Upload DXF Files**
   - `POST /api/project` creates project with slug
   - Files saved to GridFS `userDxf` bucket
   - Worker processes DXF → SVG (async)
   - `user_dxf_files` updated with `processingStatus: 'done'`
   - Client polls until all files processed

2. **Run Nesting**
   - User sets params (plate width/height, spacing, sheet count)
   - User selects files and quantities
   - `POST /api/project/:slug/nest` triggers nesting job
   - Worker calculates optimal layout (jagua-rs)
   - Result saved to `nesting_jobs` with SVG/DXF in GridFS
   - Client shows result modal with statistics

### New: Batch-Based Workflow (v2)

1. **Upload Cassette Template**
   - User uploads multi-layer DXF
   - System detects all layer names
   - User maps DXF layers → layer standards → pens
   - Cassette saved as template

2. **Create Batch**
   - User selects cassette templates
   - Sets parameter values (A=width, B=height, etc.)
   - Specifies quantities
   - Batch created with entries

3. **Run Nesting**
   - `POST /api/batch/:id/nest`
   - Worker fetches cassette DXFs with parameters
   - Generates layout via jagua-rs
   - Stores as artifacts (SVG, DXF, G-code, PDF)

4. **View Artifacts**
   - Download generated files
   - View with pen-styled previews

---

## Workers

### File Processing Worker
- **Trigger:** Upload to `userDxf` GridFS bucket
- **Function:** DXF → SVG conversion, layer detection
- **Updates:** `user_dxf_files.processingStatus`

### Nesting Worker
- **Trigger:** POST to nest endpoint
- **Function:** Optimal 2D bin packing (jagua-rs library)
- **Outputs:** Layout SVG/DXF, statistics
- **Updates:** `nesting_jobs.status`

### Communication
- **Current:** Polling from client
- **New (v2):** Event bus with status updates

---

## Development Guidelines

### Adding a New Entity
1. Define schema in `/docs/specs/data-schema.md`
2. Create validation schema in `/server/schemas/entities/`
3. Document relationships and indexes

### Adding a New Module
1. Create `/server/features/[module]/` structure
2. Implement repository (DB operations)
3. Implement service (business logic)
4. Export interface in `index.js`
5. Document service API in this file

### Adding a New API Endpoint
1. Create handler in `/server/api/[module]/[endpoint].js`
2. Use service layer (never direct DB access)
3. Validate auth via `event.context.auth`
4. Document request/response schemas below

### Adding a New Component
1. Follow PrimeVue conventions (migrating)
2. Use design token CSS variables
3. Emit events for parent communication
4. Document in `/docs/ONBOARDING.md`

### Documentation Rule
**Every code change must update relevant docs in same commit.**

---

## Deployment

### Environment Variables
```
MONGODB_URI=mongodb://localhost:27017/nest2d-v2
NUXT_PUBLIC_BASE_URL=https://nest2d.stelmashchuk.dev
STRIPE_SECRET_KEY=sk_...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

### Build & Deploy
```bash
npm run build
node .output/server/index.mjs
```

### Docker Stack
Workers deployed via docker-compose:
```bash
docker stack deploy -c docker-stack-external.yml nest2d
```

---

## Future Architecture (v2)

See full plan: `/docs/planning/implementation_plan.md`

**Key Changes:**
- Modular backend services with clean boundaries
- Batch-centric production workflow
- Parametric cassette templates
- Unified artifact system
- PrimeVue UI migration
- Comprehensive documentation

**Migration Status:** See `/docs/planning/implementation_plan.md` task tracker

---

## Detailed Workflows

### Cassette Upload Workflow

**Purpose:** Create reusable template for parts with parametric dimensions

**Steps:**

1. **Upload DXF File**
   ```
   Client → POST /api/cassettes/upload
   FormData: { file: cassette.dxf, name: "Bracket Template" }
   
   Server:
   - Generates unique slug
   - Uploads to GridFS (cassettes bucket)
   - Creates cassette_templates document
   - Sets processingStatus: 'pending'
   ```

2. **Worker Processes DXF**
   ```
   Worker:
   - Reads DXF from GridFS
   - Detects all layers
   - Extracts bounding box and area
   - Generates SVG preview
   - Updates processingStatus: 'done'
   ```

3. **User Maps Layers**
   ```
   Client → PUT /api/cassettes/:id/mappings
   Body: {
     layerMappings: [
       {
         dxfLayerName: "0-CUT",
         standardCode: "2_1_CUT",
         penId: "<pen_id>",
         toolId: "<tool_id>"
       },
       {
         dxfLayerName: "1-BEND",
         standardCode: "3_1_BEND",
         penId: "<pen_id>",
         toolId: "<tool_id>"
       }
     ]
   }
   
   Server:
   - Validates layer standards exist
   - Validates pen/tool references
   - Updates cassette document
   ```

4. **Define Parameters**
   ```
   Client → PUT /api/cassettes/:id/parameters
   Body: {
     parameters: [
       { key: "A", label: "Width", defaultValue: 100 },
       { key: "B", label: "Height", defaultValue: 50 }
     ]
   }
   
   Server:
   - Stores parameter definitions
   - Cassette now ready for use in batches
   ```

**Result:** Reusable cassette template with layer mappings and parametric dimensions

---

### Batch Lifecycle Workflow

**Purpose:** Organize production run with multiple parts, quantities, and dimensions

**Steps:**

1. **Create Batch**
   ```
   Client → POST /api/project/:slug/batches
   Body: {
     name: "Production Run #42",
     plateWidth: 2440,
     plateHeight: 1220,
     spacing: 3
   }
   
   Server:
   - Generates unique batch number
   - Creates batch document with DRAFT status
   - Initializes empty table data
   ```

2. **Add Cassette Entries**
   ```
   Client → PUT /api/batch/:id
   Body: {
     tableData: [
       {
         entryId: "A",
         cassetteTemplateId: "<cassette_id>",
         quantity: 10,
         dimensions: { A: 120, B: 60 }
       },
       {
         entryId: "B",
         cassetteTemplateId: "<cassette_id>",
         quantity: 5,
         dimensions: { A: 80, B: 40 }
       }
     ]
   }
   
   Server:
   - Validates cassette templates exist
   - Validates dimensions match template parameters
   - Updates batch tableData
   ```

3. **Calculate Cost**
   ```
   Client → GET /api/batch/:id/cost
   
   Server:
   - Counts total parts: sum(quantities)
   - Estimates plates needed
   - Calculates credit cost
   - Returns estimate
   ```

4. **Trigger Nesting**
   ```
   Client → POST /api/batch/:id/nest
   
   Server:
   - Checks user credit balance
   - Deducts credits (or returns 402 Payment Required)
   - Updates batch status: PROCESSING
   - Queues nesting job
   
   Worker:
   - Fetches cassette DXFs
   - Substitutes dimensions per entry
   - Runs jagua-rs nesting algorithm
   - Generates layouts
   ```

5. **Generate Artifacts**
   ```
   Worker:
   - For each plate layout:
     * Renders SVG with pen styles
     * Converts to DXF
     * Generates G-code (if CNC)
     * Creates PDF report
   - Uploads all to GridFS
   - Creates artifact documents
   - Links artifacts to batch
   - Updates batch status: COMPLETED
   ```

6. **Download Results**
   ```
   Client → GET /api/batch/:id/artifacts
   
   Returns:
   [
     {
       _id: "...",
       type: "layout_svg",
       fileId: "<gridfs_id>",
       downloadUrl: "/api/artifacts/:id/download",
       metadata: {
         plateNumber: 1,
         efficiency: 87.5,
         partCount: 15
       }
     },
     ...
   ]
   ```

**Result:** Optimized layouts ready for production, downloadable in multiple formats

---

### Complete User Journey Example

**Scenario:** User wants to produce 100 brackets and 50 frames

```
1. Create Bracket Template
   - Upload bracket.dxf
   - Map: "CUT" → 2_1_CUT (Ø3.15mm tool)
   - Map: "BEND" → 3_1_BEND (90° V-bit)
   - Define: A=width, B=height

2. Create Frame Template
   - Upload frame.dxf
   - Map layers
   - Define: C=outer, D=inner

3. Create Project
   - Name: "Q1 2024 Production"
   - Material: 3mm aluminum, 2440x1220mm

4. Create Batch in Project
   - Name: "January Batch"
   - Add entry: Bracket (qty: 100, A: 120, B: 60)
   - Add entry: Frame (qty: 50, C: 200, D: 180)

5. Run Nesting
   - Review cost: 150 parts @ 0.1 credits = 15 credits
   - Confirm nesting
   - Wait for processing (30-60s)

6. Download Results
   - 8 layout plates (SVG/DXF)
   - CNC G-code files
   - Production report (PDF)
   - Material efficiency: 82.3%

7. Production
   - Load files into CNC controller
   - Cut plates
   - Track material usage
```

**Time:** ~5 minutes setup, 1 minute processing, infinite reuse of templates

