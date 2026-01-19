# System Rework Plan - Cutkit Multi-Tenant Transformation

**Version:** 1.0  
**Created:** 2026-01-19  
**Status:** Planning Phase

---

## Executive Summary

Transform Cutkit from single-tenant OAuth application into multi-tenant material accounting and production system supporting Manufacturers, Contractors, and Customers with role-based access control and complete material lifecycle tracking.

### Key Changes
- **Authentication:** Remove OAuth → Add password-based auth with JWT
- **Users:** Simple users → Organizations + Role-based users with permissions
- **Terminology:** Batches (nesting) → Queues; New "Batches" for material deliveries
- **Data Model:** Add Warehouses, Catalogs, Requisitions, Material Batches, Sheet tracking, Remnants
- **UI:** Single dashboard → Dynamic permission-based multi-tenant dashboards

### Implementation Phases
1. **Phase 1:** Authentication & User System (3-5 days)
2. **Phase 2:** Core Feature Preservation (2-3 days)
3. **Phase 3:** Material Accounting System (5-7 days)
4. **Phase 4:** Advanced Features & Integration (3-5 days)

---

# Phase 1: Authentication & User System

## 1.1 Remove OAuth System

### Tasks
- [ ] **Remove OAuth API endpoints**
  - Delete: `server/api/auth/github/` (entire directory)
  - Delete: `server/api/auth/google/` (entire directory)
  - Keep: `server/api/auth/logout.post.js` (will be updated)

- [ ] **Remove OAuth pages**
  - Delete: `pages/auth/github/callback.vue`
  - Delete: `pages/auth/google/callback.vue`

- [ ] **Remove OAuth utilities**
  - In `server/utils/auth.js`: Keep session functions, remove OAuth-specific code
  - Remove OAuth client IDs from `.env` and config

- [ ] **Update UI**
  - Remove OAuth buttons from login page
  - Update profile page (`pages/profile/index.vue`) - remove OAuth badge

### Files Changed
```
server/api/auth/github/ (DELETE)
server/api/auth/google/ (DELETE)
pages/auth/github/ (DELETE)
pages/auth/google/ (DELETE)
```

---

## 1.2 Create Organizations System

### Database Schema
```javascript
// Collection: organizations
{
  _id: ObjectId,
  name: String,                    // "Acme Manufacturing"
  slug: String,                    // "acme-mfg" (unique)
  type: String,                    // "Manufacturer" | "Contractor" | "Customer" | "ServiceProvider"
  contactInfo: {
    email: String,
    phone: String,
    address: String
  },
  settings: {
    maxUsers: Number,              // Set by Super Admin
    featuresEnabled: [String],     // ["catalogs", "warehouses", "projects"]
    contractLimits: Object         // Custom limits per contract
  },
  capabilities: {                  // Contractor-specific
    hasCutting: Boolean,
    hasInstalling: Boolean
  },
  createdAt: Date,
  updatedAt: Date,
  createdBy: String                // userId of creator
}
```

### Implementation
- [ ] **Create feature structure**
  ```bash
  mkdir -p server/features/organizations
  cp -r server/features/_template/* server/features/organizations/
  ```

- [ ] **Implement repository** (`server/features/organizations/repository.js`)
  - `create(data)` - Create organization
  - `findById(id)` - Get by ID
  - `findBySlug(slug)` - Get by slug
  - `find(filter, options)` - List with pagination
  - `updateById(id, updates)` - Update
  - `deleteById(id)` - Soft delete

- [ ] **Implement service** (`server/features/organizations/service.js`)
  - Validate organization type
  - Auto-generate slug from name
  - Ensure unique slug
  - Initialize default settings by type
  - Ownership checks (only Super Admin can modify)

- [ ] **Add to indexes** (`server/db/indexes.js`)
  ```javascript
  organizations: [
    { keys: { slug: 1 }, options: { unique: true, name: 'slug_unique' } },
    { keys: { type: 1 }, options: { name: 'type_idx' } },
    { keys: { createdAt: -1 }, options: { name: 'createdAt_idx' } }
  ]
  ```

### API Endpoints
- [ ] `POST /api/organizations` - Create (Super Admin only)
- [ ] `GET /api/organizations` - List (filtered by access)
- [ ] `GET /api/organizations/:slug` - Get details
- [ ] `PATCH /api/organizations/:slug` - Update
- [ ] `DELETE /api/organizations/:slug` - Delete (Super Admin only)

### Files to Create
```
server/features/organizations/
  ├── repository.js
  ├── service.js
  ├── index.js
  └── NEOLIT.md

server/api/organizations/
  ├── index.get.js          # List organizations
  ├── index.post.js         # Create organization
  ├── [slug].get.js         # Get single
  ├── [slug].patch.js       # Update
  └── [slug].delete.js      # Delete
```

---

## 1.3 Redesign User System

### Database Schema
```javascript
// Collection: users (REPLACE existing)
{
  _id: ObjectId,
  email: String,                   // unique, required
  passwordHash: String,            // Argon2id hash
  name: String,
  avatarUrl: String,               // optional
  
  organizationId: ObjectId,        // Link to organization
  globalRole: String,              // "SuperAdmin" | "ManufacturerAdmin" | "ContractorAdmin" | "CustomerAdmin" | "IndividualUser"
  
  permissions: {                   // Fine-grained permissions
    entities: {
      projects: { read: Boolean, write: Boolean, delete: Boolean },
      queues: { read: Boolean, write: Boolean, delete: Boolean },
      cassettes: { read: Boolean, write: Boolean, delete: Boolean },
      warehouses: { read: Boolean, write: Boolean, delete: Boolean },
      catalogs: { read: Boolean, write: Boolean, delete: Boolean },
      requisitions: { read: Boolean, write: Boolean, delete: Boolean },
      materials: { read: Boolean, write: Boolean, delete: Boolean },
      users: { read: Boolean, write: Boolean, delete: Boolean },
      organizations: { read: Boolean, write: Boolean, delete: Boolean }
    },
    restrictedTo: [ObjectId]       // Limit access to specific entity IDs (optional)
  },
  
  associations: [{                 // Cross-org collaborations
    userId: ObjectId,
    organizationId: ObjectId,
    role: String,
    grantedAt: Date
  }],
  
  sessions: [{                     // Keep existing session structure
    sessionId: String,
    expiresAt: Date,
    createdAt: Date,
    refreshToken: String,
    refreshTokenExpiresAt: Date
  }],
  
  isActive: Boolean,               // Can be disabled by admin
  lastLoginAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### Implementation
- [ ] **Update users repository** (`server/features/users/repository.js` - NEW)
  - `create(data)` - Create user with password
  - `findById(id)` 
  - `findByEmail(email)`
  - `findByOrganization(orgId, filter)`
  - `updateById(id, updates)`
  - `updatePassword(id, passwordHash)`
  - `addSession(userId, sessionData)`
  - `removeSession(userId, sessionId)`
  - `updatePermissions(userId, permissions)`

- [ ] **Implement users service** (`server/features/users/service.js` - NEW)
  - `register(email, password, name, organizationId, role)` - Registration with validation
  - `validatePassword(email, password)` - Login validation
  - `changePassword(userId, oldPassword, newPassword)`
  - `resetPassword(email)` - Generate reset token
  - `updateProfile(userId, updates)`
  - `managePermissions(adminId, userId, permissions)` - Admin function
  - `deactivate(userId)` - Soft delete

- [ ] **Create auth utilities** (`server/utils/auth-new.js`)
  ```javascript
  // Password hashing with Argon2
  export async function hashPassword(password)
  export async function verifyPassword(hash, password)
  
  // JWT tokens
  export function generateAccessToken(userId, role, permissions)
  export function generateRefreshToken(userId)
  export function verifyAccessToken(token)
  export function verifyRefreshToken(token)
  
  // Session management
  export function generateSession(userId)
  export async function createUserSession(userId, sessionData)
  export async function removeUserSession(sessionId)
  export async function getUserBySessionId(sessionId)
  
  // Permission checks
  export function hasPermission(user, entity, action)
  export function canAccessEntity(user, entity, entityId)
  ```

- [ ] **Install dependencies**
  ```bash
  npm install argon2 jsonwebtoken
  ```

- [ ] **Add to indexes**
  ```javascript
  users: [
    { keys: { email: 1 }, options: { unique: true, name: 'email_unique' } },
    { keys: { organizationId: 1 }, options: { name: 'organizationId_idx' } },
    { keys: { globalRole: 1 }, options: { name: 'globalRole_idx' } },
    { keys: { 'sessions.sessionId': 1 }, options: { name: 'sessions_sessionId_idx' } }
  ]
  ```

### Default Permission Templates
```javascript
// server/features/users/permission-templates.js
export const PERMISSION_TEMPLATES = {
  SuperAdmin: {
    entities: {
      projects: { read: true, write: true, delete: true },
      queues: { read: true, write: true, delete: true },
      cassettes: { read: true, write: true, delete: true },
      warehouses: { read: true, write: true, delete: true },
      catalogs: { read: true, write: true, delete: true },
      requisitions: { read: true, write: true, delete: true },
      materials: { read: true, write: true, delete: true },
      users: { read: true, write: true, delete: true },
      organizations: { read: true, write: true, delete: true }
    },
    restrictedTo: null
  },
  
  ManufacturerAdmin: {
    entities: {
      projects: { read: false, write: false, delete: false },
      queues: { read: false, write: false, delete: false },
      cassettes: { read: false, write: false, delete: false },
      warehouses: { read: true, write: true, delete: false },
      catalogs: { read: true, write: true, delete: true },
      requisitions: { read: true, write: true, delete: false },
      materials: { read: true, write: false, delete: false },
      users: { read: true, write: true, delete: true },      // Own org only
      organizations: { read: true, write: true, delete: false } // Own org only
    },
    restrictedTo: null // Filtered by organizationId in service layer
  },
  
  ContractorAdmin: {
    entities: {
      projects: { read: true, write: true, delete: true },
      queues: { read: true, write: true, delete: true },
      cassettes: { read: true, write: true, delete: true },
      warehouses: { read: true, write: true, delete: false },
      catalogs: { read: true, write: false, delete: false },  // View only
      requisitions: { read: true, write: true, delete: false },
      materials: { read: true, write: false, delete: false },
      users: { read: true, write: true, delete: true },      // Own org only
      organizations: { read: true, write: true, delete: false } // Own org only
    },
    restrictedTo: null
  },
  
  CustomerAdmin: {
    entities: {
      projects: { read: true, write: true, delete: true },
      queues: { read: true, write: false, delete: false },
      cassettes: { read: true, write: false, delete: false },
      warehouses: { read: false, write: false, delete: false },
      catalogs: { read: false, write: false, delete: false },
      requisitions: { read: true, write: false, delete: false },
      materials: { read: true, write: false, delete: false },
      users: { read: true, write: true, delete: true },      // Own org only
      organizations: { read: true, write: true, delete: false } // Own org only
    },
    restrictedTo: null
  },
  
  IndividualUser: {
    // Customizable by admin, starts with minimal permissions
    entities: {
      projects: { read: false, write: false, delete: false },
      queues: { read: false, write: false, delete: false },
      cassettes: { read: false, write: false, delete: false },
      warehouses: { read: false, write: false, delete: false },
      catalogs: { read: false, write: false, delete: false },
      requisitions: { read: false, write: false, delete: false },
      materials: { read: false, write: false, delete: false },
      users: { read: false, write: false, delete: false },
      organizations: { read: false, write: false, delete: false }
    },
    restrictedTo: [] // Can be set to specific entity IDs
  }
};
```

### API Endpoints
- [ ] `POST /api/auth/register` - Register user (requires invitation token or open registration)
- [ ] `POST /api/auth/login` - Login with email/password, returns JWT + refresh token
- [ ] `POST /api/auth/refresh` - Refresh access token
- [ ] `POST /api/auth/logout` - Logout (invalidate session)
- [ ] `POST /api/auth/change-password` - Change password
- [ ] `POST /api/auth/reset-password-request` - Request password reset
- [ ] `POST /api/auth/reset-password` - Complete password reset

- [ ] `GET /api/users` - List users (filtered by org and permissions)
- [ ] `GET /api/users/:id` - Get user details
- [ ] `POST /api/users` - Create user (by admin)
- [ ] `PATCH /api/users/:id` - Update user
- [ ] `PATCH /api/users/:id/permissions` - Update permissions (admin only)
- [ ] `DELETE /api/users/:id` - Deactivate user

- [ ] `GET /api/auth/me` - Get current user with full permissions

### Files to Create/Modify
```
server/features/users/
  ├── repository.js         (NEW)
  ├── service.js            (NEW)
  ├── index.js              (NEW)
  ├── permission-templates.js (NEW)
  └── NEOLIT.md             (NEW)

server/utils/
  ├── auth-new.js           (NEW - will replace auth.js)
  └── password.js           (NEW - Argon2 helpers)

server/api/auth/
  ├── register.post.js      (NEW)
  ├── login.post.js         (NEW)
  ├── refresh.post.js       (NEW)
  ├── logout.post.js        (MODIFY)
  ├── change-password.post.js (NEW)
  ├── reset-password-request.post.js (NEW)
  ├── reset-password.post.js (NEW)
  └── me.get.js             (NEW)

server/api/users/
  ├── index.get.js          (NEW)
  ├── index.post.js         (NEW)
  ├── [id].get.js           (NEW)
  ├── [id].patch.js         (NEW)
  ├── [id]/permissions.patch.js (NEW)
  └── [id].delete.js        (NEW)
```

---

## 1.4 Update Auth Middleware

### Implementation
- [ ] **Replace auth middleware** (`server/middleware/auth.js`)
  ```javascript
  import { defineEventHandler, parseCookies, getHeader } from 'h3';
  import { verifyAccessToken } from '~/server/utils/auth-new';
  import { getUserBySessionId } from '~/server/features/users/service';
  
  export default defineEventHandler(async (event) => {
    // Try JWT from Authorization header first
    const authHeader = getHeader(event, 'authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const payload = verifyAccessToken(token);
        event.context.auth = {
          userId: payload.userId,
          organizationId: payload.organizationId,
          role: payload.role,
          permissions: payload.permissions
        };
        return;
      } catch (err) {
        // Token invalid, continue to cookie check
      }
    }
    
    // Fallback to session cookie (for backward compatibility during migration)
    const cookie = parseCookies(event);
    const sessionId = cookie.sessionId;
    if (sessionId) {
      const user = await getUserBySessionId(sessionId);
      if (user) {
        event.context.auth = {
          userId: user._id.toString(),
          organizationId: user.organizationId?.toString(),
          role: user.globalRole,
          permissions: user.permissions
        };
      }
    }
  });
  ```

- [ ] **Create permission middleware** (`server/middleware/permissions.js` - NEW)
  ```javascript
  import { defineEventHandler, createError } from 'h3';
  import { hasPermission } from '~/server/utils/auth-new';
  
  // Use in API handlers: await requirePermission(event, 'projects', 'write')
  export function requirePermission(event, entity, action) {
    const auth = event.context.auth;
    if (!auth) {
      throw createError({ statusCode: 401, message: 'Authentication required' });
    }
    
    if (!hasPermission(auth, entity, action)) {
      throw createError({ 
        statusCode: 403, 
        message: `Permission denied: ${entity}.${action}` 
      });
    }
  }
  
  export function requireRole(event, ...allowedRoles) {
    const auth = event.context.auth;
    if (!auth) {
      throw createError({ statusCode: 401, message: 'Authentication required' });
    }
    
    if (!allowedRoles.includes(auth.role)) {
      throw createError({ 
        statusCode: 403, 
        message: 'Insufficient role privileges' 
      });
    }
  }
  ```

### Files to Modify/Create
```
server/middleware/
  ├── auth.js               (MODIFY)
  └── permissions.js        (NEW)
```

---

## 1.5 Create UI for Auth & User Management

### Login/Registration Pages
- [ ] **Create login page** (`pages/auth/login.vue`)
  - Email + Password form
  - "Forgot password?" link
  - Modern design with PrimeVue components
  - Error handling
  - Redirect to dashboard after login

- [ ] **Create registration page** (`pages/auth/register.vue`)
  - Email, Password, Confirm Password, Name
  - Organization selection (or create new for admins)
  - Role assignment (if invited by admin)
  - Terms acceptance checkbox

- [ ] **Create password reset pages**
  - `pages/auth/forgot-password.vue` - Email input
  - `pages/auth/reset-password.vue` - New password form with token

### User Management Dashboard
- [ ] **Update profile page** (`pages/profile/index.vue`)
  - Remove OAuth badge
  - Add password change section
  - Show organization info
  - Show role and permissions (read-only)
  - Keep billing tab (for ContractorAdmin only)

- [ ] **Create users management page** (`pages/admin/users.vue` - NEW)
  - DataTable with users list
  - Filter by organization, role, status
  - Actions: Edit, Deactivate, Change Permissions
  - Create user dialog
  - Permission editor component

- [ ] **Create organizations management page** (`pages/admin/organizations.vue` - NEW)
  - DataTable with organizations list
  - Filter by type
  - Actions: View, Edit, Manage Users
  - Create organization dialog
  - Settings editor (for Super Admin)

### Components
- [ ] **Create permission editor component** (`components/PermissionEditor.vue`)
  - Checkbox grid for entities x actions
  - RestrictedTo entity selector
  - Save/Cancel buttons
  - Visual indication of inherited permissions

- [ ] **Create user form component** (`components/UserForm.vue`)
  - Email, Name, Password (for new users)
  - Organization selector
  - Role selector
  - Permission template selector

- [ ] **Create organization form component** (`components/OrganizationForm.vue`)
  - Name, Type, Contact Info
  - Settings (for Super Admin)
  - Capabilities (for Contractors)

### Navigation Updates
- [ ] **Update nav bar** (`layouts/default.vue` or nav component)
  - Add "Admin" dropdown for SuperAdmin (Organizations, Users, System Settings)
  - Add "Team" menu for Org Admins (Manage Users in org)
  - Show organization name/logo
  - Profile dropdown with role badge

### Composables
- [ ] **Create auth composable** (`composables/useAuth.js` - MODIFY existing)
  ```javascript
  export const useAuth = () => {
    const user = useState('user', () => null);
    const permissions = useState('permissions', () => null);
    
    const login = async (email, password) => { /* ... */ };
    const logout = async () => { /* ... */ };
    const register = async (data) => { /* ... */ };
    const refreshToken = async () => { /* ... */ };
    const hasPermission = (entity, action) => { /* ... */ };
    const canAccess = (entity, entityId) => { /* ... */ };
    
    return { user, permissions, login, logout, register, hasPermission, canAccess };
  };
  ```

### Files to Create/Modify
```
pages/auth/
  ├── login.vue             (NEW - replaces OAuth flow)
  ├── register.vue          (NEW)
  ├── forgot-password.vue   (NEW)
  └── reset-password.vue    (NEW)

pages/admin/
  ├── users.vue             (NEW)
  └── organizations.vue     (NEW)

pages/profile/
  └── index.vue             (MODIFY - remove OAuth, add password change)

components/
  ├── PermissionEditor.vue  (NEW)
  ├── UserForm.vue          (NEW)
  └── OrganizationForm.vue  (NEW)

composables/
  └── useAuth.js            (MODIFY - new auth methods)

layouts/
  └── default.vue           (MODIFY - navigation updates)
```

---

## 1.6 Seeding & Testing

### Seed Script
- [ ] **Create seed script** (`server/scripts/seed-auth-system.js`)
  ```javascript
  // Seeds:
  // 1. Service Provider org (type: ServiceProvider)
  // 2. Super Admin user (admin@cutkit.dev / password123)
  // 3. Test Manufacturer org + Manufacturer Admin user
  // 4. Test Contractor org + Contractor Admin user
  // 5. Test Customer org + Customer Admin user
  ```

### Manual Testing Checklist
- [ ] Register new user
- [ ] Login with email/password
- [ ] JWT token refresh works
- [ ] Logout invalidates session
- [ ] Password change works
- [ ] Password reset flow (email mock)
- [ ] Permission checks enforce access control
- [ ] Admin can create users in their org
- [ ] Admin can assign permissions
- [ ] Super Admin can create organizations
- [ ] Role-based navigation works

### Files to Create
```
server/scripts/
  └── seed-auth-system.js   (NEW)
```

---

# Phase 2: Core Feature Preservation & Terminology Shift

**Goal:** Rename "Batches" → "Queues" and ensure all current functionality (Projects, Queues, Nesting, Artifacts, Cassettes) works with new auth system.

---

## 2.1 Rename Batches → Queues

### Database Migration
- [ ] **Rename collection** (via MongoDB shell or script)
  ```javascript
  // server/scripts/migrate-batches-to-queues.js
  db.batches.renameCollection('queues');
  ```

- [ ] **Update indexes**
  - In `server/db/indexes.js`: Rename `batches` → `queues`
  - Update index on `projectSlug` to reflect new collection name

### Backend Code Changes
- [ ] **Rename feature directory**
  ```bash
  mv server/features/batches server/features/queues
  ```

- [ ] **Update all files in feature**
  - `server/features/queues/repository.js` - Update COLLECTION constant to 'queues'
  - `server/features/queues/service.js` - Update all references, function names
  - `server/features/queues/NEOLIT.md` - Update documentation

- [ ] **Search and replace in codebase**
  ```bash
  # Find all batch-related imports and references
  grep -r "features/batches" server/ --include="*.js"
  grep -r "from.*batches" server/ --include="*.js"
  grep -r "batch" server/api/ --include="*.js" | grep -v "Batch" # lowercase batch
  ```
  
  Replace patterns:
  - `server/features/batches` → `server/features/queues`
  - Variable names: `batch` → `queue`, `batchId` → `queueId`, `batchNumber` → `queueNumber`
  - Function names: `getBatch` → `getQueue`, `createBatch` → `createQueue`, etc.

### API Endpoints Refactor
- [ ] **Rename API routes**
  - `server/api/batch/` → `server/api/queue/`
  - `server/api/project/[slug]/batches/` → `server/api/project/[slug]/queues/`

  New structure:
  ```
  server/api/queue/
    ├── [id].get.js           # Get queue details
    ├── [id].patch.js         # Update queue
    ├── [id]/nest.post.js     # Trigger nesting
    ├── [id]/choose-run.post.js  # Choose nesting run
    ├── [id]/mark-cut.post.js    # Mark as cut
    ├── [id]/reset.post.js    # Reset to draft
    └── [id]/artifacts.get.js # List artifacts

  server/api/project/[slug]/
    └── queues/
        ├── index.get.js      # List queues for project
        └── index.post.js     # Create queue
  ```

### Frontend Code Changes
- [ ] **Rename components**
  - `components/BatchEditor.vue` → `components/QueueEditor.vue`
  - Any other batch-specific components

- [ ] **Update pages**
  - `pages/project/[slug]/batches.vue` → `pages/project/[slug]/queues.vue`
  - `pages/project/[slug]/batch/[batchId].vue` → `pages/project/[slug]/queue/[queueId].vue`
  - Update all route references

- [ ] **Update composables/stores**
  - Search for `useBatch`, `batchStore`, etc.
  - Rename to `useQueue`, `queueStore`

- [ ] **Update i18n translations**
  - In `i18n/locales/en.json` and `i18n/locales/ru.json`
  - `batch` → `queue`, `batches` → `queues`
  - Keep original terms in Russian if they have different meaning

### Testing
- [ ] Projects list loads
- [ ] Can create new queue
- [ ] Queue editor loads with entries
- [ ] Can trigger nesting
- [ ] Nesting runs display correctly
- [ ] Can choose run
- [ ] Can mark as cut
- [ ] Artifacts download works

### Files to Rename/Modify
```
server/features/batches/            → server/features/queues/
server/api/batch/                   → server/api/queue/
server/api/project/[slug]/batches/  → server/api/project/[slug]/queues/
components/BatchEditor.vue          → components/QueueEditor.vue
pages/project/[slug]/batches.vue    → pages/project/[slug]/queues.vue
pages/project/[slug]/batch/[batchId].vue → pages/project/[slug]/queue/[queueId].vue
```

---

## 2.2 Integrate Auth with Existing Features

### Update All Services with Auth Checks
- [ ] **Projects service** (`server/features/projects/service.js` - if not exists, CREATE)
  - Add ownership checks: verify `userId` or `organizationId`
  - Check permissions before CRUD operations
  - Filter projects by organization for non-SuperAdmin

- [ ] **Queues service** (already has service.js)
  - Add permission checks
  - Verify user owns project before creating queue
  - Filter by organization

- [ ] **Cassettes service**
  - Update ownership from simple `userId` to consider organization
  - Add permission checks

- [ ] **Artifacts service**
  - Permission checks for download
  - Organization-based filtering

- [ ] **Materials service**
  - Super Admin can create/edit/delete
  - Others can only read

- [ ] **Tool Profiles, Layer Standards, Pen Templates**
  - Keep as system-wide resources
  - Read access for all, write for Super Admin only

### Update All API Endpoints
- [ ] **Add permission middleware to all routes**
  ```javascript
  // Example in server/api/project/[slug].get.js
  import { requirePermission } from '~/server/middleware/permissions';
  
  export default defineEventHandler(async (event) => {
    requirePermission(event, 'projects', 'read');
    // ... existing logic
  });
  ```

- [ ] **Update create endpoints** - Set `organizationId` from auth context
- [ ] **Update list endpoints** - Filter by organization (except SuperAdmin)
- [ ] **Update delete/update endpoints** - Verify ownership

### Files to Modify
```
server/features/projects/service.js   (CREATE or MODIFY)
server/features/queues/service.js     (MODIFY)
server/features/cassettes/service.js  (MODIFY)
server/features/artifacts/service.js  (MODIFY)
server/features/materials/service.js  (MODIFY)
server/features/tool-profiles/service.js (MODIFY)
server/features/layer-standards/service.js (MODIFY)
server/features/pen-templates/service.js (MODIFY)

server/api/**/                        (MODIFY all endpoints)
```

---

## 2.3 Update Payment System

### Move Payment to Organization Level
- [ ] **Update payment service** (`server/features/payment/`)
  - Change from user balance to organization balance
  - Only ContractorAdmin can purchase
  - Track usage per organization

- [ ] **Update users schema** - Remove `balance` field
- [ ] **Add to organizations schema** - Add `balance` field

- [ ] **Update payment API**
  - `GET /api/payment/balance` - Get org balance (not user balance)
  - `POST /api/payment/purchase` - Purchase for organization
  - Add permission check: only ContractorAdmin

- [ ] **Update profile billing tab**
  - Show only for ContractorAdmin
  - Display organization balance
  - "Purchase" action creates payment for organization

### Files to Modify
```
server/features/payment/              (MODIFY)
server/api/payment/                   (MODIFY)
pages/profile/index.vue               (MODIFY - conditional billing tab)
```

---

## 2.4 Clean Up Unused Code

### Identify and Remove
- [ ] **Check if fileprocessing worker is used**
  ```bash
  grep -r "fileprocessing\|file-processing" server/ --include="*.js"
  ```
  - If not used: Delete `workers/fileprocessing/` directory

- [ ] **Check if cassette-processing worker is used**
  ```bash
  grep -r "cassette-processing" server/ --include="*.js"
  ```
  - If not used: Delete `workers/cassette-processing/` directory

- [ ] **Review GridFS buckets in `server/db/mongo.js`**
  - Keep: `cassettes`, `artifacts`, `avatars`
  - Remove if unused: `userDxf`, `userDxfFilesSvg`, `nestSvg`
  - Consolidate if possible

- [ ] **Remove old user utils**
  - Delete `server/utils/user.js` (old OAuth user creation)
  - Keep only session functions in `server/utils/auth.js`

### Files to Delete (if confirmed unused)
```
workers/fileprocessing/               (DELETE if unused)
workers/cassette-processing/          (DELETE if unused)
server/utils/user.js                  (DELETE - replaced by users service)
```

---

## 2.5 Update Documentation

- [ ] **Update root NEOLIT.md**
  - Reflect new auth system
  - Update data model section
  - Update containers list

- [ ] **Update server/features/NEOLIT.md**
  - Add users, organizations modules
  - Update batches → queues

- [ ] **Create NEOLIT.md for all new features**
  - `server/features/users/NEOLIT.md`
  - `server/features/organizations/NEOLIT.md`
  - `server/features/queues/NEOLIT.md` (update from batches)

- [ ] **Update README.md**
  - New auth flow
  - New user types
  - Seeding instructions

---

# Phase 3: Material Accounting System

**Goal:** Implement Warehouses, Catalogs, Requisitions, Material Batches (deliveries), Sheets, and Remnants.

---

## 3.1 Create Warehouses Feature

### Database Schema
```javascript
// Collection: warehouses
{
  _id: ObjectId,
  name: String,                    // "Main Warehouse", "Factory Floor"
  slug: String,                    // unique within organization
  organizationId: ObjectId,        // Owner organization
  
  location: {
    address: String,
    city: String,
    country: String,
    contactPerson: String,
    phone: String
  },
  
  inventorySummary: {              // Cached counts (updated on batch/sheet events)
    totalBatches: Number,          // Material batches in stock
    totalSheets: Number,           // Individual sheets tracked
    totalRemnants: Number          // Remnant pieces
  },
  
  isActive: Boolean,
  isDefault: Boolean,              // Each org has one default warehouse
  createdAt: Date,
  updatedAt: Date,
  createdBy: String                // userId
}
```

### Implementation
- [ ] **Create feature structure**
  ```bash
  mkdir -p server/features/warehouses
  cp -r server/features/_template/* server/features/warehouses/
  ```

- [ ] **Implement repository** (`server/features/warehouses/repository.js`)
  - `create(data)`
  - `findById(id)`
  - `findByOrganization(orgId, filter)`
  - `updateById(id, updates)`
  - `updateInventorySummary(id, summary)` - Update cached counts
  - `deleteById(id)` - Soft delete (set isActive: false)

- [ ] **Implement service** (`server/features/warehouses/service.js`)
  - `create(orgId, data, userId)` - Validate, auto-generate slug
  - `list(orgId, filter)` - List warehouses for organization
  - `getById(id, userId)` - Check permission
  - `update(id, updates, userId)` - Ownership check
  - `delete(id, userId)` - Check no active inventory
  - `ensureDefaultWarehouse(orgId)` - Create default if none exists

- [ ] **Add to indexes**
  ```javascript
  warehouses: [
    { keys: { organizationId: 1, slug: 1 }, options: { unique: true, name: 'org_slug_unique' } },
    { keys: { organizationId: 1, isDefault: 1 }, options: { name: 'org_default_idx' } },
    { keys: { isActive: 1 }, options: { name: 'isActive_idx' } }
  ]
  ```

### API Endpoints
- [ ] `POST /api/warehouses` - Create warehouse
- [ ] `GET /api/warehouses` - List (filtered by org)
- [ ] `GET /api/warehouses/:id` - Get details
- [ ] `PATCH /api/warehouses/:id` - Update
- [ ] `DELETE /api/warehouses/:id` - Delete

### UI Components
- [ ] **Create warehouse management page** (`pages/admin/warehouses.vue`)
  - DataTable with warehouses
  - Create/Edit dialog
  - View inventory summary
  - Set as default action

- [ ] **Create warehouse form component** (`components/WarehouseForm.vue`)
  - Name, Location fields
  - Default warehouse checkbox
  - Save/Cancel

### Files to Create
```
server/features/warehouses/
  ├── repository.js
  ├── service.js
  ├── index.js
  └── NEOLIT.md

server/api/warehouses/
  ├── index.get.js
  ├── index.post.js
  ├── [id].get.js
  ├── [id].patch.js
  └── [id].delete.js

pages/admin/
  └── warehouses.vue

components/
  └── WarehouseForm.vue
```

---

## 3.2 Create Catalogs Feature

### Database Schema
```javascript
// Collection: catalogs
{
  _id: ObjectId,
  name: String,                    // "2024 ACP Catalog"
  slug: String,                    // unique within manufacturer
  manufacturerId: ObjectId,        // Organization (type: Manufacturer)
  
  description: String,
  isActive: Boolean,               // Can be disabled
  
  sheetTypes: [{
    _id: ObjectId,                 // Unique ID for this sheet type
    code: String,                  // "ACP-3MM-WHITE"
    material: String,              // "Aluminium Composite"
    color: String,                 // "White"
    thickness: Number,             // 3 (mm)
    foilThickness: Number,         // 0.3 (mm) - for composite
    availableSizes: [{             // Available sizes
      width: Number,               // 1220 (mm)
      height: Number,              // 2440 (mm)
      pricePerSqm: Number          // Price per square meter
    }],
    leadTimeDays: Number,          // Typical lead time
    minOrderQuantity: Number,      // Minimum sheets per order
    notes: String
  }],
  
  metadata: {
    version: Number,
    lastUpdated: Date,
    updatedBy: String              // userId
  },
  
  createdAt: Date,
  createdBy: String
}
```

### Implementation
- [ ] **Create feature structure**
  ```bash
  mkdir -p server/features/catalogs
  cp -r server/features/_template/* server/features/catalogs/
  ```

- [ ] **Implement repository** (`server/features/catalogs/repository.js`)
  - `create(data)`
  - `findById(id)`
  - `findByManufacturer(mfgId, filter)`
  - `findActiveByManufacturer(mfgId)` - Only active catalogs
  - `updateById(id, updates)`
  - `addSheetType(catalogId, sheetType)`
  - `updateSheetType(catalogId, sheetTypeId, updates)`
  - `removeSheetType(catalogId, sheetTypeId)`
  - `deleteById(id)`

- [ ] **Implement service** (`server/features/catalogs/service.js`)
  - `create(mfgId, data, userId)` - Only ManufacturerAdmin
  - `list(filter)` - Contractors see all active catalogs
  - `listByManufacturer(mfgId)` - Manufacturer sees own catalogs
  - `getById(id, userId)` - Permission check
  - `update(id, updates, userId)` - Owner only
  - `manageSheetTypes(catalogId, operations, userId)` - CRUD for sheet types
  - `deactivate(id, userId)` - Soft delete

- [ ] **Add to indexes**
  ```javascript
  catalogs: [
    { keys: { manufacturerId: 1, slug: 1 }, options: { unique: true, name: 'mfg_slug_unique' } },
    { keys: { isActive: 1 }, options: { name: 'isActive_idx' } },
    { keys: { 'sheetTypes._id': 1 }, options: { name: 'sheetTypes_id_idx' } }
  ]
  ```

### API Endpoints
- [ ] `POST /api/catalogs` - Create catalog (ManufacturerAdmin only)
- [ ] `GET /api/catalogs` - List catalogs (filtered by permissions)
- [ ] `GET /api/catalogs/:id` - Get details
- [ ] `PATCH /api/catalogs/:id` - Update
- [ ] `DELETE /api/catalogs/:id` - Delete
- [ ] `POST /api/catalogs/:id/sheet-types` - Add sheet type
- [ ] `PATCH /api/catalogs/:id/sheet-types/:typeId` - Update sheet type
- [ ] `DELETE /api/catalogs/:id/sheet-types/:typeId` - Remove sheet type

### UI Components
- [ ] **Create catalogs management page** (`pages/manufacturer/catalogs.vue`)
  - DataTable with catalogs
  - Create/Edit catalog dialog
  - Manage sheet types (nested DataTable or dedicated page)

- [ ] **Create catalog form component** (`components/CatalogForm.vue`)
  - Name, Description, Active status
  - Sheet types manager (CRUD operations)

- [ ] **Create sheet type editor** (`components/SheetTypeEditor.vue`)
  - Material, Color, Thickness inputs
  - Available sizes (width x height + price)
  - Lead time, min order qty

- [ ] **Catalog browser for contractors** (`pages/contractor/catalogs.vue`)
  - View all active catalogs
  - Filter by manufacturer, material, color
  - "Request Quote" / "Add to Requisition" actions

### Files to Create
```
server/features/catalogs/
  ├── repository.js
  ├── service.js
  ├── index.js
  └── NEOLIT.md

server/api/catalogs/
  ├── index.get.js
  ├── index.post.js
  ├── [id].get.js
  ├── [id].patch.js
  ├── [id].delete.js
  ├── [id]/sheet-types/
  │   ├── index.post.js
  │   └── [typeId].patch.js
  │   └── [typeId].delete.js

pages/manufacturer/
  └── catalogs.vue

pages/contractor/
  └── catalogs.vue

components/
  ├── CatalogForm.vue
  └── SheetTypeEditor.vue
```

---

## 3.3 Create Requisitions Feature

### Database Schema
```javascript
// Collection: requisitions
{
  _id: ObjectId,
  requisitionNumber: String,       // "REQ-2024-001" (auto-generated)
  
  contractorId: ObjectId,          // Requesting organization
  manufacturerId: ObjectId,        // Fulfilling organization
  
  projectId: ObjectId,             // Optional: Link to project
  queueId: ObjectId,               // Optional: Link to queue that triggered this
  
  items: [{
    catalogId: ObjectId,           // Source catalog
    sheetTypeId: ObjectId,         // Specific sheet type
    sizeIndex: Number,             // Index in sheetType.availableSizes array
    quantity: Number,              // Number of sheets requested
    
    // Snapshot of sheet type data (for historical reference)
    snapshot: {
      material: String,
      color: String,
      thickness: Number,
      width: Number,
      height: Number,
      pricePerSqm: Number,
      totalPrice: Number           // Calculated at creation
    }
  }],
  
  totalAmount: Number,             // Sum of all item prices
  
  status: String,                  // "draft" | "sent" | "approved" | "fulfilled" | "canceled"
  statusHistory: [{
    status: String,
    timestamp: Date,
    userId: String,
    note: String
  }],
  
  linkedBatchIds: [ObjectId],      // Material batches that fulfilled this requisition
  
  notes: String,
  internalNotes: String,           // Visible to manufacturer only
  
  createdAt: Date,
  createdBy: String,               // userId
  updatedAt: Date
}
```

### Implementation
- [ ] **Create feature structure**
  ```bash
  mkdir -p server/features/requisitions
  cp -r server/features/_template/* server/features/requisitions/
  ```

- [ ] **Implement repository** (`server/features/requisitions/repository.js`)
  - `create(data)`
  - `findById(id)`
  - `findByContractor(contractorId, filter)`
  - `findByManufacturer(mfgId, filter)`
  - `updateById(id, updates)`
  - `updateStatus(id, status, userId, note)`
  - `linkBatch(requisitionId, batchId)` - Add to linkedBatchIds
  - `deleteById(id)`

- [ ] **Implement service** (`server/features/requisitions/service.js`)
  - `create(contractorId, items, userId)` - Create draft, calculate prices
  - `list(orgId, role, filter)` - Filter by contractor or manufacturer
  - `getById(id, userId)` - Permission check
  - `updateDraft(id, updates, userId)` - Only draft can be edited
  - `send(id, userId)` - Change status to "sent"
  - `approve(id, userId)` - Manufacturer approves (status: "approved")
  - `fulfill(id, batchIds, userId)` - Link batches, set "fulfilled"
  - `cancel(id, userId, reason)` - Cancel requisition
  - `generateRequisitionNumber()` - Auto-increment

- [ ] **Add to indexes**
  ```javascript
  requisitions: [
    { keys: { requisitionNumber: 1 }, options: { unique: true, name: 'reqNumber_unique' } },
    { keys: { contractorId: 1, status: 1 }, options: { name: 'contractor_status_idx' } },
    { keys: { manufacturerId: 1, status: 1 }, options: { name: 'mfg_status_idx' } },
    { keys: { projectId: 1 }, options: { name: 'projectId_idx' } },
    { keys: { createdAt: -1 }, options: { name: 'createdAt_idx' } }
  ]
  ```

### API Endpoints
- [ ] `POST /api/requisitions` - Create requisition (Contractor)
- [ ] `GET /api/requisitions` - List (filtered by org and role)
- [ ] `GET /api/requisitions/:id` - Get details
- [ ] `PATCH /api/requisitions/:id` - Update draft
- [ ] `POST /api/requisitions/:id/send` - Send to manufacturer
- [ ] `POST /api/requisitions/:id/approve` - Manufacturer approves
- [ ] `POST /api/requisitions/:id/fulfill` - Link batches and mark fulfilled
- [ ] `POST /api/requisitions/:id/cancel` - Cancel
- [ ] `DELETE /api/requisitions/:id` - Delete draft only

### UI Components
- [ ] **Create requisitions page for contractors** (`pages/contractor/requisitions.vue`)
  - DataTable with requisitions
  - Filter by status, manufacturer, date
  - Create requisition dialog
  - View/Edit draft
  - Send action

- [ ] **Create requisitions page for manufacturers** (`pages/manufacturer/requisitions.vue`)
  - DataTable with incoming requisitions
  - Filter by status, contractor, date
  - Approve/Reject actions
  - Fulfill requisition (link to batch creation)

- [ ] **Create requisition form component** (`components/RequisitionForm.vue`)
  - Select manufacturer
  - Add items from catalogs (catalog → sheet type → size → quantity)
  - Items table with remove action
  - Total price calculation
  - Notes field

- [ ] **Create requisition details component** (`components/RequisitionDetails.vue`)
  - Display requisition info
  - Items table with snapshot data
  - Status history timeline
  - Actions based on status and role

### Integration with Queues
- [ ] **Add "Create Requisition from Queue" action**
  - In queue editor, analyze missing sheets
  - Button: "Request Sheets from Manufacturer"
  - Pre-fill requisition with needed sheets
  - Link requisition to queue

### Files to Create
```
server/features/requisitions/
  ├── repository.js
  ├── service.js
  ├── index.js
  └── NEOLIT.md

server/api/requisitions/
  ├── index.get.js
  ├── index.post.js
  ├── [id].get.js
  ├── [id].patch.js
  ├── [id].delete.js
  ├── [id]/send.post.js
  ├── [id]/approve.post.js
  ├── [id]/fulfill.post.js
  └── [id]/cancel.post.js

pages/contractor/
  └── requisitions.vue

pages/manufacturer/
  └── requisitions.vue

components/
  ├── RequisitionForm.vue
  └── RequisitionDetails.vue
```

---

## 3.4 Create Material Batches Feature (Deliveries)

### Database Schema
```javascript
// Collection: material_batches
{
  _id: ObjectId,
  batchNumber: String,             // "BATCH-2024-001" (auto-generated)
  receiptId: String,               // Manual reference (invoice, delivery note)
  
  supplierId: ObjectId,            // Manufacturer organization
  beneficiaryId: ObjectId,         // Receiving organization (Contractor)
  warehouseId: ObjectId,           // Destination warehouse
  
  requisitionId: ObjectId,         // Optional: Source requisition
  
  piles: [{
    _id: ObjectId,                 // Unique pile ID
    manufacturerPartyId: String,   // Manufacturer's batch/lot number (for tracking)
    
    totalCount: Number,            // Total sheets in pile
    remainingCount: Number,        // Sheets not yet used (decremented when sheets created)
    
    sheetCharacteristics: {
      material: String,
      color: String,
      thickness: Number,
      foilThickness: Number,       // For composite
      width: Number,
      height: Number
    },
    
    pricePerSqm: Number,
    totalPrice: Number,
    
    notes: String
  }],
  
  status: String,                  // "requested" | "assembled" | "sent" | "arrived" | "in_stock" | "partially_used" | "used_up"
  statusHistory: [{
    status: String,
    timestamp: Date,
    userId: String,
    note: String
  }],
  
  transportInfo: {
    carrier: String,
    trackingNumber: String,
    estimatedDelivery: Date,
    actualDelivery: Date
  },
  
  createdAt: Date,
  createdBy: String,
  updatedAt: Date
}
```

### Implementation
- [ ] **Create feature structure**
  ```bash
  mkdir -p server/features/material-batches
  cp -r server/features/_template/* server/features/material-batches/
  ```

- [ ] **Implement repository** (`server/features/material-batches/repository.js`)
  - `create(data)`
  - `findById(id)`
  - `findByBeneficiary(orgId, filter)`
  - `findBySupplier(orgId, filter)`
  - `findByWarehouse(warehouseId, filter)`
  - `updateById(id, updates)`
  - `updateStatus(id, status, userId, note)`
  - `decrementPile(batchId, pileId, count)` - Decrease remainingCount
  - `getPileById(batchId, pileId)` - Get specific pile
  - `deleteById(id)`

- [ ] **Implement service** (`server/features/material-batches/service.js`)
  - `create(supplierId, beneficiaryId, warehouseId, piles, userId)` - Create batch
  - `createFromRequisition(requisitionId, userId)` - Manufacturer creates batch to fulfill requisition
  - `list(orgId, role, filter)` - Filter by supplier or beneficiary
  - `getById(id, userId)` - Permission check
  - `update(id, updates, userId)` - Owner only, limited fields
  - `updateStatus(id, newStatus, userId, note)` - Status transitions
  - `recordArrival(id, userId, note)` - Set status to "arrived"
  - `moveToStock(id, userId)` - Set status to "in_stock"
  - `allocateSheets(batchId, pileId, count)` - Called when queue uses sheets (decrements pile)
  - `checkIfUsedUp(batchId)` - Auto-update status if all piles depleted
  - `generateBatchNumber()` - Auto-increment

- [ ] **Add to indexes**
  ```javascript
  material_batches: [
    { keys: { batchNumber: 1 }, options: { unique: true, name: 'batchNumber_unique' } },
    { keys: { beneficiaryId: 1, status: 1 }, options: { name: 'beneficiary_status_idx' } },
    { keys: { supplierId: 1, status: 1 }, options: { name: 'supplier_status_idx' } },
    { keys: { warehouseId: 1 }, options: { name: 'warehouseId_idx' } },
    { keys: { requisitionId: 1 }, options: { name: 'requisitionId_idx' } },
    { keys: { 'piles._id': 1 }, options: { name: 'piles_id_idx' } }
  ]
  ```

### API Endpoints
- [ ] `POST /api/material-batches` - Create batch (Manufacturer)
- [ ] `GET /api/material-batches` - List (filtered by org and role)
- [ ] `GET /api/material-batches/:id` - Get details
- [ ] `PATCH /api/material-batches/:id` - Update
- [ ] `POST /api/material-batches/:id/status` - Update status
- [ ] `POST /api/material-batches/:id/arrive` - Record arrival
- [ ] `POST /api/material-batches/:id/stock` - Move to stock
- [ ] `DELETE /api/material-batches/:id` - Delete (only draft)

### UI Components
- [ ] **Create batches page for contractors** (`pages/contractor/material-batches.vue`)
  - DataTable with incoming batches
  - Filter by status, supplier, date
  - Actions: View details, Record arrival, Move to stock

- [ ] **Create batches page for manufacturers** (`pages/manufacturer/material-batches.vue`)
  - DataTable with outgoing batches
  - Filter by status, contractor, date
  - Create batch action
  - Update status (assembled → sent)

- [ ] **Create batch form component** (`components/MaterialBatchForm.vue`)
  - Select beneficiary, warehouse
  - Link to requisition (optional)
  - Piles editor (add/remove piles)
  - Pile form: partyId, count, characteristics, price

- [ ] **Create batch details component** (`components/MaterialBatchDetails.vue`)
  - Display batch info
  - Piles table (totalCount, remainingCount, characteristics)
  - Status history timeline
  - Actions based on status and role

### Files to Create
```
server/features/material-batches/
  ├── repository.js
  ├── service.js
  ├── index.js
  └── NEOLIT.md

server/api/material-batches/
  ├── index.get.js
  ├── index.post.js
  ├── [id].get.js
  ├── [id].patch.js
  ├── [id].delete.js
  ├── [id]/status.post.js
  ├── [id]/arrive.post.js
  └── [id]/stock.post.js

pages/contractor/
  └── material-batches.vue

pages/manufacturer/
  └── material-batches.vue

components/
  ├── MaterialBatchForm.vue
  └── MaterialBatchDetails.vue
```

---

## 3.5 Create Sheets Tracking Feature

### Database Schema
```javascript
// Collection: sheets
// NOTE: Sheets are created lazily - only when used from a batch pile
{
  _id: ObjectId,
  sheetNumber: String,             // "SHEET-2024-00001" (global auto-increment)
  
  batchId: ObjectId,               // Source material batch
  pileId: ObjectId,                // Source pile within batch
  warehouseId: ObjectId,           // Current warehouse
  
  characteristics: {               // Copied from pile
    material: String,
    color: String,
    thickness: Number,
    foilThickness: Number,
    width: Number,
    height: Number
  },
  
  status: String,                  // "in_stock" | "in_cutting" | "milled"
  
  history: [{                      // Track all movements and operations
    action: String,                // "created" | "moved" | "cutting_started" | "milled" | "scrapped"
    timestamp: Date,
    userId: String,
    note: String,
    location: String               // Warehouse, machine, etc.
  }],
  
  derivedEntities: {               // After milling
    cassetteInstanceIds: [ObjectId],
    remnantIds: [ObjectId]
  },
  
  qrCode: String,                  // Optional: Physical QR code for tracking
  
  createdAt: Date,
  createdBy: String,
  updatedAt: Date
}
```

### Implementation
- [ ] **Create feature structure**
  ```bash
  mkdir -p server/features/sheets
  cp -r server/features/_template/* server/features/sheets/
  ```

- [ ] **Implement repository** (`server/features/sheets/repository.js`)
  - `create(data)` - Create sheet
  - `createBatch(sheetsData)` - Create multiple sheets at once
  - `findById(id)`
  - `findByBatch(batchId, pileId)`
  - `findByWarehouse(warehouseId, filter)`
  - `findByStatus(warehouseId, status)`
  - `updateById(id, updates)`
  - `updateStatus(id, status, userId, note, location)`
  - `addToHistory(id, historyEntry)`
  - `linkDerivedEntities(id, entityType, entityIds)` - Link cassettes/remnants
  - `deleteById(id)`

- [ ] **Implement service** (`server/features/sheets/service.js`)
  - `allocateFromBatch(batchId, pileId, count, userId)` - Create N sheets from pile
    - Calls `materialBatchesService.allocateSheets()` to decrement pile
    - Creates sheet records with status "in_stock"
    - Adds to history: "created from batch"
  - `list(warehouseId, filter)` - List sheets in warehouse
  - `getById(id, userId)` - Permission check
  - `updateStatus(id, newStatus, userId, note, location)` - Status transitions
  - `startCutting(sheetIds, queueId, userId)` - Batch update to "in_cutting"
  - `finishMilling(sheetId, cassetteIds, remnantIds, userId)` - Mark "milled", link entities
  - `scrap(id, userId, reason)` - Mark as scrapped
  - `generateSheetNumber()` - Global auto-increment
  - `generateQRCode(sheetId)` - Generate QR code string

- [ ] **Add to indexes**
  ```javascript
  sheets: [
    { keys: { sheetNumber: 1 }, options: { unique: true, name: 'sheetNumber_unique' } },
    { keys: { batchId: 1, pileId: 1 }, options: { name: 'batch_pile_idx' } },
    { keys: { warehouseId: 1, status: 1 }, options: { name: 'warehouse_status_idx' } },
    { keys: { qrCode: 1 }, options: { sparse: true, name: 'qrCode_idx' } },
    { keys: { createdAt: -1 }, options: { name: 'createdAt_idx' } }
  ]
  ```

### API Endpoints
- [ ] `POST /api/sheets/allocate` - Allocate sheets from batch pile
- [ ] `GET /api/sheets` - List sheets (filtered by warehouse)
- [ ] `GET /api/sheets/:id` - Get details
- [ ] `PATCH /api/sheets/:id/status` - Update status
- [ ] `POST /api/sheets/start-cutting` - Batch status update (array of sheet IDs)
- [ ] `POST /api/sheets/:id/finish-milling` - Mark milled, link entities
- [ ] `POST /api/sheets/:id/scrap` - Scrap sheet

### UI Components
- [ ] **Create sheets inventory page** (`pages/contractor/sheets.vue`)
  - DataTable with sheets
  - Filter by warehouse, status, material, batch
  - Actions: View history, Change status, Generate QR, Scrap
  - Allocate sheets from batch action

- [ ] **Create sheet details component** (`components/SheetDetails.vue`)
  - Display sheet info (number, characteristics, status)
  - History timeline
  - QR code display/print
  - Derived entities (cassettes, remnants)

- [ ] **Update warehouse details** - Show sheets inventory in warehouse view

### Integration with Queues
- [ ] **Update queue nesting flow**
  - When queue needs sheets, check warehouse inventory
  - Option 1: Use existing sheets (select from inventory)
  - Option 2: Allocate from batch pile (create new sheets)
  - Option 3: Request from manufacturer (create requisition)
  
- [ ] **When marking queue as "cut"**
  - Update sheet status to "in_cutting" → "milled"
  - Create cassette instances and remnants
  - Link to sheets

### Files to Create
```
server/features/sheets/
  ├── repository.js
  ├── service.js
  ├── index.js
  └── NEOLIT.md

server/api/sheets/
  ├── allocate.post.js
  ├── index.get.js
  ├── [id].get.js
  ├── [id]/status.patch.js
  ├── start-cutting.post.js
  ├── [id]/finish-milling.post.js
  └── [id]/scrap.post.js

pages/contractor/
  └── sheets.vue

components/
  └── SheetDetails.vue
```

---

## 3.6 Create Remnants Feature

### Database Schema
```javascript
// Collection: remnants
{
  _id: ObjectId,
  remnantNumber: String,           // "REM-2024-00001" (auto-increment)
  
  sourceSheetId: ObjectId,         // Sheet this came from
  warehouseId: ObjectId,           // Storage location
  
  characteristics: {               // Inherited from sheet
    material: String,
    color: String,
    thickness: Number,
    foilThickness: Number
  },
  
  geometry: {                      // Actual remnant shape
    type: String,                  // "polygon" | "dxf"
    data: String,                  // DXF content or polygon coordinates
    area: Number,                  // Usable area in sqmm
    boundingBox: {
      width: Number,
      height: Number
    }
  },
  
  qrCode: String,                  // Physical tracking
  isReusable: Boolean,             // Flag if worth keeping
  status: String,                  // "in_stock" | "used" | "scrapped"
  
  usedInQueueId: ObjectId,         // If reused in a queue
  
  notes: String,
  
  createdAt: Date,
  createdBy: String,
  updatedAt: Date
}
```

### Implementation
- [ ] **Create feature structure**
  ```bash
  mkdir -p server/features/remnants
  cp -r server/features/_template/* server/features/remnants/
  ```

- [ ] **Implement repository** (`server/features/remnants/repository.js`)
  - `create(data)`
  - `findById(id)`
  - `findByWarehouse(warehouseId, filter)`
  - `findReusable(warehouseId, characteristics)` - Filter by material, size, etc.
  - `updateById(id, updates)`
  - `markUsed(id, queueId)`
  - `markScrapped(id)`
  - `deleteById(id)`

- [ ] **Implement service** (`server/features/remnants/service.js`)
  - `create(sheetId, geometryData, userId)` - Create remnant after milling
  - `list(warehouseId, filter)` - List remnants
  - `getById(id, userId)` - Permission check
  - `searchReusable(warehouseId, minArea, characteristics)` - Find suitable remnants
  - `markAsUsed(id, queueId, userId)` - When used in nesting
  - `scrap(id, userId, reason)` - Discard remnant
  - `generateRemnantNumber()` - Auto-increment
  - `generateQRCode(remnantId)` - QR code string

- [ ] **Add to indexes**
  ```javascript
  remnants: [
    { keys: { remnantNumber: 1 }, options: { unique: true, name: 'remnantNumber_unique' } },
    { keys: { sourceSheetId: 1 }, options: { name: 'sourceSheetId_idx' } },
    { keys: { warehouseId: 1, status: 1 }, options: { name: 'warehouse_status_idx' } },
    { keys: { warehouseId: 1, isReusable: 1 }, options: { name: 'warehouse_reusable_idx' } },
    { keys: { 'characteristics.material': 1, 'geometry.area': 1 }, options: { name: 'material_area_idx' } }
  ]
  ```

### API Endpoints
- [ ] `POST /api/remnants` - Create remnant (internal, called by sheets service)
- [ ] `GET /api/remnants` - List remnants (filtered by warehouse)
- [ ] `GET /api/remnants/:id` - Get details
- [ ] `POST /api/remnants/search` - Search reusable remnants (for nesting)
- [ ] `PATCH /api/remnants/:id/use` - Mark as used
- [ ] `PATCH /api/remnants/:id/scrap` - Scrap remnant

### UI Components
- [ ] **Create remnants page** (`pages/contractor/remnants.vue`)
  - DataTable with remnants
  - Filter by warehouse, material, reusable, status
  - Preview geometry
  - Actions: Mark used, Scrap, Print QR

- [ ] **Create remnant details component** (`components/RemnantDetails.vue`)
  - Display remnant info
  - Geometry preview (SVG or simple dimensions)
  - QR code
  - Source sheet info

- [ ] **Update queue editor** - Option to include remnants in nesting

### Integration with Nesting
- [ ] **Update nesting worker**
  - Accept remnants as input (along with sheets)
  - Treat remnants as sheets with irregular shapes
  - Mark remnants as "used" when included in layout

- [ ] **When marking queue as "cut"**
  - Generate remnant records from layout waste
  - Calculate geometry, area, reusability
  - Store in warehouse

### Files to Create
```
server/features/remnants/
  ├── repository.js
  ├── service.js
  ├── index.js
  └── NEOLIT.md

server/api/remnants/
  ├── index.get.js
  ├── index.post.js
  ├── [id].get.js
  ├── search.post.js
  ├── [id]/use.patch.js
  └── [id]/scrap.patch.js

pages/contractor/
  └── remnants.vue

components/
  └── RemnantDetails.vue
```

---

## 3.7 Update Project Data Structure

### Extended Project Schema
```javascript
// Collection: projects (EXTEND existing)
{
  // ... existing fields ...
  
  customerId: ObjectId,            // Customer organization or user
  contractorId: ObjectId,          // Owner (same as ownerId but explicit)
  collaborators: [{                // Cross-org collaborations
    userId: ObjectId,
    role: String,
    addedAt: Date
  }],
  
  metadata: {
    deadlines: Date,
    address: String,
    description: String
  },
  
  // Material tracking (EXISTING, keep and extend)
  sheets: [{
    materialId: ObjectId,
    size: { width: Number, height: Number },
    quantity: Number,
    addedAt: Date
  }],
  
  cutLogs: [{                      // EXISTING, keep and extend
    queueId: ObjectId,
    queueNumber: Number,
    cutAt: Date,
    cutBy: String,
    artifactIds: [ObjectId],
    sheetsUsed: [{
      sheetId: ObjectId,
      materialId: ObjectId,
      size: Object,
      count: Number
    }],
    areaUtilization: Number,
    wasteArea: Number,
    remnantIds: [ObjectId]
  }]
  
  // ... rest of existing fields ...
}
```

### Implementation
- [ ] **Extend projects service** (`server/features/projects/service.js`)
  - Add collaborators management
  - Link to customer/contractor organizations
  - Update cutLogs structure to include actual sheet IDs and remnants

- [ ] **Update queue service** - When marking as cut, record full details in project.cutLogs

### Files to Modify
```
server/features/projects/service.js (EXTEND)
server/features/queues/service.js  (MODIFY markCut function)
pages/project/[slug]/data.vue      (ALREADY HAS sheets tracking, extend UI)
```

---

# Phase 4: Advanced Features & Polish

**Goal:** Cassette lifecycle tracking, UI polish, dashboards, reports, integrations.

---

## 4.1 Implement Cassette Lifecycle

### Cassette Designs
```javascript
// Collection: cassette_designs
{
  _id: ObjectId,
  designNumber: String,            // "DES-2024-00001"
  
  templateId: ObjectId,            // Cassette template used
  parameters: Object,              // Baked parameter values
  
  geometry: String,                // Generated DXF content
  
  sheetDesignId: ObjectId,         // Optional: Part of multi-cassette sheet
  queueId: ObjectId,               // Queue that created this design
  
  metadata: {
    area: Number,
    dimensions: Object
  },
  
  createdAt: Date,
  createdBy: String
}
```

### Cassette Instances
```javascript
// Collection: cassette_instances
{
  _id: ObjectId,
  instanceNumber: String,          // "INST-2024-00001"
  
  designId: ObjectId,              // Design used
  templateId: ObjectId,            // Original template
  sheetId: ObjectId,               // Sheet it was cut from
  projectId: ObjectId,             // Project it belongs to
  queueId: ObjectId,               // Queue that produced it
  
  status: String,                  // "nested" | "manufactured" | "on_site" | "installed"
  tracking: [{
    status: String,
    timestamp: Date,
    userId: String,
    location: String,
    note: String
  }],
  
  qrCode: String,                  // Physical tracking
  
  createdAt: Date,
  createdBy: String
}
```

### Sheet Designs
```javascript
// Collection: sheet_designs
{
  _id: ObjectId,
  designNumber: String,            // "SD-2024-00001"
  
  queueId: ObjectId,               // Queue this layout belongs to
  geometry: String,                // Full nesting layout DXF
  
  derivedEntities: [{
    type: String,                  // "cassette" | "remnant"
    entityId: ObjectId
  }],
  
  createdAt: Date,
  createdBy: String
}
```

### Implementation
- [ ] **Create cassette-designs feature**
  - Repository, service, API endpoints
  - Create designs during nesting baking phase
  - Link to templates and queues

- [ ] **Create cassette-instances feature**
  - Repository, service, API endpoints
  - Create instances when queue is marked as "cut"
  - Status tracking workflow

- [ ] **Create sheet-designs feature**
  - Repository, service, API endpoints
  - Store nesting layout as sheet design
  - Link to derived cassettes and remnants

- [ ] **Update nesting worker**
  - Generate cassette designs and sheet designs
  - Store as artifacts

- [ ] **Update queue marking flow**
  - Create cassette instances from designs
  - Link to sheets
  - Initialize status as "manufactured"

### UI Components
- [ ] **Cassette instances tracker page** (`pages/contractor/cassette-instances.vue`)
  - DataTable with all cassette instances
  - Filter by project, queue, status
  - Update status action
  - QR code print

- [ ] **Instance details component** (`components/CassetteInstanceDetails.vue`)
  - Display instance info
  - Tracking timeline
  - QR code
  - Link to design, template, sheet, project

### Files to Create
```
server/features/cassette-designs/
server/features/cassette-instances/
server/features/sheet-designs/

pages/contractor/
  └── cassette-instances.vue

components/
  └── CassetteInstanceDetails.vue
```

---

## 4.2 Dynamic Permission-Based Dashboards

### Implementation
- [ ] **Create dashboard page** (`pages/dashboard.vue` or `pages/index.vue`)
  - Dynamic widgets based on user role and permissions
  - SuperAdmin: System stats, org list, recent activity
  - ManufacturerAdmin: Incoming requisitions, batches to send, catalog stats
  - ContractorAdmin: Projects, queues, warehouse inventory, requisitions
  - CustomerAdmin: Projects list, project status
  - IndividualUser: Assigned tasks (based on permissions)

- [ ] **Create dashboard widgets**
  - `components/dashboard/StatsCard.vue` - KPI cards
  - `components/dashboard/RecentActivity.vue` - Activity feed
  - `components/dashboard/QuickActions.vue` - Role-based quick actions
  - `components/dashboard/InventorySummary.vue` - Warehouse overview
  - `components/dashboard/RequisitionsWidget.vue` - Pending requisitions
  - `components/dashboard/ProjectsWidget.vue` - Active projects

### Navigation System
- [ ] **Update layout/nav** - Dynamic menu based on permissions
  ```javascript
  // Example structure
  const navigation = computed(() => {
    const nav = [];
    if (hasPermission('projects', 'read')) {
      nav.push({ label: 'Projects', to: '/projects' });
    }
    if (hasPermission('warehouses', 'read')) {
      nav.push({ label: 'Warehouse', to: '/contractor/warehouse' });
    }
    // ... etc
    return nav;
  });
  ```

### Files to Create/Modify
```
pages/
  └── dashboard.vue (or index.vue)

components/dashboard/
  ├── StatsCard.vue
  ├── RecentActivity.vue
  ├── QuickActions.vue
  ├── InventorySummary.vue
  ├── RequisitionsWidget.vue
  └── ProjectsWidget.vue

layouts/default.vue (MODIFY)
```

---

## 4.3 Reports & Analytics

### Implementation
- [ ] **Create reports page** (`pages/reports/index.vue`)
  - Report templates:
    - Inventory Report (sheets, remnants by warehouse)
    - Material Usage Report (by project, by material)
    - Requisition History Report
    - Cassette Production Report (instances by project)
    - Waste Analysis Report (remnants, utilization rates)

- [ ] **Create report generator service** (`server/features/reports/service.js`)
  - Generate CSV/PDF reports
  - Aggregate data from multiple collections
  - Date range filtering

- [ ] **API endpoints**
  - `GET /api/reports/inventory?warehouseId=...&format=csv`
  - `GET /api/reports/material-usage?projectId=...&format=pdf`
  - `GET /api/reports/requisitions?startDate=...&endDate=...`

### Files to Create
```
server/features/reports/
  ├── service.js
  └── templates/  (PDF templates)

server/api/reports/
  ├── inventory.get.js
  ├── material-usage.get.js
  └── requisitions.get.js

pages/reports/
  └── index.vue
```

---

## 4.4 System Settings & Admin Tools

### Implementation
- [ ] **Create system settings page** (`pages/admin/settings.vue`)
  - Global settings (SuperAdmin only)
  - Organization limits
  - Feature flags
  - Email templates (for notifications)

- [ ] **Create audit log** (`server/features/audit/`)
  - Log all critical actions (create/delete user, change permissions, etc.)
  - Search and filter logs
  - API: `GET /api/audit-logs`

- [ ] **Create notifications system** (`server/features/notifications/`)
  - In-app notifications
  - Email notifications (optional)
  - Notification types: Requisition status change, Batch arrival, etc.

### Files to Create
```
pages/admin/
  ├── settings.vue
  └── audit-logs.vue

server/features/audit/
server/features/notifications/

components/
  └── NotificationsPanel.vue
```

---

## 4.5 Testing & Documentation

### Testing Checklist
- [ ] **Auth flow**
  - Register, login, logout
  - Password reset
  - JWT refresh
  - Permission checks

- [ ] **Organizations & Users**
  - Create organization
  - Create users in organization
  - Assign permissions
  - Deactivate user

- [ ] **Warehouses**
  - Create warehouse
  - View inventory

- [ ] **Catalogs**
  - Manufacturer creates catalog
  - Add sheet types
  - Contractor views catalogs

- [ ] **Requisitions**
  - Contractor creates requisition
  - Send to manufacturer
  - Manufacturer approves
  - Manufacturer fulfills with batch

- [ ] **Material Batches**
  - Create batch
  - Update status (sent → arrived → in stock)
  - Allocate sheets from batch

- [ ] **Sheets & Remnants**
  - Allocate sheets
  - Use in queue
  - Mark as milled
  - Create remnants
  - Reuse remnants

- [ ] **Projects & Queues**
  - Create project
  - Create queue
  - Run nesting
  - Mark as cut
  - Check cutLogs

- [ ] **Cassette Lifecycle**
  - Create cassette instances
  - Track status
  - View history

### Documentation Updates
- [ ] **Update root NEOLIT.md**
  - New architecture overview
  - All entities listed
  - Workflows documented

- [ ] **Create NEOLIT.md for all new features**
  - Every feature directory needs NEOLIT.md

- [ ] **Update README.md**
  - New setup instructions
  - Seeding with new data
  - User types explanation

- [ ] **Create user guides** (optional)
  - `docs/USER_GUIDE_CONTRACTOR.md`
  - `docs/USER_GUIDE_MANUFACTURER.md`
  - `docs/USER_GUIDE_CUSTOMER.md`

---

# Implementation Timeline Estimate

## Phase 1: Auth & Users (3-5 days)
- Day 1: Remove OAuth, create organizations feature
- Day 2-3: Redesign users, implement auth utilities
- Day 4: UI (login, register, user management)
- Day 5: Testing, seeding, fixes

## Phase 2: Core Preservation (2-3 days)
- Day 1: Rename batches → queues, update all references
- Day 2: Integrate auth checks in existing features
- Day 3: Testing, UI updates

## Phase 3: Material Accounting (5-7 days)
- Day 1: Warehouses + UI
- Day 2: Catalogs + UI
- Day 3: Requisitions + UI
- Day 4-5: Material Batches + Sheets + UI
- Day 6: Remnants + UI
- Day 7: Testing, integration

## Phase 4: Advanced Features (3-5 days)
- Day 1-2: Cassette lifecycle
- Day 3: Dashboards + Reports
- Day 4: System settings, audit logs
- Day 5: Testing, documentation, polish

**Total: 13-20 days (2-4 weeks)**

---

# Notes & Recommendations

## Technology Decisions Made
- **Password Hashing:** Argon2id (industry standard, better than bcrypt)
- **Tokens:** JWT for access tokens (15 min expiry) + Refresh tokens (7 days)
- **State Management:** Keep Pinia (works well, no need to change)
- **API:** REST (familiar, sufficient for this scale)
- **DB:** MongoDB (keep native driver, no ORM needed)

## Architecture Principles
- **Service-Repository Pattern:** Maintained throughout
- **Permission-Based Access:** Every API checks permissions
- **Organization Isolation:** Data filtered by organizationId
- **Lazy Loading:** Sheets created only when needed (not on batch arrival)
- **Audit Trail:** statusHistory arrays track all state changes
- **Idempotency:** Auto-generated numbers with unique indexes

## Deployment Considerations
- [ ] **Environment Variables**
  - JWT_SECRET (new)
  - JWT_REFRESH_SECRET (new)
  - Remove OAuth client IDs/secrets

- [ ] **Database Migrations**
  - Script to rename collections
  - Script to create indexes
  - Seeding script for initial data

- [ ] **Docker Updates**
  - Update Dockerfile if adding new dependencies (argon2, jsonwebtoken)
  - No changes to docker-compose needed

## Future Enhancements (Out of Scope)
- Email verification on registration
- 2FA for admin roles
- Real-time notifications (WebSockets)
- Advanced search (Elasticsearch)
- BIM integration for cassette instances
- 1C accounting system integration
- Mobile app (QR scanning)

---

# Getting Started for Implementing Agents

## Priority Order for Tasks
1. Phase 1.1: Remove OAuth (easy, foundational)
2. Phase 1.2: Organizations feature (foundational)
3. Phase 1.3: Users redesign (core auth)
4. Phase 1.4: Auth middleware (enables everything else)
5. Phase 1.5: Auth UI (manual testing needs this)
6. Phase 1.6: Seeding & testing
7. Phase 2.1: Rename batches → queues
8. Phase 2.2: Auth integration
9. (Continue with Phase 3 tasks in order)

## How to Take a Task
1. Read the task section fully
2. Check "Files to Create/Modify" list
3. Follow database schema exactly
4. Use existing patterns (Service-Repository)
5. Add permission checks in all services
6. Create NEOLIT.md for new features
7. Test manually before moving to next task

## Testing Strategy
- After each major task, run manual tests
- Use Postman/curl for API testing
- Seed test data with scripts
- Check UI in browser
- Don't move to next task if current one is broken

---

**End of System Rework Plan**
