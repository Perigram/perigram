# AGENTS.md

Architecture guide for Cutkit-Demo: DXF nesting application (Nuxt.js 3 + Vue 3 + MongoDB).

## Stack

- **Frontend:** Nuxt.js 3 SSR, Vue 3, Tailwind CSS, SCSS
- **Backend:** Nuxt.js Server (Nitro), MongoDB (native driver), GridFS for file storage
- **Auth:** Session-based (cookies) + OAuth (GitHub/Google)
- **Workers:** Python workers for CPU-intensive tasks (fileprocessing, nesting)
- **Payment:** Stripe for credit purchases

## Directory Structure

```
/components        - Vue components (40+ reusable UI components)
/pages             - File-based routing
/layouts           - Layout wrappers
/composables       - State stores (reactive pattern)
/constants         - Enums and constants
/server
  /api             - API endpoints (organized by resource)
  /db              - MongoDB connection & GridFS buckets
  /features        - Business logic (nesting, payment, support, results)
  /utils           - Server utilities
  /middleware      - Server middleware (auth)
  /schemas         - Validation schemas
/middleware        - Client route middleware
/workers           - Python workers
/assets
  /css             - Global CSS (CSS variables for theming)
  /scss            - SCSS variables, mixins, fonts
/plugins           - Nuxt plugins (theme initialization)
/public            - Static assets
```

## Data Model (MongoDB Collections)

**Collections:**
- `users` - User accounts (id, email, credits, isAdmin, avatarId, sessions, balance)
- `projects` - User projects (slug, name, ownerId, createdAt, statistics, tables)
- `user_dxf_files` - Uploaded DXF files (slug, projectSlug, processingStatus, svgId, dxfId)
- `nesting_jobs` - Nesting results (resultId, projectSlug, status, params, sheets, statistics)
- `tables` - Project tables (projectId, name, data, columnMappings, status)
- `cassettes` - User cassettes (userId, name, dxfId, svgId, layerMapping, processingStatus)

**GridFS Buckets:**
- `avatars` - User profile images
- `userDxf` - Original uploaded DXF files
- `userDxfFilesSvg` - SVG previews of user files
- `validDxf` - Processed/validated DXF files
- `nestSvg` - Nesting result SVG visualizations
- `nestDxf` - Nesting result DXF files
- `cassettes` - Cassette DXF files (global user storage)

## State Management Pattern

All stores follow the **readonly reactive pattern**:

```javascript
const state = reactive({
    data: null,
    computed: computed(() => transform(state.data))
})

export const myStore = readonly({
    getters: {
        data: computed(() => state.data)
    },
    actions: {
        async fetchData() { /* modify state */ }
    }
})
```

**Core Stores:**
- `authStore` (`composables/auth.js`) - User authentication state, session management
- `filesStore` (`composables/files.js`) - Project files, nesting params, file counts
- `globalStore` (`composables/index.js`) - Projects list, results list, modal data, notifications
- `themeStore` (`composables/theme.js`) - Theme switching (light/dark)
- `tablesStore` (`composables/tables.js`) - Project tables, table data, upload/validation
- `cassettesStore` (`composables/cassettes.js`) - User cassettes, layer mapping, cassette selection
- `useModalState` - Dialog state management (useState pattern)

**Store Rules:**
- State is private reactive object
- Export readonly wrapper with getters (computed) and actions
- Only actions modify state
- Use computed for derived values
- Import from other stores via their readonly interface

## Component Design System

**Design Tokens (CSS Variables):**
```scss
// Light theme (default)
--background-primary, --background-secondary
--label-primary, --label-secondary, --label-tertiary
--fill-secondary, --fill-tertiary
--accent-primary, --accent-secondary
--separator-primary, --separator-secondary
```

**Theme Switching:**
- Themes stored in cookie, applied via `data-theme` attribute
- Plugin sets theme on SSR and client hydration
- `themeStore` toggles between themes

**Component Principles:**

1. **Prop-driven variants:** Use constants for size, theme, icon types
   ```javascript
   // constants/size.constants.js
   export const sizeType = { s: 's', m: 'm', l: 'l' }
   export const defaultSizeType = sizeType.m
   ```

2. **BEM-like scoped styles:** Use `$self` reference pattern
   ```scss
   .button {
       $self: &;
       &__label { /* nested element */ }
       &--size-m { /* modifier */ }
       &--disabled { /* state */ }
   }
   ```

3. **Computed classes:** Build class objects dynamically
   ```javascript
   const buttonClasses = computed(() => ({
       [`button--size-${size}`]: Boolean(size),
       [`button--theme-${theme}`]: Boolean(theme),
       'button--disabled': isDisable
   }))
   ```

4. **Icon system:** SVG masks with background-color for themeable icons
   ```scss
   &__icon {
       mask-image: url('/icons/svg/plus.svg');
       background-color: var(--label-primary);
   }
   ```

5. **Teleport for modals:** Use `<teleport to="body">` for overlays

6. **Emit conventions:** Use `update:modelValue` for v-model, custom events for actions

## API Architecture

**Pattern:** RESTful endpoints organized by resource in `/server/api/{resource}/`

**Request Flow:**
1. Client makes request with `useFetch` or `$fetch`
2. `server/middleware/auth.js` runs on ALL requests
3. Reads `sessionId` cookie, fetches user from DB
4. Attaches `event.context.auth = { userId, isAdmin }` to request
5. API handler accesses `event.context.auth.userId`
6. Response sent back to client

**API Endpoints:**
- `POST /api/project` - Create new project (returns slug)
- `GET /api/project/:slug` - Get project + files + tables
- `DELETE /api/project/:slug` - Delete project and associated data
- `POST /api/project/:slug/addfiles` - Upload DXF files (FormData)
- `DELETE /api/project/:slug/files/:fileSlug` - Delete specific file
- `POST /api/project/:slug/nest` - Trigger nesting job (returns job data)
- `GET /api/project/:slug/results` - Get nesting results for project
- `GET /api/project/me` - Get all user projects
- `GET /api/project/:slug/tables` - Get project tables
- `POST /api/project/:slug/tables/create` - Create new table
- `POST /api/project/:slug/tables/upload` - Upload table from CSV/Excel
- `GET /api/tables/:id` - Get table data
- `PUT /api/tables/:id` - Update table data
- `DELETE /api/tables/:id` - Delete table
- `GET /api/cassettes` - Get user cassettes
- `POST /api/cassettes/upload` - Upload cassette DXF
- `GET /api/cassettes/:id` - Get cassette details
- `PUT /api/cassettes/:id` - Update cassette (layer mapping)
- `DELETE /api/cassettes/:id` - Delete cassette
- `POST /api/auth/logout` - Clear session
- `GET /api/user` - Get current user
- `POST /api/user/add-credits` - Add credits to user balance (dev only)
- `POST /api/payment/*` - Stripe payment handlers

**Auth Flow:**
- Session created on login, stored in `users.sessions` array
- SessionId stored in httpOnly cookie
- `server/middleware/auth.js` validates on every request
- Client middleware (`middleware/auth.js`) redirects unauthenticated users
- `authStore.setUser()` fetches user on client initialization

**File Upload Pattern:**
```javascript
const formData = new FormData()
formData.append('projectName', name)
files.forEach(file => formData.append('dxf', file))
await $fetch('/api/project/:slug/addfiles', { method: 'POST', body: formData })
```

## Data Flows

### Project Creation Flow
1. User uploads DXF files
2. `POST /api/project` creates project with generated slug
3. Files saved to GridFS (`userDxf` bucket)
4. Worker processes DXF → SVG conversion (async)
5. `user_dxf_files` updated with `processingStatus: 'done'`
6. Client polls project endpoint until all `processingStatus === 'done'`

### Nesting Flow
1. User sets params (widthPlate, heightPlate, space, sheetCount)
2. User selects files and counts
3. Client validates params, checks credit balance
4. `POST /api/project/:slug/nest` triggers nesting job
5. Worker calculates optimal nesting (async)
6. Result saved to `nesting_jobs` with SVG/DXF in GridFS
7. Client shows result modal with statistics

### File Processing States
```javascript
// constants/files.constants.js
processingType = { done: 'done', inProgress: 'in-progress', error: 'error' }
```

### Cassette Flow
1. User uploads DXF file as cassette template
2. `POST /api/cassettes/upload` saves to GridFS (`cassettes` bucket)
3. Worker detects DXF layers (async)
4. User maps DXF layers to cassette layer types (cut, bend, frame, dimensions)
5. Cassette available globally across all user projects
6. Cassettes can be selected as templates when creating parts

## Architectural Patterns

**1. Polling for Async Jobs:**
- Files processing: Poll every 5 seconds until `isSvgLoaded` (all files done)
- Nesting jobs: Poll results endpoint for status changes

**2. Modal Management:**
- Use `useState` for dialog open/close state
- Store modal data in global store (e.g., `resultModalData`)
- `DialogWrapper` component handles ESC key, backdrop click

**3. Credit System:**
- Credits stored in `users.credits` field
- Nesting costs credits (checked before job creation)
- 402 Payment Required returned if insufficient credits
- Shows `BuyCreditsDialog` on 402 error

**4. Error Handling:**
```javascript
try {
    const data = await $fetch('/api/endpoint')
} catch (error) {
    if (error?.response?.status === 402) {
        // Show payment dialog
    }
    if (error?.response?.status === 401) {
        // Redirect to login
    }
}
```

**5. Navigation:**
- `navigateTo('/path')` for programmatic navigation
- `definePageMeta({ middleware: 'auth' })` for protected pages

## Constants & Configuration

**File Locations:**
- `/constants/{resource}.constants.js` - Enums for size, theme, icon, status, processing
- `/composables/apiRoutes.js` - Centralized API route definitions
- `/nuxt.config.js` - Runtime config (env vars), Vite config, head meta
- `/assets/css/main.css` - CSS variable definitions for themes

**Theme Constants:**
```javascript
themeType = { ghost: 'ghost', secondary: 'secondary', primary: 'primary' }
```

**Size Constants:**
```javascript
sizeType = { s: 's', m: 'm', l: 'l' }
```

## Development Principles

1. **Minimal Tailwind usage:** Custom SCSS components with design tokens
2. **SSR-aware:** Check `process.client` vs `process.server` when needed
3. **Type safety:** JSDoc comments for better IDE support (see `server/db/mongo.js`)
4. **Feature-based server code:** Business logic in `/server/features/`
5. **No Mongoose:** Direct MongoDB driver usage with native queries
6. **GridFS for files:** All binary data in GridFS buckets, not collections
7. **Computed-heavy:** Prefer computed properties over methods for derived state
8. **Readonly stores:** Never mutate store state directly from components

## Adding New Features

**New Component:**
1. Create in `/components/{Name}.vue`
2. Follow BEM naming with `$self` pattern
3. Define props with defaults from constants
4. Use computed for class bindings
5. Emit events for parent communication

**New API Endpoint:**
1. Create in `/server/api/{resource}/{slug?}/action.{get|post|delete}.js`
2. Use `defineEventHandler(async (event) => { ... })`
3. Get auth from `event.context.auth.userId`
4. Validate with `createError({ statusCode, message })`
5. Use `await connectDB()` to get db instance
6. Return plain objects (auto-serialized to JSON)

**New Store:**
1. Create in `/composables/{feature}.js`
2. Define reactive state object
3. Create computed getters
4. Export readonly({ getters: {}, actions: {} })
5. Import API routes from `apiRoutes.js`

**New Modal:**
1. Add state to `useModalState.js`: `export const useMyDialog = () => useState('myDialog', () => false)`
2. Use `DialogWrapper` with `v-model:isModalOpen`
3. Store modal data in appropriate store (e.g., globalStore)

## **Important note**
If you found inconsistencies in this file, that looks like non-aligned with actual project technologies, architecture or practices, feel free to change this file with actual up-to-date information.
