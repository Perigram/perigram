# System Rework Plan

This document outlines the detailed step-by-step plan to implement the changes described in `@BIGREWORK.md`, ensuring all data models, user roles, and accounting flows are captured.

## 1. Architectural Restructuring & Terminology Shift

### Goal
Clear the path for new entities by renaming conflicting terms and establishing the standardized directory structure.

### Tasks
- [ ] **Rename "Batch" (Nesting) to "Queue":**
    - Rename `server/features/batches` -> `server/features/queues`.
    - Rename DB collection `batches` -> `queues`.
    - **Codebase Search & Replace:** Update all imports, API routes (`/api/batches`), and UI labels from "Batch" to "Queue" to strictly refer to nesting jobs.
    - **Frontend:** Rename `BatchManagement.vue` -> `QueueManagement.vue`, etc.
- [ ] **Standardize Feature Structure:**
    - Ensure all new features follow the `server/features/[name]/` pattern with `service.js` (logic) and `repository.js` (DB).
- [ ] **Remove Legacy Auth:**
    - Delete `server/api/auth/github` and `server/api/auth/google`.
    - Remove social login components from UI.

## 2. Advanced User & Organization System

### Goal
Implement the hierarchical user system with specific roles and cross-organization collaboration.

### Tasks
- [ ] **Feature: Organizations (`server/features/organizations`)**
    - **Schema:**
        - `name`: String
        - `type`: Enum ["Manufacturer", "Contractor", "Customer", "Service Provider"]
        - `settings`: Object (Custom limits, capabilities)
        - `capabilities`: Object (e.g., `{ cutting: boolean, installing: boolean }` for Contractors)
    - **Logic:** CRUD operations.
- [ ] **Feature: Users (`server/features/users`)**
    - **Schema Updates:**
        - `email`: String (Unique)
        - `passwordHash`: String (Argon2/Bcrypt)
        - `organizationId`: ObjectId
        - `globalRole`: Enum ["Super Admin", "Manufacturer Admin", "Contractor Admin", "Customer Admin", "Individual User"]
        - `permissions`: Array<String> (Fine-grained access control)
        - `associations`: Array<{ userId: ObjectId, organizationId: ObjectId, role: String }> (For cross-org collaboration)
    - **Logic:** Registration (Org + User), Login (Session/JWT), Password Reset.
- [ ] **Feature: Access Control:**
    - Middleware to enforce role-based access limits (e.g., Manufacturer Admin only sees their catalogs).

## 3. Material Accounting Data Model

### Goal
Implement the core inventory and supply chain entities with strict attribute tracking.

### Tasks
- [ ] **Feature: Warehouses (`server/features/warehouses`)**
    - **Schema:**
        - `organizationId`: ObjectId
        - `location`: { address: String, contactPerson: String }
        - `inventorySummary`: Object (Cached counts of sheets/remnants)
    - **Logic:** Every Org has at least one default warehouse.
- [ ] **Feature: Catalogs (`server/features/catalogs`)**
    - **Schema:**
        - `manufacturerId`: ObjectId
        - `sheetTypes`: Array<{ material: String, color: String, thickness: Number, foilThickness: Number, sizes: Array<Size>, price: Number }>
        - `metadata`: { version: Number, lastUpdated: Date }
- [ ] **Feature: Requisitions (`server/features/requisitions`)**
    - **Schema:**
        - `contractorId`: ObjectId
        - `manufacturerId`: ObjectId
        - `items`: Array<{ sheetTypeId: ObjectId, quantity: Number, ...snapshotOfPrice }>
        - `status`: Enum ["draft", "sent", "approved", "fulfilled", "canceled"]
        - `statusHistory`: Array<{ status: String, timestamp: Date, userId: ObjectId }>
        - `linkedBatchIds`: Array<ObjectId> (Fulfillment links)
- [ ] **Feature: Material Batches (`server/features/batches` - NEW)**
    - **Schema:**
        - `receiptId`: String (Manual reference)
        - `supplierId`: ObjectId (Manufacturer)
        - `beneficiaryId`: ObjectId (Receiver Warehouse)
        - `piles`: Array<{ manufacturerPartyId: String, count: Number, sheetCharacteristics: Object, price: Number }>
        - `status`: Enum ["requested", "assembled", "sent", "arrived", "in stock", "partially used", "used up"]
        - `auditLog`: Array<{ action: String, timestamp: Date, userId: ObjectId }>
- [ ] **Feature: Inventory Items (`server/features/inventory`)**
    - **Entity: Sheet**
        - `batchId`: ObjectId
        - `pileId`: String
        - `status`: Enum ["in stock", "in cutting", "milled"]
        - `history`: Array<{ action: String, user: ObjectId, time: Date }> (Track Operator/Storekeeper)
    - **Entity: Remnant**
        - `sourceSheetId`: ObjectId
        - `geometry`: String (DXF/SVG path)
        - `qrCode`: String
        - `isReusable`: Boolean

## 4. Cassette Lifecycle & Design

### Goal
Separate the "Template" (Abstract) from the "Design" (Baked) and "Instance" (Physical).

### Tasks
- [ ] **Feature: Cassette Designs (`server/features/cassette-designs`)**
    - **Schema:**
        - `templateId`: ObjectId (Link to existing Cassette Template)
        - `parameters`: Object (Specific dimensions used)
        - `geometry`: String (Generated DXF content)
        - `sheetDesignId`: ObjectId (Link to nesting layout)
- [ ] **Feature: Cassette Instances (`server/features/cassette-instances`)**
    - **Schema:**
        - `designId`: ObjectId
        - `sheetId`: ObjectId (Physical sheet source)
        - `projectId`: ObjectId
        - `status`: Enum ["nested", "manufactured", "on-site", "installed"]
        - `tracking`: Array<{ status: String, timestamp: Date, userId: ObjectId }>
- [ ] **Feature: Sheet Designs (`server/features/sheet-designs`)**
    - **Schema:**
        - `geometry`: String (Full nesting layout DXF)
        - `derivedEntities`: Array<{ type: "cassette"|"remnant", id: ObjectId }>

## 5. Project & Workflow Integration

### Goal
Tie the new material flows into the existing project structure.

### Tasks
- [ ] **Update Project Feature (`server/features/projects`)**
    - **Schema Extension:**
        - `customer`: ObjectId (or String)
        - `contractorId`: ObjectId (Owner)
        - `collaborators`: Array<ObjectId> (M:N User relationship)
        - `metadata`: { deadlines: Date, address: String }
- [ ] **Nesting Integration:**
    - Update Nesting Worker to:
        1. Accept `availableSheets` from Inventory (not just generic sizes).
        2. On completion, generate `SheetDesign` and `CassetteDesign` records.
        3. NOT automatically update Inventory status (leave that for "Cutting" confirmation step).

## 6. Implementation Strategy

### Step 1: Core Refactor
1. Rename Batches -> Queues.
2. Setup Org/User Schemas.
3. Implement Auth.

### Step 2: Supply Chain (Backend)
1. Create Catalogs & Warehouses.
2. Implement Requisition -> Material Batch flow.
3. Create Inventory (Sheets) generation logic.

### Step 3: Production (Backend)
1. Implement Cassette Design/Instance logic.
2. Link Nesting (Queues) to Inventory.

### Step 4: Frontend
1. **Admin Dashboard:** Manage Orgs/Users.
2. **Manufacturer View:** Manage Catalogs, incoming Requisitions.
3. **Contractor View:** Project mgmt, Requisitions, Stock (Warehouse).
4. **Operations:** "Cut" confirmation screens (updating Sheet status).

## Notes & Constraints
- **Billing:** Maintain existing Stripe logic but associate it with `Organization` (Contractor Admin), not individual users.
- **Migration:** Assume fresh start for data, but keep code compatible where possible.
- **1C Integration:** Ensure all "Transaction" style records (Batch receipt, Sheet cut) have strict timestamps and IDs for future export.
