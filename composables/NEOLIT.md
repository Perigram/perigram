# COMPONENT: Composables & Stores

## v24 Standardized Composables
Helpers for working with the universal block architecture.

- **[useBlocks.js](./useBlocks.js):** Standardized rendering for all entities.
  - `useIdentity(entity)`: Get name, slug, and serial.
  - `useStatus(entity)`: Get state, formatted time, and semantic color.
  - `useLineage(entity)`: Ancestry lookup.
  - `useSpecs(entity)`: Physical dimensions and area formatting.
- **[useStatusController.js](./useStatusController.js):** Frontend bridge for the centralized State Machine engine.
  - `transition(type, id, state, meta)`: Triggers a validated state change.

## State Management (Pinia)
The project uses **Pinia** for global state management. Stores are located in the `stores/` directory and are auto-imported.

### Key Stores
- **[authStore](../stores/auth.js):** Manages user session, login status, and user profile data.
- **[batchesStore](../stores/batches.js):** Handles batch creation, updates, fetching, and nesting.
- **[cassettesStore](../stores/cassettes.js):** Manages user cassette templates.
- **[globalStore](../stores/global.js):** Global application state (projects list, notifications).
- **[layerStandardsStore](../stores/layerStandards.js):** System-defined DXF layer standards.

### Usage
```javascript
const authStore = useAuthStore();
const { user } = storeToRefs(authStore);

await authStore.setUser();
```

## Composables
This directory contains reusable logic that leverages Nuxt's `useState` for component-local or request-scoped state, and other utility functions.

- **[apiRoutes.js](./apiRoutes.js):** API endpoint constants.
- **[useModalState.js](./useModalState.js):** UI state for dialogs (uses `useState`).

## Key Stores
- **[authStore](./auth.js):** Manages user session, login status, and user profile data.
- **[batchesStore](./batches.js):** Handles batch creation, updates, fetching, and triggering nesting jobs.
- **[cassettesStore](./cassettes.js):** Manages user cassette templates.
- **[globalStore](./global.js):** Global application state including navigation, notifications, and shared UI states.
- **[layerStandardsStore](./layerStandards.js):** Provides access to system-defined DXF layer standards.

## UI Architecture
The project is migrating to **PrimeVue** for its component system.

### Design Tokens (CSS Variables)
Used for consistent styling across custom and PrimeVue components:
- `--background-primary`, `--background-secondary`
- `--label-primary`, `--label-secondary`, `--label-tertiary`
- `--accent-primary`, `--accent-secondary`
- `--separator-primary`, `--separator-secondary`

### Layouts
- **[dashboard.vue](../layouts/app.vue):** Main app layout with Menubar and UserBalance. Used for general authenticated views.
- **[project.vue](../layouts/app.vue):** Specialized workspace layout with a project sidebar (Files, Batches, Settings). Used for `/project/:slug/*` routes.

## Usage in Components
Composables are automatically imported by Nuxt. In a component:
```javascript
const { getters, actions } = batchesStore;
const batches = getters.batches;
await actions.fetchBatches(projectSlug);
```
