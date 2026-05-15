# SYSTEM: Cutkit-Demo

Multi-tenant CNC manufacturing platform. Users upload parametric cassette templates, organize them into production queues, run 2D nesting algorithms against material piles, and track the full physical lifecycle of every cut cassette panel — from warehouse receipt to on-site installation.

## Quick Start

**Prerequisites:** Node.js v18+, Docker & Docker Compose

```bash
git clone <repo-url>
cd cutkit-demo
npm install
./start-dev.sh          # starts MongoDB, workers, and Nuxt dev server via tmux
node server/scripts/seed-all.js   # seed initial data
```

If you hit "JS heap out of memory": `export NODE_OPTIONS="--max-old-space-size=4096"`

---

## Containers

### 1. `cutkit-app` — Nuxt Web Application

**Purpose:** Full-stack web application. Hosts the Vue 3 SPA and the Nitro REST API in a single deployment unit.

| | |
|---|---|
| **Technologies** | Nuxt 3 (SSR), Vue 3, PrimeVue 4, Tailwind CSS, Nitro (Node.js) |
| **Entry points** | `nuxt.config.js` (app), `server/api/**` (API routes) |
| **Data access** | MongoDB native driver via `server/db/`; GridFS for binary files |
| **Auth** | Session cookie (HTTP-only). User IDs are OAuth strings, not ObjectIds. |
| **Port** | 3000 (internal), exposed via reverse proxy |
| **Health check** | `GET /api/service/health` |

**API Contract (REST `application/json`):**

| Group | Prefix | Responsibility |
|---|---|---|
| Auth | `/api/auth/*` | Register, login, logout, org switch, invitations |
| Entities | `/api/{entity}/*` | CRUD + status transitions for all 20+ entity types |
| Status engine | `/api/status/*` | Transition requests, history log |
| Files | `/api/files/*` | Upload (multipart), download (GridFS proxy) |
| Nesting trigger | `/api/nest/*` | Dispatches geometry to nesting-worker via HTTP |
| Admin | `/api/users/*`, `/api/organizations/*` | User & org management |

**Internal boundaries:**
- `server/` — DB-facing backend (features, core, middleware, utils)
- `composables/`, `components/`, `pages/`, `stores/` — browser-facing frontend

**Patterns:** v24 Golden Path backend, `useEntity` frontend composable. See [server/README.md](./server/README.md) and [composables/README.md](./composables/README.md).

**Framework extraction:** The reusable industrial workflow kernel is being
extracted in-place as private npm workspace packages under
[`packages/`](./packages/README.md). Current runtime imports remain stable while
the packages mature behind compatibility wrappers.

---

### 2. `file-processing-worker` — DXF File Processing Service

**Purpose:** Converts uploaded DXF cassette templates into validated metadata, SVG previews, and geometry data. Deployed in two size modes to handle files with large entity counts without blocking normal jobs.

| | |
|---|---|
| **Technologies** | Python, ezdxf, pymongo |
| **Source** | `workers/fileprocessing/` (core logic shared with cassette-processing) |
| **Entry point** | `workers/fileprocessing/main.py` |
| **Communication** | MongoDB polling — no inbound HTTP |

**Job contract (MongoDB `user_dxf_files` collection):**

| Field | Description |
|---|---|
| `processingStatus` | `pending` → `processing` → `completed` / `error` |
| `worker_tag` | `undefined` (normal) or `"1k_entity_count"` (large files) |
| `validEntityCount` | Set by worker on first pass |

**Routing logic:** If entity count exceeds the max limit, the normal worker resets `processingStatus` to `pending` and sets `worker_tag: "1k_entity_count"`, handing off to the high-capacity instance.

**Deployment modes:** `WORKER_TAG` env var distinguishes normal vs `1k_entity_count` instances.

See [workers/fileprocessing/README.md](./workers/fileprocessing/README.md).

---

### 3. `cassette-processing-worker` (shares image with `file-processing-worker`)

**Purpose:** Bakes parametric cassette template definitions into concrete DXF geometry files, stored back to GridFS.

| | |
|---|---|
| **Technologies** | Python, ezdxf, pymongo |
| **Source** | `workers/cassette-processing/` (imports from `workers/fileprocessing/` for DXF utilities) |
| **Entry point** | `workers/cassette-processing/main.py` |
| **Communication** | MongoDB polling — no inbound HTTP |

**Job contract (MongoDB `cassettes` collection):**

| Field | Description |
|---|---|
| `processingStatus` | `pending` → `processing` → `completed` / `error` |

See [workers/cassette-processing/README.md](./workers/cassette-processing/README.md).

---

### 4. `nesting-worker` — 2D Bin Packing Service

**Purpose:** Pure algorithm HTTP service. Receives cassette polygon geometry and sheet parameters, runs the jagua-rs nesting engine, and returns the placement solution. Has no database access.

| | |
|---|---|
| **Technologies** | Python, FastAPI, jagua-rs (Rust binary `lbf`) |
| **Source** | `workers/nesting/` |
| **Entry point** | `workers/nesting/worker_service.py` |
| **Communication** | Inbound HTTP from `cutkit-app` |

**API Contract:**

```
POST /nest
Content-Type: application/json

Request:
{
  "items": [{ "id": int, "cassette_id": str, "coords": [[x,y],...], "handles": [str], "count": int }],
  "params": { "width": float, "height": float, "space": float, "sheetCount": int }
}

Response: lbf JSON — layouts with placed items and affine transformations
```

See [workers/nesting/README.md](./workers/nesting/README.md).

---

### 5. `mongo` — MongoDB 4.4 (Infrastructure)

Primary datastore for all entities, job queues, and file metadata. GridFS stores binary files (DXF, SVG, PDF).

**Key indexing strategy:** `lineage.*Id` fields are indexed to enable O(1) reverse lookups across the full ancestry tree (multi-tenant isolation without joins).

---

## Data Flows

```
User uploads DXF
  → cutkit-app stores to GridFS, creates user_dxf_files doc with status=pending
  → file-processing-worker polls, extracts geometry, writes SVG back to GridFS

User creates Queue + starts Nesting Run
  → cutkit-app collects cassette polygons from DB
  → POST /nest to nesting-worker (HTTP, no DB)
  → nesting-worker returns placement solution
  → cutkit-app stores nesting_run + sheet_designs to MongoDB

Queue is marked CUT
  → State machine fires hook → creates Sheet + CassetteInstance documents
  → Material pile counts decremented

CassetteInstance lifecycle
  NESTED → MANUFACTURED → ON_SITE → INSTALLED
  → Every transition logged to status_events, lineage preserved
```

---

## Cross-Cutting Conventions

- **User IDs** are OAuth string IDs, not MongoDB ObjectIds.
- **Lineage** is flat and cumulative: `child.lineage = { ...parent.lineage, [parentType]Id: parent._id }`.
- **Standard Blocks**: Every entity has `identity`, `status`, `origin`, `lineage`. See [server/README.md](./server/README.md).
- **State machines**: All status transitions go through `server/core/machines/`; side-effects registered per-feature.
- **No cross-module DB access**: Features talk to each other via service calls only.
- **Serialization**: API endpoints always return `Model.toJSON()`, never raw DB docs.

## Component Documentation

| Component | Doc |
|---|---|
| Backend API + features | [server/README.md](./server/README.md) |
| Feature modules | [server/features/README.md](./server/features/README.md) |
| Frontend composables | [composables/README.md](./composables/README.md) |
| Frontend components | [components/README.md](./components/README.md) |
| Frontend design system | [docs/DESIGN_SYSTEM.md](./docs/DESIGN_SYSTEM.md) |
| Framework packages | [packages/README.md](./packages/README.md) |
| Framework manifest | [framework.manifest.json](./framework.manifest.json) |
| Framework extraction status | [docs/FRAMEWORK_EXTRACTION_STATUS.md](./docs/FRAMEWORK_EXTRACTION_STATUS.md) |
| All workers overview | [workers/README.md](./workers/README.md) |
| File processing worker | [workers/fileprocessing/README.md](./workers/fileprocessing/README.md) |
| Cassette processing worker | [workers/cassette-processing/README.md](./workers/cassette-processing/README.md) |
| Nesting worker | [workers/nesting/README.md](./workers/nesting/README.md) |
| Data schema (generated) | [server/DATA_MODEL.md](./server/DATA_MODEL.md) |
| Deployment & ops | [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) |
