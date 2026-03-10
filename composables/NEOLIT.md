# COMPONENT: Composables & Stores - v24 Standardized

Centralized frontend logic for state management, API interactions, and UI behaviors.

## v24 Core Composables
These are the primary reactive bridges for working with v24 Block-based entities.

- **[useEntity.js](./useEntity.js):** The main entry point for entity interaction.
  - `fetch(id)`: Load entity data.
  - `update(data)`: Patch entity data.
  - `changeStatus(state, meta)`: Perform state machine transition.
  - **Computed Blocks**: Automatically unwraps `name`, `slug`, `state`, `lineage`, `specs`, etc.
- **[useBlocks.js](./useBlocks.js):** Low-level atomic composables for reactive access to entity blocks: `useIdentity`, `useStatus`, `useSpecs`, `useLineage`.

  ⚠️ **Restricted use**: These composables are ONLY imported by the shared block components (`IdentityBlock.vue`, `EntityStatus.vue`, `SpecsBlock.vue`). Entity cards and page components must never import from `useBlocks.js` — they use the block components instead.

  Exception: `useStatus` may be used in an entity card to read `state` for a `v-if` conditional (not for display).
- **[useStatusController.js](./useStatusController.js):** Direct bridge to the State Machine Engine API.
- **[useStatusHistory.js](./useStatusHistory.js):** Fetches and reactive manages the audit log (`status_events`) for an entity.
- **[useTraceability.js](./useTraceability.js):** Resolves ancestry and descendants via the lineage block.

## State Management (Pinia)
Located in `stores/`. Global state that persists across page navigations.

### Key Stores
- **`auth.js`**: Session, user profile, and global organization context.
- **`queues.js`**: (formerly batches) Manages nesting jobs and results.
- **`cassettes.js`**: User templates and designs.
- **`global.js`**: Layout state, notifications, and shared lookup lists (e.g., projects).

## Usage Guide

### Interacting with a Project
```javascript
const { entity: project, fetch, changeStatus, state } = useEntity('project', slug);

onMounted(() => fetch());

const closeProject = () => changeStatus('CLOSED', { note: 'Completed' });
```

### Accessing Atomic Data
```javascript
const { name, statusColor, formattedArea } = useEntity('queue', id);
// Returns reactive refs ready for template usage:
// <span>{{ name }}</span> <Badge :severity="statusColor" />
```

## Related
- [server/core/blocks/](../server/core/blocks/) (Backend source of truth)
- [server/core/machines/](../server/core/machines/) (State Machine definitions)
