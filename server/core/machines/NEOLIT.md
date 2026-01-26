# COMPONENT: State Machine Engine & Aggregator

Centralized logic for governing entity lifecycles, enforcing business rules, and maintaining cross-entity data integrity (aggregations).

## Architecture
The system consists of three main parts: the transition engine, the automation hooks, and the centralized aggregator.

### 1. State Machine Engine
- **`definitions.js`**: Declarative source of truth. Defines states, role-based transitions, and automation triggers.
- **`service.js`**: Validates transitions, updates entity snapshots (`status` block), and logs history to `status_events`.

### 2. Automation Hooks (`hooks.js`)
Registry of side-effects triggered by transitions:
- **`propagateToChildren`**: Automatically moves child entities (e.g., Queues) when a parent (Project) changes state.
- **`triggerAggregator`**: The entry point for lineage-aware data synchronization.

### 3. Centralized Aggregator (`aggregator.js`)
Synchronizes parent summaries based on child activity using high-performance MongoDB aggregation pipelines.
- **Lineage-Aware**: Uses the `lineage` block to instantly target the correct ancestor (e.g., `projectId`).
- **Data Points**:
    - `queueCount` / `instanceCount`: Total counts of child entities.
    - `totalArea`: Summed area from child `specs`.
    - `statusDistribution`: A map of counts per state (e.g., `{ 'READY': 5, 'DRAFT': 2 }`) for progress visualization.

## Data Flow
1. User/System triggers `statusService.transition()`.
2. Transition is validated and written to DB.
3. `triggerAggregator` hook is called if defined in `definitions.js`.
4. `aggregator.js` performs a `$group` aggregation on children matching the lineage.
5. Parent's `summary` block is updated in one atomic operation.

## Component Integration
Frontend components (e.g., `ProjectCard.vue`) strictly read from the `summary` block. They do NOT calculate children data themselves.

## Related
- [server/utils/blocks.js](../utils/blocks.js) (Standard Block definitions)
- [composables/useStatusController.js](../../composables/useStatusController.js) (Frontend bridge)