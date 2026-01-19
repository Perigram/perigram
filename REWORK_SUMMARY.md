# System Rework Summary & Key Decisions

**Document Purpose:** High-level overview of the transformation plan for quick reference.

---

## What's Being Built

Transform Cutkit from **single-user OAuth app** into **multi-tenant B2B manufacturing system** with:
- 4 organization types (Service Provider, Manufacturer, Contractor, Customer)
- 5 user roles with granular permissions
- Complete material supply chain (Catalogs → Requisitions → Batches → Sheets → Cassettes)
- Material accounting and waste tracking

---

## Major Changes at a Glance

### Authentication System
**Before:** OAuth (Google/GitHub) → Simple session  
**After:** Email/Password → JWT + Refresh Tokens → RBAC permissions

**Impact:** All existing users will need to re-register

### Terminology Shift
**Before:** Projects → Batches (nesting groups) → Cassettes  
**After:** Projects → Queues (nesting groups) → Cassettes  
**NEW:** Material Batches (deliveries from manufacturer)

**Impact:** Extensive find/replace across codebase, rename collection in DB

### Data Model Explosion
**Current Collections:** 8 (users, projects, batches, cassettes, artifacts, materials, tools, layers)  
**After Rework:** ~20+ (add organizations, warehouses, catalogs, requisitions, material_batches, sheets, remnants, cassette_designs, cassette_instances, sheet_designs, audit_logs, notifications, etc.)

---

## Technical Decisions Made for You

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Password Hashing | **Argon2id** | Industry standard, more secure than bcrypt |
| Auth Tokens | **JWT (15min) + Refresh (7d)** | Standard practice, stateless access tokens |
| Permissions Model | **RBAC with entity-level ACL** | Flexible, supports restrictedTo specific IDs |
| API Style | **REST** (keep existing) | Sufficient for scale, familiar |
| State Management | **Pinia** (keep existing) | Works well, no need to change |
| Database | **MongoDB native driver** (keep) | No ORM needed, works great |

---

## Critical Architectural Patterns

### 1. Organization Isolation
Every data query MUST filter by `organizationId` (except SuperAdmin).

```javascript
// BAD
const projects = await db.collection('projects').find({}).toArray();

// GOOD
const projects = await db.collection('projects').find({ 
  organizationId: user.organizationId 
}).toArray();
```

### 2. Permission Checks Everywhere
Every service function MUST check permissions.

```javascript
// In service.js
export async function deleteProject(projectId, userId) {
  const user = await usersService.getById(userId);
  
  // Check permission
  if (!hasPermission(user.permissions, 'projects', 'delete')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Check ownership
  const project = await repository.findById(projectId);
  if (project.organizationId !== user.organizationId && user.role !== 'SuperAdmin') {
    throw createError({ statusCode: 403, message: 'Not your organization' });
  }
  
  // Proceed with deletion
  await repository.deleteById(projectId);
}
```

### 3. Lazy Sheet Creation
Sheets are NOT created when batch arrives. They're created when needed:

**Material Batch** (delivery arrives):
```javascript
{
  piles: [
    { totalCount: 100, remainingCount: 100 } // Just a number
  ]
}
```

**Queue Uses Sheets** (allocate from pile):
```javascript
// Create 10 actual sheet records
await sheetsService.allocateFromBatch(batchId, pileId, 10, userId);
// Pile now: remainingCount: 90

// Sheets collection now has 10 documents with status: "in_stock"
```

### 4. Status History Tracking
All entities with status changes MUST have `statusHistory` array:

```javascript
{
  status: "fulfilled",
  statusHistory: [
    { status: "draft", timestamp: "2024-01-01T10:00:00Z", userId: "user1" },
    { status: "sent", timestamp: "2024-01-02T11:00:00Z", userId: "user1" },
    { status: "approved", timestamp: "2024-01-03T14:00:00Z", userId: "user2" },
    { status: "fulfilled", timestamp: "2024-01-05T09:00:00Z", userId: "user2", note: "Shipped via FedEx" }
  ]
}
```

---

## Phasing Strategy (Why This Order)

### Phase 1: Auth & Users FIRST
**Why:** Nothing works without proper auth. Foundation for everything.
**Risk:** Breaks all existing functionality temporarily.
**Duration:** 3-5 days

### Phase 2: Fix What Breaks
**Why:** Get existing features (Projects, Queues, Nesting) working with new auth.
**Risk:** If skipped, can't test anything end-to-end.
**Duration:** 2-3 days

### Phase 3: Build Supply Chain
**Why:** New features, isolated from existing functionality. Can develop in parallel.
**Risk:** Complex interdependencies (Catalogs → Requisitions → Batches → Sheets).
**Duration:** 5-7 days

### Phase 4: Polish & Advanced
**Why:** Nice-to-haves, reports, dashboards, lifecycle tracking.
**Risk:** Low, mostly UI work.
**Duration:** 3-5 days

---

## Potential Issues & Solutions

### Issue 1: "Batches" Name Collision
**Problem:** Current system uses "batches" for nesting groups. Spec uses "Batch" for material deliveries.

**Solution:** Rename current batches → queues everywhere.
- Collection: `batches` → `queues`
- Feature dir: `server/features/batches/` → `server/features/queues/`
- API: `/api/batch/` → `/api/queue/`
- UI: `BatchEditor.vue` → `QueueEditor.vue`
- Variables: `batchId` → `queueId`, `batch` → `queue`

**Estimated Impact:** 200+ file changes, but mostly find/replace.

---

### Issue 2: Sheet vs Pile Relationship Complexity
**Problem:** Spec says "sheets are tracked when taken from batch" but also describes "piles with sheet counts."

**Solution (Implemented in Plan):**
- **Batch Pile:** Virtual grouping with `totalCount` and `remainingCount` (numbers)
- **Sheets Collection:** Individual sheet documents created lazily via `allocateFromBatch()`
- **Relationship:** Sheet has `batchId` + `pileId` references

**Example Flow:**
1. Manufacturer sends batch with pile (100 sheets) → `remainingCount: 100`
2. Contractor creates queue needing 10 sheets → Call `allocateFromBatch(batchId, pileId, 10)`
3. System creates 10 sheet documents → Pile now `remainingCount: 90`
4. Sheets marked "in_stock" → Can be used in nesting

---

### Issue 3: Permission System Complexity
**Problem:** 9 entities × 3 actions (read/write/delete) = 27 permission checks. Plus restrictedTo IDs.

**Solution (In Plan):**
- Default permission templates per role (see Phase 1.3)
- Helper function: `hasPermission(user, entity, action)` checks permissions.entities[entity][action]
- `restrictedTo` array limits to specific entity IDs (for Individual Users)
- Middleware: `requirePermission(event, 'projects', 'write')` in API handlers

**Performance Note:** Permissions loaded once per request from JWT payload (fast).

---

### Issue 4: OAuth to Password Migration
**Problem:** Existing users can't login after OAuth removal.

**Solution:** 
- **No migration** (per your instruction: no backwards compatibility)
- Seed script creates test users for each role
- Production: Manual user creation by SuperAdmin

**Alternative (if needed later):** 
- Create migration script: OAuth users → email users with temp passwords
- Send password reset emails

---

### Issue 5: GridFS Bucket Proliferation
**Problem:** Current system has multiple GridFS buckets (avatars, cassettes, userDxf, userDxfFilesSvg, nestSvg).

**Recommendation (For Phase 2.4 Cleanup):**
- **Keep:** `cassettes`, `artifacts`, `avatars`
- **Investigate:** `userDxf` (used for worker compatibility, might still be needed)
- **Remove if unused:** `userDxfFilesSvg`, `nestSvg` (check grep results)

**Consolidation Idea:** Single `files` bucket with metadata.type field?

---

### Issue 6: Cassette Lifecycle Overkill?
**Problem:** Spec requires Template → Design → Instance. That's 3 levels of abstraction.

**Question for You:** Can we merge Design + Instance for MVP?

**Current Plan (As Specified):**
- **Template:** Abstract parametric definition (existing `cassette_templates`)
- **Design:** Baked cassette with specific dimensions (`cassette_designs`)
- **Instance:** Physical cassette cut from sheet (`cassette_instances`)

**Simplified Alternative:**
- **Template:** Parametric definition
- **Instance:** Physical cassette with baked parameters + tracking

**Decision Needed:** Keep 3 levels or simplify? Plan implements full 3-level system as specified.

---

## Testing Strategy for Agents

### Manual Testing Checklist (Copy-Paste Friendly)

After Phase 1:
```
[ ] Register new user (email/password)
[ ] Login → Receive JWT token
[ ] Access protected endpoint with token
[ ] Token refresh works
[ ] Logout invalidates session
[ ] SuperAdmin can create organization
[ ] Org Admin can create user in their org
[ ] Permission checks work (try accessing without permission)
```

After Phase 2:
```
[ ] Login as Contractor
[ ] Create project
[ ] Create queue in project
[ ] Add cassettes to queue
[ ] Trigger nesting
[ ] View artifacts
[ ] Mark queue as cut
[ ] Check project cutLogs updated
```

After Phase 3:
```
[ ] Manufacturer creates catalog with sheet types
[ ] Contractor views catalogs
[ ] Contractor creates requisition
[ ] Manufacturer approves requisition
[ ] Manufacturer creates material batch
[ ] Batch status: sent → arrived → in_stock
[ ] Contractor allocates sheets from batch
[ ] Sheets appear in warehouse inventory
[ ] Use sheets in queue nesting
[ ] Mark queue as cut → Sheets become "milled"
[ ] Remnants created automatically
```

### API Testing Examples

**Register:**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "contractor@example.com",
    "password": "SecurePass123!",
    "name": "John Contractor",
    "organizationId": "org123",
    "role": "ContractorAdmin"
  }'
```

**Login:**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "contractor@example.com",
    "password": "SecurePass123!"
  }'
# Returns: { accessToken, refreshToken }
```

**Use Protected Endpoint:**
```bash
curl -X GET http://localhost:3000/api/projects \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

---

## Code Removal Candidates

### Confirmed for Removal
- `server/api/auth/github/` (entire directory)
- `server/api/auth/google/` (entire directory)
- `pages/auth/github/callback.vue`
- `pages/auth/google/callback.vue`
- `server/utils/user.js` (replaced by users service)

### Investigate & Potentially Remove
- `workers/fileprocessing/` (check if used: grep results show none)
- `workers/cassette-processing/` (check if used: grep results show none)
- `userDxf` GridFS bucket (still used in cassettes service, keep for now)

### Keep & Update
- All current features (projects, cassettes, materials, tool-profiles, layer-standards, pen-templates)
- Nesting worker (critical)
- Payment system (move to organization level)

---

## Database Schema Quick Reference

### Core Auth
- `organizations` (12 fields, 3 indexes)
- `users` (extended to 15+ fields, 4 indexes)

### Material Accounting
- `warehouses` (9 fields, 3 indexes)
- `catalogs` (8 fields + nested sheetTypes, 3 indexes)
- `requisitions` (12 fields + nested items, 5 indexes)
- `material_batches` (12 fields + nested piles, 6 indexes)
- `sheets` (11 fields + nested history, 5 indexes)
- `remnants` (12 fields, 5 indexes)

### Production
- `queues` (renamed from batches, existing structure)
- `cassette_designs` (NEW, 8 fields)
- `cassette_instances` (NEW, 11 fields + tracking)
- `sheet_designs` (NEW, 5 fields)

### Existing (Keep)
- `projects` (extend with collaborators, metadata)
- `cassette_templates` (keep as-is)
- `artifacts` (keep as-is)
- `materials` (keep as-is)
- `tool_profiles` (keep as-is)
- `layer_standards` (keep as-is)
- `pen_templates` (keep as-is)

**Total Collections After Rework:** ~20

---

## UI Structure Recommendation

### Navigation Based on Role

**SuperAdmin:**
```
Dashboard
├── System Overview
Organizations
├── List all orgs
├── Create org
├── Manage limits
Users
├── All users across orgs
├── Permission management
Audit Logs
System Settings
```

**ManufacturerAdmin:**
```
Dashboard
├── Requisition alerts
├── Outgoing batches
Catalogs
├── My catalogs
├── Sheet types
Requisitions (Incoming)
├── Pending approval
├── Approved
Material Batches (Outgoing)
├── To assemble
├── To ship
My Organization
├── Users
├── Settings
```

**ContractorAdmin:**
```
Dashboard
├── Active projects
├── Warehouse summary
Projects
├── Create/manage projects
Queues (Nesting)
├── By project
Warehouse
├── Inventory (sheets, remnants)
├── Material batches (incoming)
Catalogs (Browse)
├── View manufacturer catalogs
Requisitions (Outgoing)
├── Create requisition
├── Track status
Cassette Instances
├── Production tracking
My Organization
├── Users
├── Billing (Stripe)
```

**CustomerAdmin:**
```
Dashboard
My Projects
├── View progress
├── Cassette status
My Organization
├── Users
```

**IndividualUser:**
```
Dashboard (minimal)
Assigned Items
├── Based on restrictedTo permissions
```

---

## Dependencies to Install

```json
{
  "dependencies": {
    "argon2": "^0.31.0",        // Password hashing
    "jsonwebtoken": "^9.0.2"     // JWT tokens
  }
}
```

All other dependencies already in package.json.

---

## Environment Variables Update

### Add (New):
```env
JWT_SECRET=<random-256-bit-hex>
JWT_REFRESH_SECRET=<random-256-bit-hex>
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
```

### Remove (Old):
```env
# Remove these after OAuth deletion
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

### Keep (Existing):
```env
MONGODB_URI=...
STRIPE_SECRET_KEY=...  # Still needed, just scoped to org
# ... all other existing vars
```

---

## Seed Script Overview

File: `server/scripts/seed-auth-system.js`

Creates:
1. **Service Provider Org**
   - Type: ServiceProvider
   - Name: "Cutkit Platform"

2. **Super Admin User**
   - Email: admin@cutkit.dev
   - Password: Admin123!
   - Role: SuperAdmin

3. **Test Manufacturer Org + Admin**
   - Org: "Test Manufacturer Co."
   - User: mfg@test.com / Mfg123!
   - With sample catalog

4. **Test Contractor Org + Admin**
   - Org: "Test Contractor LLC"
   - User: contractor@test.com / Cont123!
   - With warehouse

5. **Test Customer Org + Admin**
   - Org: "Test Customer Inc."
   - User: customer@test.com / Cust123!

6. **Individual User in Contractor Org**
   - Email: worker@test.com / Work123!
   - Role: IndividualUser
   - Limited permissions

---

## Migration Commands (One-Time)

```bash
# 1. Rename collection
node server/scripts/migrate-batches-to-queues.js

# 2. Create indexes
node server/db/indexes.js create

# 3. Seed auth system
node server/scripts/seed-auth-system.js

# 4. Seed existing data (layers, pens, tools)
node server/scripts/seed-all.js
```

---

## Success Criteria

### Phase 1 Complete When:
- [ ] Can register user with email/password
- [ ] Can login and receive JWT
- [ ] Can create organization (as SuperAdmin)
- [ ] Can create user in organization (as Admin)
- [ ] Permission checks work on all endpoints
- [ ] OAuth completely removed

### Phase 2 Complete When:
- [ ] All references to "batch" → "queue" renamed
- [ ] Can create project with new auth
- [ ] Can create queue with new auth
- [ ] Can run nesting
- [ ] Can mark queue as cut
- [ ] All existing features work with new auth

### Phase 3 Complete When:
- [ ] Manufacturer can create catalog
- [ ] Contractor can browse catalogs
- [ ] Contractor can create requisition
- [ ] Manufacturer can approve and fulfill requisition
- [ ] Material batches can be created and tracked
- [ ] Sheets can be allocated from batches
- [ ] Sheets can be used in queues
- [ ] Remnants are created after cutting

### Phase 4 Complete When:
- [ ] Cassette instances tracked through lifecycle
- [ ] Dashboard shows role-appropriate widgets
- [ ] Reports can be generated
- [ ] All NEOLIT.md files updated
- [ ] Manual testing passes all scenarios

---

## Questions & Clarifications Resolved

✅ **Backwards compatibility?** No, fresh start.  
✅ **Auth system?** Password-based, no OAuth.  
✅ **Batch terminology?** Rename current batches → queues.  
✅ **Sheet tracking?** Lazy creation from piles.  
✅ **Phasing?** Auth first, then core features, then new features.  
✅ **UI approach?** PrimeVue defaults, permission-based dashboards.  
✅ **Payment?** Contractor org only.  
✅ **Tech choices?** Argon2, JWT, keep Pinia, REST.  

❓ **Still unclear:**
- Cassette lifecycle: Need all 3 levels (Template/Design/Instance)?
- Email verification: Required or optional?
- GridFS cleanup: Consolidate buckets?

---

## For Implementing Agents: Quick Start

1. **Read SYSTEM_REWORK_PLAN.md fully** (this is the source of truth)
2. **Pick a task from Phase 1.1** (start with OAuth removal)
3. **Check "Files to Create/Modify"** section
4. **Follow patterns** (Service-Repository, permission checks)
5. **Create NEOLIT.md** for new features
6. **Test before moving on**
7. **Update this summary** if you make different decisions

---

**End of Summary**
