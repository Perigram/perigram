# COMPONENT: Composables (State Management)

This directory contains the frontend state management logic using Nuxt 3 composables. The project follows a "Readonly Reactive" store pattern instead of using Pinia.

## Store Pattern
Each store typically consists of:
- A private `reactive` state object.
- A set of `computed` getters.
- A set of `async` actions for API interaction.
- An exported object containing `getters` and `actions`.

Example structure:
```javascript
const state = reactive({ items: [], loading: false });
const getters = { items: computed(() => state.items) };
const actions = { async fetch() { ... } };
export const myStore = { getters, actions };
```

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
