# Cutkit System Rework - Implementation Plan

**Version:** 2.1 (Scalable Architecture)  
**Target:** One-day completion by 2-3 agents working in parallel  
**Date:** 2026-01-19

---

## Scalability Improvements

This plan includes architectural decisions for production scale:

1. **Sessions in separate collection** - User documents don't bloat with session history. TTL index auto-deletes expired sessions.

2. **JWT contains only userId** - Permissions fetched fresh on each request. Changes take effect immediately without re-login.

3. **Transactions for critical operations** - Material allocation (decrement pile + create sheets) uses MongoDB transactions to prevent race conditions.

4. **Organization filtering helpers** - Centralized `getOrgFilter()` and `checkEntityAccess()` instead of manual checks everywhere.

5. **Permission-based authorization** - Consistent `hasPermission()` checks instead of mixing role checks. Easier to extend.

---

## What This Plan Covers

Transform Cutkit from single-user OAuth app into multi-tenant B2B manufacturing system:
- Password authentication with role-based permissions
- Organizations (Manufacturer, Contractor, Customer, Service Provider)
- Material supply chain (Catalogs → Requisitions → Material Batches → Sheets → Cassettes)
- Complete material accounting and waste tracking

**Key Constraint:** Don't break existing functionality (Projects, Queues/Nesting, Cassettes, Artifacts work after auth migration)

---

## Prerequisites

Read these first:
- `BIGREWORK.md` - Original specification
- `AGENTS.md` - Documentation workflow (mandatory for NEOLIT.md updates)

Install dependencies:
```bash
npm install argon2 jsonwebtoken
```

---

## Parallel Execution Strategy

### Agent 1: Auth Foundation (6-8 hours)
- Task 1.1: Remove OAuth
- Task 1.2: Organizations system
- Task 1.3: Users & auth
- **Blocks:** Agent 2

### Agent 2: Core Migration (3-4 hours, starts after Agent 1 completes)
- Task 2.1: Rename batches → queues
- Task 2.2: Integrate auth with existing features
- **Depends on:** Agent 1 complete

### Agent 3: Material Tracking (8-10 hours, parallel with Agent 1)
- Task 3.1: Warehouses
- Task 3.2: Catalogs & Requisitions
- Task 3.3: Material Batches & Sheets
- **Independent:** Can work parallel to Agent 1

### Optional Agent 4: UI & Polish (4-6 hours, after Agent 2)
- Task 4.1: Auth UI
- Task 4.2: Material tracking UI
- Task 4.3: Dashboards

---

# TASK 1.1: Remove OAuth (Agent 1, 1 hour)

## Objective
Delete Google/GitHub OAuth completely. Users will use email/password going forward.

## Steps

### 1. Delete OAuth Endpoints
```bash
rm -rf server/api/auth/github
rm -rf server/api/auth/google
```

### 2. Delete OAuth Pages
```bash
rm -rf pages/auth/github
rm -rf pages/auth/google
```

### 3. Update Profile Page
File: `pages/profile/index.vue`
- Remove OAuth badge/section (around line 33: "Logged in with OAuth")
- Keep billing tab (will be updated in Task 2.2)

### 4. Remove OAuth Config
File: `.env` or runtime config
- Remove `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
- Remove `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

### 5. Clean Utils
File: `server/utils/user.js`
- Delete entire file (OAuth user creation logic)

## Verification
- No files reference "github" or "google" in auth context
- App builds without errors
- Profile page loads

## Commit
```bash
git add -A
git commit -m "feat: remove OAuth authentication system"
```

---

# TASK 1.2: Create Organizations System (Agent 1, 2-3 hours)

## Objective
Multi-tenant organizations with type-specific settings.

## Data Model

### Collection: `organizations`
```javascript
{
  _id: ObjectId,
  name: String,              // "Acme Manufacturing"
  type: String,              // "Manufacturer" | "Contractor" | "Customer" | "ServiceProvider"
  
  // Contact
  email: String,
  phone: String,
  address: String,
  
  // Type-specific settings
  settings: {
    // For type: "Contractor"
    contractor: {
      canCut: Boolean,       // Default: true
      canInstall: Boolean,   // Default: false
      balance: Number        // Credits for nesting, default: 0
    },
    // For type: "Manufacturer"
    manufacturer: {
      // Reserved for future use
    },
    // For type: "Customer"
    customer: {
      // Reserved for future use
    }
  },
  
  createdAt: Date,
  createdBy: String          // userId
}
```

**Indexes:**
```javascript
{ type: 1 }
{ createdAt: -1 }
```

## Implementation

### 1. Create Feature Structure
```bash
mkdir -p server/features/organizations
```

### 2. Create Repository
File: `server/features/organizations/repository.js`
```javascript
import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';

const COLLECTION = 'organizations';

export async function create(data) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).insertOne({
    ...data,
    createdAt: new Date()
  });
  return await findById(result.insertedId);
}

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
}

export async function find(filter = {}, options = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION)
    .find(filter)
    .sort(options.sort || { createdAt: -1 })
    .limit(options.limit || 100)
    .toArray();
}

export async function updateById(id, updates) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...updates, updatedAt: new Date() } }
  );
  return result.modifiedCount > 0;
}

export async function deleteById(id) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}
```

### 3. Create Service
File: `server/features/organizations/service.js`
```javascript
import * as repository from './repository.js';
import { createError } from 'h3';
import { hasPermission } from '~/server/utils/auth-helpers';
import { getOrgFilter, checkEntityAccess } from '~/server/utils/permissions';

export async function create(data, user) {
  // Check permission
  if (!hasPermission(user, 'organizations', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Validate type
  const validTypes = ['Manufacturer', 'Contractor', 'Customer', 'ServiceProvider'];
  if (!validTypes.includes(data.type)) {
    throw createError({ statusCode: 400, message: 'Invalid organization type' });
  }
  
  // Initialize settings based on type
  const settings = {};
  if (data.type === 'Contractor') {
    settings.contractor = {
      canCut: data.canCut ?? true,
      canInstall: data.canInstall ?? false,
      balance: 0
    };
  }
  
  return await repository.create({
    name: data.name,
    type: data.type,
    email: data.email,
    phone: data.phone,
    address: data.address,
    settings,
    createdBy: user.userId
  });
}

export async function list(user, filter = {}) {
  // Apply organization filter
  const orgFilter = getOrgFilter(user);
  const finalFilter = { ...filter, ...orgFilter };
  
  return await repository.find(finalFilter);
}

export async function getById(id, user) {
  const org = await repository.findById(id);
  if (!org) {
    throw createError({ statusCode: 404, message: 'Organization not found' });
  }
  
  // Check access
  if (!checkEntityAccess(user, org, org._id)) {
    throw createError({ statusCode: 403, message: 'Cannot view other organizations' });
  }
  
  return org;
}

export async function update(id, updates, user) {
  const org = await repository.findById(id);
  if (!org) {
    throw createError({ statusCode: 404, message: 'Organization not found' });
  }
  
  // Check access
  if (!checkEntityAccess(user, org, org._id)) {
    throw createError({ statusCode: 403, message: 'Cannot update other organizations' });
  }
  
  // Check permission level
  if (!hasPermission(user, 'organizations', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  // Don't allow type change
  delete updates.type;
  
  const success = await repository.updateById(id, updates);
  if (!success) {
    throw createError({ statusCode: 500, message: 'Update failed' });
  }
  
  return await repository.findById(id);
}

export async function remove(id, user) {
  if (!hasPermission(user, 'organizations', 'admin')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  const success = await repository.deleteById(id);
  if (!success) {
    throw createError({ statusCode: 404, message: 'Organization not found' });
  }
  
  return { success: true };
}
```

### 4. Create API Endpoints
File: `server/api/organizations/index.post.js`
```javascript
import { defineEventHandler, readBody } from 'h3';
import * as organizationsService from '~/server/features/organizations/service';
import { requireAuth } from '~/server/utils/permissions';

export default defineEventHandler(async (event) => {
  const user = requireAuth(event);
  const body = await readBody(event);
  return await organizationsService.create(body, user);
});
```

File: `server/api/organizations/index.get.js`
```javascript
import { defineEventHandler, getQuery } from 'h3';
import * as organizationsService from '~/server/features/organizations/service';
import { requireAuth } from '~/server/utils/permissions';

export default defineEventHandler(async (event) => {
  const user = requireAuth(event);
  const query = getQuery(event);
  return await organizationsService.list(user, query);
});
```

File: `server/api/organizations/[id].get.js`
```javascript
import { defineEventHandler } from 'h3';
import * as organizationsService from '~/server/features/organizations/service';
import { requireAuth } from '~/server/utils/permissions';

export default defineEventHandler(async (event) => {
  const user = requireAuth(event);
  const id = event.context.params.id;
  return await organizationsService.getById(id, user);
});
```

File: `server/api/organizations/[id].patch.js`
```javascript
import { defineEventHandler, readBody } from 'h3';
import * as organizationsService from '~/server/features/organizations/service';
import { requireAuth } from '~/server/utils/permissions';

export default defineEventHandler(async (event) => {
  const user = requireAuth(event);
  const id = event.context.params.id;
  const body = await readBody(event);
  return await organizationsService.update(id, body, user);
});
```

File: `server/api/organizations/[id].delete.js`
```javascript
import { defineEventHandler } from 'h3';
import * as organizationsService from '~/server/features/organizations/service';
import { requireAuth } from '~/server/utils/permissions';

export default defineEventHandler(async (event) => {
  const user = requireAuth(event);
  const id = event.context.params.id;
  return await organizationsService.remove(id, user);
});
```

### 5. Add Indexes
File: `server/db/indexes.js`

Add to INDEXES object:
```javascript
organizations: [
  { keys: { type: 1 }, options: { name: 'type_idx' } },
  { keys: { createdAt: -1 }, options: { name: 'createdAt_idx' } }
],

users: [
  { keys: { email: 1 }, options: { unique: true, name: 'email_unique' } },
  { keys: { organizationId: 1 }, options: { name: 'organizationId_idx' } }
],

sessions: [
  { keys: { sessionId: 1 }, options: { unique: true, name: 'sessionId_unique' } },
  { keys: { userId: 1 }, options: { name: 'userId_idx' } },
  { keys: { expiresAt: 1 }, options: { expireAfterSeconds: 0, name: 'expiresAt_ttl' } } // TTL index for auto-cleanup
]
```

### 6. Create NEOLIT.md
File: `server/features/organizations/NEOLIT.md`
```markdown
# COMPONENT: Organizations

Multi-tenant organization management with type-specific settings.

## Core Files
- `repository.js`: Database operations on `organizations` collection
- `service.js`: Business logic, type validation, permissions
- API endpoints in `server/api/organizations/`

## Data Structure
Collection: `organizations`

Key fields:
- `type`: "Manufacturer" | "Contractor" | "Customer" | "ServiceProvider"
- `settings`: Type-specific object (contractor.canCut, contractor.balance, etc.)

## Access Control
- SuperAdmin: Full CRUD on all organizations
- Org Admins: Read/Update own organization only
- Individual Users: No direct access

## Related Components
- [users](../users/NEOLIT.md) - Users belong to organizations
```

## Verification
- Can create organization via API
- Settings object populated correctly based on type
- SuperAdmin can CRUD any org
- Non-SuperAdmin can only view own org

## Commit
```bash
git add server/features/organizations server/api/organizations server/db/indexes.js
git commit -m "feat: add organizations system with type-specific settings"
git add server/features/organizations/NEOLIT.md
git commit -m "neo: document organizations feature"
```

---

# TASK 1.3: Users & Authentication (Agent 1, 3-4 hours)

## Objective
Password-based auth with JWT, role-based permissions, session management.

## Data Model

### Collection: `users`
```javascript
{
  _id: ObjectId,
  email: String,             // unique
  passwordHash: String,      // Argon2id
  name: String,
  
  organizationId: ObjectId,
  role: String,              // "SuperAdmin" | "ManufacturerAdmin" | "ContractorAdmin" | "CustomerAdmin" | "IndividualUser"
  
  // Simple per-entity permission level
  permissions: {
    projects: String,        // "none" | "read" | "write" | "admin"
    queues: String,
    cassettes: String,
    warehouses: String,
    catalogs: String,
    requisitions: String,
    materials: String,
    users: String,
    organizations: String
  },
  
  // Optional: Restrict IndividualUser to specific IDs
  restrictedTo: {
    projectIds: [ObjectId],
    warehouseIds: [ObjectId]
  },
  
  isActive: Boolean,
  lastLoginAt: Date,
  createdAt: Date
}
```

**Indexes:**
```javascript
{ email: 1 } unique
{ organizationId: 1 }
```

### Collection: `sessions` (SEPARATE for scalability)
```javascript
{
  _id: ObjectId,
  sessionId: String,         // unique, 64-char random
  userId: ObjectId,
  
  expiresAt: Date,
  createdAt: Date
}
```

**Indexes:**
```javascript
{ sessionId: 1 } unique
{ userId: 1 }
{ expiresAt: 1 } TTL (auto-delete expired)
```

## Permission Templates

Default permissions by role:

**SuperAdmin:**
```javascript
{
  projects: "admin", queues: "admin", cassettes: "admin",
  warehouses: "admin", catalogs: "admin", requisitions: "admin",
  materials: "admin", users: "admin", organizations: "admin"
}
```

**ManufacturerAdmin:**
```javascript
{
  projects: "none", queues: "none", cassettes: "none",
  warehouses: "admin", catalogs: "admin", requisitions: "admin",
  materials: "read", users: "admin", organizations: "write"
}
// filtered by organizationId in queries
```

**ContractorAdmin:**
```javascript
{
  projects: "admin", queues: "admin", cassettes: "admin",
  warehouses: "admin", catalogs: "read", requisitions: "admin",
  materials: "read", users: "admin", organizations: "write"
}
```

**CustomerAdmin:**
```javascript
{
  projects: "admin", queues: "read", cassettes: "read",
  warehouses: "none", catalogs: "none", requisitions: "read",
  materials: "read", users: "admin", organizations: "write"
}
```

**IndividualUser:**
```javascript
{
  projects: "none", queues: "none", cassettes: "none",
  warehouses: "none", catalogs: "none", requisitions: "none",
  materials: "none", users: "none", organizations: "none"
}
// Customized by admin, uses restrictedTo for granular access
```

## Implementation

### 1. Create Auth Utilities
File: `server/utils/auth-helpers.js`
```javascript
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { createError } from 'h3';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRY = '15m';

// Password hashing
export async function hashPassword(password) {
  return await argon2.hash(password);
}

export async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

// JWT tokens (NO permissions - fetch fresh on each request)
export function generateAccessToken(userId) {
  return jwt.sign(
    { userId: userId.toString() },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    throw createError({ statusCode: 401, message: 'Invalid token' });
  }
}

// Permission checks
export function hasPermission(user, entity, requiredLevel) {
  const userLevel = user.permissions?.[entity] || 'none';
  
  const levels = ['none', 'read', 'write', 'admin'];
  const userLevelIndex = levels.indexOf(userLevel);
  const requiredLevelIndex = levels.indexOf(requiredLevel);
  
  return userLevelIndex >= requiredLevelIndex;
}

export function canAccessEntity(user, entityType, entityId) {
  // If no restrictions, can access all in org
  if (!user.restrictedTo) return true;
  
  const restrictedField = `${entityType}Ids`;
  if (!user.restrictedTo[restrictedField]) return true;
  
  return user.restrictedTo[restrictedField].includes(entityId.toString());
}

// Session generation
export function generateSession() {
  const sessionId = Array.from({ length: 64 }, () => 
    Math.random().toString(36)[2]).join('');
  
  return {
    sessionId,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    createdAt: new Date()
  };
}
```

### 2. Create Sessions Repository (SEPARATE collection)
File: `server/features/sessions/repository.js`
```javascript
import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';

const COLLECTION = 'sessions';

export async function create(sessionData) {
  const db = await connectDB();
  await db.collection(COLLECTION).insertOne(sessionData);
  return sessionData;
}

export async function findBySessionId(sessionId) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({
    sessionId,
    expiresAt: { $gt: new Date() }
  });
}

export async function deleteBySessionId(sessionId) {
  const db = await connectDB();
  await db.collection(COLLECTION).deleteOne({ sessionId });
}

export async function deleteExpired() {
  const db = await connectDB();
  await db.collection(COLLECTION).deleteMany({
    expiresAt: { $lte: new Date() }
  });
}
```

### 3. Create Users Repository
File: `server/features/users/repository.js`
```javascript
import { connectDB } from '~/server/db/mongo';
import { ObjectId } from 'mongodb';

const COLLECTION = 'users';

export async function create(data) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).insertOne({
    ...data,
    createdAt: new Date()
  });
  return await findById(result.insertedId);
}

export async function findById(id) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ _id: new ObjectId(id) });
}

export async function findByEmail(email) {
  const db = await connectDB();
  return await db.collection(COLLECTION).findOne({ email });
}

export async function find(filter = {}, options = {}) {
  const db = await connectDB();
  return await db.collection(COLLECTION)
    .find(filter)
    .sort(options.sort || { createdAt: -1 })
    .limit(options.limit || 100)
    .toArray();
}

export async function updateById(id, updates) {
  const db = await connectDB();
  const result = await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(id) },
    { $set: updates }
  );
  return result.modifiedCount > 0;
}

export async function updateLastLogin(userId) {
  const db = await connectDB();
  await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(userId) },
    { $set: { lastLoginAt: new Date() } }
  );
}
```

File: `server/features/users/service.js`
```javascript
import * as usersRepository from './repository.js';
import * as sessionsRepository from '../sessions/repository.js';
import { hashPassword, verifyPassword, generateSession, generateAccessToken } from '~/server/utils/auth-helpers';
import { createError } from 'h3';
import { PERMISSION_TEMPLATES } from './permission-templates.js';

export async function register(data, creatorUserId, creatorRole) {
  // Validate
  if (!data.email || !data.password || !data.name || !data.organizationId) {
    throw createError({ statusCode: 400, message: 'Missing required fields' });
  }
  
  // Check if email exists
  const existing = await usersRepository.findByEmail(data.email);
  if (existing) {
    throw createError({ statusCode: 409, message: 'Email already registered' });
  }
  
  // Only org admins can create users in their org, or SuperAdmin anywhere
  if (creatorRole !== 'SuperAdmin') {
    // TODO: verify creator is admin of target organization
  }
  
  // Hash password
  const passwordHash = await hashPassword(data.password);
  
  // Get permission template
  const role = data.role || 'IndividualUser';
  const permissions = PERMISSION_TEMPLATES[role] || PERMISSION_TEMPLATES['IndividualUser'];
  
  return await usersRepository.create({
    email: data.email.toLowerCase(),
    passwordHash,
    name: data.name,
    organizationId: data.organizationId,
    role,
    permissions,
    restrictedTo: data.restrictedTo || null,
    isActive: true
  });
}

export async function login(email, password) {
  const user = await usersRepository.findByEmail(email.toLowerCase());
  if (!user) {
    throw createError({ statusCode: 401, message: 'Invalid credentials' });
  }
  
  if (!user.isActive) {
    throw createError({ statusCode: 403, message: 'Account deactivated' });
  }
  
  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    throw createError({ statusCode: 401, message: 'Invalid credentials' });
  }
  
  // Generate session (separate collection)
  const session = generateSession();
  await sessionsRepository.create({
    ...session,
    userId: user._id
  });
  
  // Update last login
  await usersRepository.updateLastLogin(user._id);
  
  // Generate JWT (only contains userId)
  const accessToken = generateAccessToken(user._id);
  
  return {
    user: {
      id: user._id,
      email: user.email,
      name: user.name,
      organizationId: user.organizationId,
      role: user.role,
      permissions: user.permissions
    },
    sessionId: session.sessionId,
    accessToken
  };
}

export async function logout(sessionId) {
  await sessionsRepository.deleteBySessionId(sessionId);
  return { success: true };
}

export async function getUserBySessionId(sessionId) {
  const session = await sessionsRepository.findBySessionId(sessionId);
  if (!session) return null;
  
  return await usersRepository.findById(session.userId);
}

export async function getById(id) {
  return await repository.findById(id);
}

export async function list(userRole, userOrgId) {
  if (userRole === 'SuperAdmin') {
    return await repository.find();
  }
  
  // Others see only users in their org
  return await repository.find({ organizationId: userOrgId });
}

export async function updatePermissions(userId, permissions, updaterUserId, updaterRole, updaterOrgId) {
  const user = await repository.findById(userId);
  if (!user) {
    throw createError({ statusCode: 404, message: 'User not found' });
  }
  
  // Only org admins can update permissions in their org, or SuperAdmin
  if (updaterRole !== 'SuperAdmin' && user.organizationId.toString() !== updaterOrgId.toString()) {
    throw createError({ statusCode: 403, message: 'Cannot update users from other organizations' });
  }
  
  const success = await repository.updateById(userId, { permissions });
  if (!success) {
    throw createError({ statusCode: 500, message: 'Update failed' });
  }
  
  return await repository.findById(userId);
}
```

File: `server/features/users/permission-templates.js`
```javascript
export const PERMISSION_TEMPLATES = {
  SuperAdmin: {
    projects: "admin",
    queues: "admin",
    cassettes: "admin",
    warehouses: "admin",
    catalogs: "admin",
    requisitions: "admin",
    materials: "admin",
    users: "admin",
    organizations: "admin"
  },
  
  ManufacturerAdmin: {
    projects: "none",
    queues: "none",
    cassettes: "none",
    warehouses: "admin",
    catalogs: "admin",
    requisitions: "admin",
    materials: "read",
    users: "admin",
    organizations: "write"
  },
  
  ContractorAdmin: {
    projects: "admin",
    queues: "admin",
    cassettes: "admin",
    warehouses: "admin",
    catalogs: "read",
    requisitions: "admin",
    materials: "read",
    users: "admin",
    organizations: "write"
  },
  
  CustomerAdmin: {
    projects: "admin",
    queues: "read",
    cassettes: "read",
    warehouses: "none",
    catalogs: "none",
    requisitions: "read",
    materials: "read",
    users: "admin",
    organizations: "write"
  },
  
  IndividualUser: {
    projects: "none",
    queues: "none",
    cassettes: "none",
    warehouses: "none",
    catalogs: "none",
    requisitions: "none",
    materials: "none",
    users: "none",
    organizations: "none"
  }
};
```

### 3. Update Auth Middleware (FETCH USER FRESH)
File: `server/middleware/auth.js` (REPLACE)
```javascript
import { defineEventHandler, parseCookies, getHeader } from 'h3';
import { verifyAccessToken } from '~/server/utils/auth-helpers';
import { getUserBySessionId } from '~/server/features/users/service';
import * as usersRepository from '~/server/features/users/repository';

export default defineEventHandler(async (event) => {
  // Try JWT from Authorization header first
  const authHeader = getHeader(event, 'authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const payload = verifyAccessToken(token); // { userId }
      
      // FETCH USER FRESH (permissions may have changed)
      const user = await usersRepository.findById(payload.userId);
      if (user && user.isActive) {
        event.context.auth = {
          userId: user._id.toString(),
          organizationId: user.organizationId?.toString(),
          role: user.role,
          permissions: user.permissions,
          restrictedTo: user.restrictedTo
        };
      }
      return;
    } catch {
      // Token invalid, try cookie
    }
  }
  
  // Fallback to session cookie
  const cookie = parseCookies(event);
  const sessionId = cookie.sessionId;
  if (sessionId) {
    const user = await getUserBySessionId(sessionId);
    if (user && user.isActive) {
      event.context.auth = {
        userId: user._id.toString(),
        organizationId: user.organizationId?.toString(),
        role: user.role,
        permissions: user.permissions,
        restrictedTo: user.restrictedTo
      };
    }
  }
});
```

### 4. Create Permission & Filtering Helpers
File: `server/utils/permissions.js` (NEW)
```javascript
import { createError } from 'h3';
import { hasPermission } from './auth-helpers.js';
import { ObjectId } from 'mongodb';

export function requireAuth(event) {
  if (!event.context.auth) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }
  return event.context.auth;
}

export function requirePermission(event, entity, level) {
  const user = requireAuth(event);
  
  if (!hasPermission(user, entity, level)) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return user;
}

// Organization filtering for multi-tenant queries
export function getOrgFilter(user) {
  // SuperAdmin sees everything
  if (user.role === 'SuperAdmin') {
    return {};
  }
  
  // Others see only their organization
  return { organizationId: new ObjectId(user.organizationId) };
}

// Check if user can access specific entity
export function checkEntityAccess(user, entity, entityOrgId) {
  // SuperAdmin can access anything
  if (user.role === 'SuperAdmin') return true;
  
  // Others must match organization
  if (!entityOrgId) return false;
  return entityOrgId.toString() === user.organizationId.toString();
}
```
  
  const user = event.context.auth;
  if (!hasPermission(user, entity, level)) {
    throw createError({ 
      statusCode: 403, 
      message: `Requires ${entity}.${level} permission` 
    });
  }
}

export function requireRole(event, ...allowedRoles) {
  requireAuth(event);
  
  const user = event.context.auth;
  if (!allowedRoles.includes(user.role)) {
    throw createError({ 
      statusCode: 403, 
      message: 'Insufficient privileges' 
    });
  }
}
```

### 5. Create Auth API Endpoints
File: `server/api/auth/register.post.js`
```javascript
import { defineEventHandler, readBody } from 'h3';
import * as usersService from '~/server/features/users/service';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  
  // For now, open registration (add invitation tokens later)
  const user = await usersService.register(body, null, null);
  
  return { success: true, userId: user._id };
});
```

File: `server/api/auth/login.post.js`
```javascript
import { defineEventHandler, readBody, setCookie } from 'h3';
import * as usersService from '~/server/features/users/service';
import { generateAccessToken } from '~/server/utils/auth-helpers';

export default defineEventHandler(async (event) => {
  const { email, password } = await readBody(event);
  
  const result = await usersService.login(email, password);
  
  // Set session cookie
  setCookie(event, 'sessionId', result.sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 // 30 days
  });
  
  // Also return JWT for API clients
  const accessToken = generateAccessToken(result.user);
  
  return {
    user: result.user,
    accessToken
  };
});
```

File: `server/api/auth/logout.post.js`
```javascript
import { defineEventHandler, parseCookies, deleteCookie } from 'h3';
import * as usersService from '~/server/features/users/service';

export default defineEventHandler(async (event) => {
  const cookie = parseCookies(event);
  const sessionId = cookie.sessionId;
  
  if (sessionId) {
    await usersService.logout(sessionId);
  }
  
  deleteCookie(event, 'sessionId');
  
  return { success: true };
});
```

File: `server/api/auth/me.get.js`
```javascript
import { defineEventHandler } from 'h3';
import { requireAuth } from '~/server/utils/permissions';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  return event.context.auth;
});
```

File: `server/api/users/index.post.js`
```javascript
import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as usersService from '~/server/features/users/service';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;
  
  const body = await readBody(event);
  return await usersService.register(body, auth.userId, auth.role);
});
```

File: `server/api/users/index.get.js`
```javascript
import { defineEventHandler } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as usersService from '~/server/features/users/service';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;
  
  return await usersService.list(auth.role, auth.organizationId);
});
```

File: `server/api/users/[id]/permissions.patch.js`
```javascript
import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as usersService from '~/server/features/users/service';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;
  
  const userId = event.context.params.id;
  const { permissions } = await readBody(event);
  
  return await usersService.updatePermissions(
    userId, 
    permissions, 
    auth.userId, 
    auth.role, 
    auth.organizationId
  );
});
```

### 6. Add Indexes
File: `server/db/indexes.js`

Add to INDEXES object:
```javascript
users: [
  { keys: { email: 1 }, options: { unique: true, name: 'email_unique' } },
  { keys: { organizationId: 1 }, options: { name: 'organizationId_idx' } },
  { keys: { 'sessions.sessionId': 1 }, options: { name: 'sessions_sessionId_idx' } }
]
```

### 7. Environment Variables
File: `.env`
```
JWT_SECRET=<generate-random-256-bit-hex>
```

Generate with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 8. Create NEOLIT.md
File: `server/features/users/NEOLIT.md`
```markdown
# COMPONENT: Users

User authentication and permission management.

## Core Files
- `repository.js`: Database operations on `users` collection
- `service.js`: Register, login, permission management
- `permission-templates.js`: Default permissions by role
- API endpoints in `server/api/auth/` and `server/api/users/`

## Data Structure
Collection: `users`

Key fields:
- `passwordHash`: Argon2id
- `role`: SuperAdmin, ManufacturerAdmin, ContractorAdmin, CustomerAdmin, IndividualUser
- `permissions`: Per-entity access levels (none/read/write/admin)
- `restrictedTo`: Optional entity ID restrictions for IndividualUser
- `sessions`: Array of session objects

## Authentication Flow
1. Login → Verify password → Generate session + JWT
2. Session stored in cookie (30 days)
3. JWT in Authorization header (15 min expiry)
4. Middleware populates event.context.auth

## Permission System
- Permission levels: none < read < write < admin
- Checked via hasPermission(user, entity, level)
- Filtered by organizationId in queries

## Related Components
- [organizations](../organizations/NEOLIT.md) - Users belong to organizations
```

## Verification
- Can register user
- Can login (receive session cookie + JWT)
- Can access /api/auth/me with valid session
- Permission checks work in services

## Commit
```bash
git add server/features/users server/api/auth server/api/users server/utils/auth-helpers.js server/utils/permissions.js server/middleware/auth.js server/db/indexes.js
git commit -m "feat: implement user authentication with Argon2 + JWT and permission system"
git add server/features/users/NEOLIT.md
git commit -m "neo: document users and auth system"
```

---

# TASK 2.1: Rename Batches → Queues (Agent 2, 2 hours, depends on Task 1.3)

## Objective
Rename "batches" collection and all references to "queues" to free up "batch" term for material deliveries.

## Steps

### 1. Rename MongoDB Collection
Create script: `server/scripts/rename-batches-to-queues.js`
```javascript
import { connectDB } from '../db/mongo.js';

async function renameBatchesToQueues() {
  const db = await connectDB();
  
  try {
    await db.collection('batches').rename('queues');
    console.log('✓ Renamed batches → queues');
  } catch (err) {
    if (err.codeName === 'NamespaceNotFound') {
      console.log('⚠ batches collection does not exist (probably already renamed)');
    } else {
      throw err;
    }
  }
  
  process.exit(0);
}

renameBatchesToQueues();
```

Run:
```bash
node server/scripts/rename-batches-to-queues.js
```

### 2. Rename Feature Directory
```bash
mv server/features/batches server/features/queues
```

### 3. Update Collection Constant
File: `server/features/queues/repository.js`
```javascript
const COLLECTION = 'queues';  // was 'batches'
```

### 4. Update Indexes
File: `server/db/indexes.js`

Rename key from `batches` to `queues`:
```javascript
queues: [  // was batches
  { keys: { projectSlug: 1, queueNumber: 1 }, options: { unique: true, name: 'project_queue_unique' } },
  { keys: { ownerId: 1 }, options: { name: 'ownerId_idx' } },
  { keys: { status: 1 }, options: { name: 'status_idx' } }
]
```

### 5. Rename API Routes
```bash
mv server/api/batch server/api/queue
mv server/api/project/[slug]/batches server/api/project/[slug]/queues
```

### 6. Update Field Names in Service
File: `server/features/queues/service.js`

Replace:
- `batchNumber` → `queueNumber`
- Function names: `createBatch` → `createQueue`, etc.
- Comments mentioning "batch"

### 7. Update API Endpoint Paths
Search and replace in:
- `server/api/queue/*.js`
- `server/api/project/[slug]/queues/*.js`

Update route patterns and import paths.

### 8. Update Frontend
Rename components:
```bash
mv components/BatchEditor.vue components/QueueEditor.vue
```

Rename pages:
```bash
mv pages/project/[slug]/batches.vue pages/project/[slug]/queues.vue
mv pages/project/[slug]/batch pages/project/[slug]/queue
```

Update imports and references:
```bash
# Use your editor's find/replace
# Find: /batch/ (or import.*batch)
# Replace with: queue equivalents
```

### 9. Update i18n
Files: `i18n/locales/en.json`, `i18n/locales/ru.json`

Replace keys:
- `batch` → `queue`
- `batches` → `queues`
- `batchNumber` → `queueNumber`

### 10. Update NEOLIT.md
File: `server/features/queues/NEOLIT.md`

Update header and content:
```markdown
# COMPONENT: Queues Feature

Manages nesting jobs (renamed from "batches" in 2026-01 rework).

Note: "Batch" now refers to material deliveries, not nesting jobs.

...
```

## Verification
- Projects page loads
- Can create queue
- Can trigger nesting
- Can view results
- All references to "batch" in code now refer to "queue"

## Commit
```bash
git add -A
git commit -m "refactor: rename batches to queues throughout codebase"
git add server/features/queues/NEOLIT.md
git commit -m "neo: update queues documentation after rename"
```

---

# TASK 2.2: Integrate Auth with Existing Features (Agent 2, 1-2 hours)

## Objective
Add permission checks and organizationId filtering to existing features (projects, queues, cassettes, materials, etc.).

## Steps for Each Feature

### Pattern (apply to all):
1. Update service to check permissions
2. Filter queries by organizationId (except SuperAdmin)
3. Add ownership verification

### Projects
File: `server/features/projects/service.js` (create if doesn't exist)

```javascript
import * as repository from './repository.js';
import { createError } from 'h3';
import { hasPermission } from '~/server/utils/auth-helpers';

export async function create(data, userId, userOrg, userPermissions) {
  if (!hasPermission({ permissions: userPermissions }, 'projects', 'write')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  return await repository.create({
    ...data,
    ownerId: userId,
    contractorId: userOrg,
    createdAt: new Date()
  });
}

export async function list(userId, userOrg, userRole, userPermissions) {
  if (!hasPermission({ permissions: userPermissions }, 'projects', 'read')) {
    return [];
  }
  
  // SuperAdmin sees all
  if (userRole === 'SuperAdmin') {
    return await repository.find({});
  }
  
  // Others see only projects in their org
  return await repository.find({ contractorId: userOrg });
}

export async function getBySlug(slug, userId, userOrg, userRole, userPermissions) {
  if (!hasPermission({ permissions: userPermissions }, 'projects', 'read')) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
  
  const project = await repository.findBySlug(slug);
  if (!project) {
    throw createError({ statusCode: 404, message: 'Project not found' });
  }
  
  // Check ownership
  if (userRole !== 'SuperAdmin' && project.contractorId?.toString() !== userOrg.toString()) {
    throw createError({ statusCode: 403, message: 'Not your project' });
  }
  
  return project;
}

// Similar for update, delete...
```

Update API endpoints to call service with auth context:
```javascript
// server/api/project/index.post.js
import { requirePermission } from '~/server/utils/permissions';
import * as projectsService from '~/server/features/projects/service';

export default defineEventHandler(async (event) => {
  requirePermission(event, 'projects', 'write');
  const auth = event.context.auth;
  const body = await readBody(event);
  
  return await projectsService.create(
    body, 
    auth.userId, 
    auth.organizationId, 
    auth.permissions
  );
});
```

### Repeat Pattern for:
- Queues (`server/features/queues/service.js`)
- Cassettes (`server/features/cassettes/service.js`)
- Materials (read-only for non-SuperAdmin)
- Tool Profiles (read-only for non-SuperAdmin)
- Layer Standards (read-only for non-SuperAdmin)
- Pen Templates (read-only for non-SuperAdmin)

### Update Payment
File: `server/features/payment/` (modify existing)

Move balance from user to organization:
- Read balance from `organizations.settings.contractor.balance`
- Update purchases to modify organization balance
- Restrict to ContractorAdmin role

## Verification
- Login as ContractorAdmin → can CRUD projects
- Login as different ContractorAdmin → cannot see other org's projects
- SuperAdmin sees all projects
- Materials are read-only for non-SuperAdmin

## Commit
```bash
git add server/features/*/service.js server/api/**/*.js
git commit -m "feat: integrate permission checks and org filtering in all features"
```

---

# TASK 3.1: Warehouses (Agent 3, 1-2 hours, parallel to Agent 1)

## Objective
Warehouse management with inventory tracking.

## Data Model

### Collection: `warehouses`
```javascript
{
  _id: ObjectId,
  name: String,
  organizationId: ObjectId,
  
  address: String,
  contactPerson: String,
  
  // Cached counts
  totalBatches: Number,
  totalSheets: Number,
  totalRemnants: Number,
  
  createdAt: Date,
  createdBy: String
}
```

**Indexes:**
```javascript
{ organizationId: 1 }
```

## Implementation

Follow same pattern as Task 1.2 (Organizations):
1. Create `server/features/warehouses/`
2. repository.js (CRUD operations)
3. service.js (permission checks, org filtering)
4. API endpoints (`server/api/warehouses/`)
5. Add indexes
6. Create NEOLIT.md

Key service logic:
- Only org admins can create warehouses in their org
- Warehouses filtered by organizationId
- Inventory counts updated when batches/sheets created/used

## Commit
```bash
git add server/features/warehouses server/api/warehouses server/db/indexes.js
git commit -m "feat: add warehouses with inventory tracking"
git add server/features/warehouses/NEOLIT.md
git commit -m "neo: document warehouses feature"
```

---

# TASK 3.2: Catalogs & Requisitions (Agent 3, 3-4 hours)

## Data Models

### Collection: `catalogs`
```javascript
{
  _id: ObjectId,
  name: String,
  manufacturerId: ObjectId,
  description: String,
  
  sheetTypes: [{
    _id: ObjectId,
    material: String,
    color: String,
    thickness: Number,
    foilThickness: Number,
    sizes: [{
      width: Number,
      height: Number,
      pricePerSqm: Number
    }],
    notes: String
  }],
  
  createdAt: Date,
  updatedAt: Date
}
```

### Collection: `requisitions`
```javascript
{
  _id: ObjectId,
  requisitionNumber: String,
  
  contractorId: ObjectId,
  manufacturerId: ObjectId,
  projectId: ObjectId,
  queueId: ObjectId,
  
  items: [{
    catalogId: ObjectId,
    sheetTypeId: ObjectId,
    sizeIndex: Number,
    quantity: Number,
    
    // Snapshot
    material: String,
    color: String,
    thickness: Number,
    foilThickness: Number,
    width: Number,
    height: Number,
    pricePerSqm: Number,
    totalPrice: Number
  }],
  
  totalAmount: Number,
  
  status: String,  // "draft" | "sent" | "approved" | "fulfilled" | "canceled"
  statusHistory: [{
    status: String,
    timestamp: Date,
    userId: String,
    note: String
  }],
  
  notes: String,
  createdAt: Date,
  createdBy: String
}
```

**Indexes:**
```javascript
catalogs: [
  { keys: { manufacturerId: 1 }, options: { name: 'manufacturerId_idx' } },
  { keys: { 'sheetTypes._id': 1 }, options: { name: 'sheetTypes_id_idx' } }
]

requisitions: [
  { keys: { requisitionNumber: 1 }, options: { unique: true, name: 'reqNumber_unique' } },
  { keys: { contractorId: 1, status: 1 }, options: { name: 'contractor_status_idx' } },
  { keys: { manufacturerId: 1, status: 1 }, options: { name: 'mfg_status_idx' } }
]
```

## Implementation

### Catalogs
1. Create `server/features/catalogs/`
2. repository.js with CRUD + sheetType management
3. service.js:
   - ManufacturerAdmin can CRUD own catalogs
   - Contractors can READ all catalogs
   - Status transitions in statusHistory
4. API endpoints
5. Create NEOLIT.md

### Requisitions
1. Create `server/features/requisitions/`
2. repository.js with status management
3. service.js:
   - create() snapshots prices from catalog
   - send() changes status draft → sent
   - approve() (manufacturer only) changes sent → approved
   - fulfill() changes approved → fulfilled
   - Auto-generate requisitionNumber
4. API endpoints
5. Create NEOLIT.md

## Key Workflows
- Contractor creates requisition from catalog
- Snapshot prices at creation time
- Manufacturer approves
- Manufacturer creates material batch to fulfill (Task 3.3)

## Commit
```bash
git add server/features/catalogs server/features/requisitions server/api/catalogs server/api/requisitions server/db/indexes.js
git commit -m "feat: add catalogs and requisitions for material ordering"
git add server/features/catalogs/NEOLIT.md server/features/requisitions/NEOLIT.md
git commit -m "neo: document catalogs and requisitions"
```

---

# TASK 3.3: Material Batches & Sheets (Agent 3, 4-5 hours)

## Data Models

### Collection: `material_batches`
```javascript
{
  _id: ObjectId,
  batchNumber: String,
  receiptId: String,
  
  supplierId: ObjectId,
  warehouseId: ObjectId,
  requisitionId: ObjectId,
  
  piles: [{
    _id: ObjectId,
    partyId: String,
    
    totalCount: Number,
    usedCount: Number,
    
    material: String,
    color: String,
    thickness: Number,
    foilThickness: Number,
    width: Number,
    height: Number,
    
    pricePerSqm: Number,
    totalPrice: Number
  }],
  
  // SPEC: "requested" | "assembled" | "sent" | "arrived" | "in_stock" | "partially_used" | "used_up"
  status: String,
  statusHistory: [{
    status: String,
    timestamp: Date,
    userId: String,
    note: String,
    transportInfo: String,
    deliveryDate: Date
  }],
  
  notes: String,
  createdAt: Date,
  createdBy: String
}
```

### Collection: `sheets`
```javascript
{
  _id: ObjectId,
  sheetNumber: String,
  
  batchId: ObjectId,
  pileId: ObjectId,
  warehouseId: ObjectId,
  
  material: String,
  color: String,
  thickness: Number,
  foilThickness: Number,
  width: Number,
  height: Number,
  
  // SPEC: "in stock" | "in cutting" | "milled"
  status: String,
  history: [{
    action: String,
    timestamp: Date,
    userId: String,
    operatorType: String,
    note: String
  }],
  
  queueId: ObjectId,
  cassetteInstanceIds: [ObjectId],
  remnantIds: [ObjectId],
  
  createdAt: Date,
  createdBy: String
}
```

### Collection: `remnants`
```javascript
{
  _id: ObjectId,
  remnantNumber: String,
  
  sheetId: ObjectId,
  warehouseId: ObjectId,
  
  material: String,
  color: String,
  thickness: Number,
  foilThickness: Number,
  
  geometryDxf: String,
  area: Number,
  width: Number,
  height: Number,
  
  qrCode: String,
  isReusable: Boolean,
  
  // SPEC: "in stock" | "used"
  status: String,
  usedInQueueId: ObjectId,
  
  createdAt: Date,
  createdBy: String
}
```

**Indexes:**
```javascript
material_batches: [
  { keys: { batchNumber: 1 }, options: { unique: true, name: 'batchNumber_unique' } },
  { keys: { warehouseId: 1, status: 1 }, options: { name: 'warehouse_status_idx' } },
  { keys: { requisitionId: 1 }, options: { name: 'requisitionId_idx' } },
  { keys: { 'piles._id': 1 }, options: { name: 'piles_id_idx' } }
]

sheets: [
  { keys: { sheetNumber: 1 }, options: { unique: true, name: 'sheetNumber_unique' } },
  { keys: { batchId: 1, pileId: 1 }, options: { name: 'batch_pile_idx' } },
  { keys: { warehouseId: 1, status: 1 }, options: { name: 'warehouse_status_idx' } },
  { keys: { queueId: 1 }, options: { name: 'queueId_idx' } }
]

remnants: [
  { keys: { remnantNumber: 1 }, options: { unique: true, name: 'remnantNumber_unique' } },
  { keys: { sheetId: 1 }, options: { name: 'sheetId_idx' } },
  { keys: { warehouseId: 1, status: 1, isReusable: 1 }, options: { name: 'warehouse_status_reusable_idx' } }
]
```

## Implementation

### Material Batches
1. Create `server/features/material-batches/`
2. repository.js with pile management and **TRANSACTION SUPPORT**
3. service.js:
   - create() with piles array
   - createFromRequisition() helper
   - Status transitions respect SPEC order
   - **allocateSheets() uses MongoDB transaction** (decrement usedCount + create sheets atomically)
   - Auto-update status based on usedCount (partially_used, used_up)
4. API endpoints including status transitions
5. Create NEOLIT.md

**Critical Transaction Example:**
```javascript
// In material-batches/service.js
import { connectDB } from '~/server/db/mongo';

export async function allocateSheets(batchId, pileId, count, userId) {
  const db = await connectDB();
  const session = db.client.startSession();
  
  try {
    await session.withTransaction(async () => {
      // 1. Decrement pile usedCount
      const result = await db.collection('material_batches').updateOne(
        {
          _id: new ObjectId(batchId),
          'piles._id': new ObjectId(pileId),
          $expr: { $lt: ['$piles.usedCount', '$piles.totalCount'] } // Guard: don't over-allocate
        },
        { 
          $inc: { 'piles.$.usedCount': count },
          $set: { updatedAt: new Date() }
        },
        { session }
      );
      
      if (result.modifiedCount === 0) {
        throw createError({ statusCode: 409, message: 'Insufficient sheets in pile' });
      }
      
      // 2. Create sheets
      const sheets = Array.from({ length: count }, (_, i) => ({
        sheetNumber: `SH-${Date.now()}-${i}`,
        batchId: new ObjectId(batchId),
        pileId: new ObjectId(pileId),
        // ... rest of sheet data
      }));
      
      await db.collection('sheets').insertMany(sheets, { session });
    });
    
    return { success: true };
  } finally {
    await session.endSession();
  }
}
```

### Sheets
1. Create `server/features/sheets/`
2. repository.js
3. service.js:
   - allocateFromBatch() creates N sheets, decrements pile **(called by batch service in transaction)**
   - updateStatus() with history tracking
   - finishMilling() creates cassettes + remnants
   - Auto-generate sheetNumber
4. API endpoints
5. Create NEOLIT.md

### Remnants
1. Create `server/features/remnants/`
2. repository.js with reusability filtering
3. service.js:
   - create() from sheet + geometry
   - searchReusable() for nesting
   - markAsUsed() when included in queue
   - Auto-generate remnantNumber
4. API endpoints
5. Create NEOLIT.md

## Key Integration
- When queue marked as "cut" (Task 2.2):
  - Update sheet status: in_stock → in_cutting → milled
  - Call sheets.finishMilling()
  - Create cassette_instances
  - Create remnants
  - Update project.cutLogs

## Commit
```bash
git add server/features/material-batches server/features/sheets server/features/remnants server/api/material-batches server/api/sheets server/api/remnants server/db/indexes.js
git commit -m "feat: add material batches, sheets, and remnants tracking"
git add server/features/material-batches/NEOLIT.md server/features/sheets/NEOLIT.md server/features/remnants/NEOLIT.md
git commit -m "neo: document material tracking features"
```

---

# TASK 4.1: Auth UI (Agent 4, 2 hours, depends on Task 1.3)

This and following UI tasks need to follow next requirements:
- Stick to PrimeVue default styles, try to minimize custom CSS
- Try to reach typographic excellence (spacing, alignment, font sizes, monospace aesthetic) and pixel-perfect layouts
- Try to create reusable components where possible
- Use async/await and proper error handling

## Objective
Login/register pages, user management UI.

## Pages to Create

### Login Page
File: `pages/auth/login.vue`
- Email + password form
- Call POST /api/auth/login
- Redirect to dashboard on success
- Use PrimeVue InputText, Password, Button

### Register Page
File: `pages/auth/register.vue`
- Email, name, password, confirm password
- Organization selector (or create new)
- Call POST /api/auth/register
- Redirect to login on success

### Users Management
File: `pages/admin/users.vue`
- DataTable with users list
- Create user button
- Edit permissions action
- Deactivate user action

### Organizations Management
File: `pages/admin/organizations.vue`
- DataTable with organizations
- Create org button (SuperAdmin only)
- Edit org details

## Components

### PermissionEditor.vue
Checkbox grid for entity x permission level

### UserForm.vue
Create/edit user form

## Navigation Updates
File: `layouts/default.vue`
- Add Admin menu (for SuperAdmin)
- Show organization name
- User role badge in profile dropdown

## Commit
```bash
git add pages/auth pages/admin components/*Form.vue components/PermissionEditor.vue layouts/default.vue
git commit -m "feat: add auth UI and user management pages"
```

---

# TASK 4.2: Material Tracking UI (Agent 4, 2 hours)

## Pages to Create

### Manufacturer Views
- `pages/manufacturer/catalogs.vue` - Manage catalogs
- `pages/manufacturer/requisitions.vue` - Incoming requisitions
- `pages/manufacturer/batches.vue` - Outgoing batches

### Contractor Views
- `pages/contractor/requisitions.vue` - Create/track requisitions
- `pages/contractor/batches.vue` - Incoming batches
- `pages/contractor/sheets.vue` - Sheet inventory
- `pages/contractor/remnants.vue` - Remnant inventory
- `pages/contractor/warehouses.vue` - Warehouse management

## Components
- `CatalogForm.vue`
- `RequisitionForm.vue`
- `MaterialBatchForm.vue`
- `WarehouseForm.vue`

## Integration with Queue Editor
File: `components/QueueEditor.vue`
- Add sheet selection pool
- Option to allocate from batch
- Option to use remnants

## Commit
```bash
git add pages/manufacturer pages/contractor components/*Form.vue components/QueueEditor.vue
git commit -m "feat: add material tracking UI for manufacturers and contractors"
```

---

# TASK 4.3: Dashboards (Agent 4, 2 hours)

## Dashboard Page
File: `pages/dashboard.vue` or update `pages/index.vue`

Dynamic widgets based on role:
- SuperAdmin: System stats, org list
- ManufacturerAdmin: Requisitions, batches
- ContractorAdmin: Projects, queues, inventory
- CustomerAdmin: Projects

## Commit
```bash
git add pages/dashboard.vue pages/index.vue components/dashboard/*.vue
git commit -m "feat: add role-based dashboards"
```

---

# APPENDIX A: Complete Schema Reference

All collections with fields and indexes. (Copy from above sections)

---

# APPENDIX B: Status Transitions

From BIGREWORK.md specification:

**Material Batches:** 
requested → assembled → sent → arrived → in_stock → partially_used → used_up

**Sheets:** 
(created) → in_stock → in_cutting → milled

**Cassette Instances:** 
manufactured → on-site → installed

**Remnants:** 
in_stock → used

**Requisitions:** 
draft → sent → approved → fulfilled (or canceled)

---

# APPENDIX C: Testing Checklist

## Auth System
- [ ] Register user with email/password
- [ ] Login receives session cookie + JWT
- [ ] /api/auth/me returns user data
- [ ] Logout invalidates session
- [ ] Permission checks work (403 when denied)
- [ ] SuperAdmin can create organizations
- [ ] Org admin can create users in org
- [ ] Users filtered by organization

## Core Features
- [ ] Projects list loads with auth
- [ ] Can create project
- [ ] Can create queue
- [ ] Can trigger nesting
- [ ] Can mark queue as cut
- [ ] cutLogs updated in project

## Material Tracking
- [ ] Manufacturer creates catalog
- [ ] Contractor views catalogs
- [ ] Contractor creates requisition
- [ ] Manufacturer approves requisition
- [ ] Manufacturer creates material batch
- [ ] Batch status transitions work
- [ ] Contractor allocates sheets from batch
- [ ] Sheets appear in inventory
- [ ] Sheets used in queue
- [ ] Remnants created after cutting

---

# APPENDIX D: Seed Script

File: `server/scripts/seed-system.js`

Creates:
1. Service Provider org + SuperAdmin user (admin@cutkit.dev / Admin123!)
2. Test Manufacturer org + ManufacturerAdmin (mfg@test.com / Mfg123!)
3. Test Contractor org + ContractorAdmin (contractor@test.com / Cont123!)
4. Test Customer org + CustomerAdmin (customer@test.com / Cust123!)
5. Sample catalog for manufacturer
6. Warehouse for contractor

Run:
```bash
node server/scripts/seed-system.js
```

---

# Documentation Requirements (AGENTS.md)

Every task MUST:
1. **Phase 0:** Verify NEOLIT.md exists for the feature
2. **Phase 3:** Update/create NEOLIT.md after implementation
3. **Phase 4:** Commit code first, then docs separately
4. Write Agent Notes in TODO.org

NEOLIT.md structure:
- Core files list
- Data structure (reference, not duplicate schema)
- Key workflows
- Access control rules
- Related components (with links)

---

**End of Implementation Plan**

One day, 3 agents, parallel execution. Good luck! 🚀
