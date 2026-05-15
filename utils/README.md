# COMPONENT: Frontend Utilities

Shared frontend utility modules used by Vue pages/components.

## Design System Contract

- `design-system-contract.js`: UI contract metadata for entity demos. Defines entity keys, card prop names, status/trace policy, factory names, variants, groups, and docs links without importing Vue components.
- `design-system.js`: Runtime binding that attaches Vue card components and DTO factories to the contract. Used by `/test/ui-lab`.
- `data-display.js`: Shared path resolution and value formatting for generated `DataBlock` rows. It formats scalar values, booleans, scalar arrays, object arrays, and named object references while hiding non-displayable nested objects instead of rendering `[object Object]`.
- `status-engine.js`: Central status severity/icon mapping and entity route/icon registry used by shared status and trace components. It must include every canonical workflow state exposed by `packages/domain-cnc/src/index.js`, including terminal states, so generated entity UI never falls back to unknown badges.
- `status-actions.js`: Converts workflow definitions into default `EntityStatus` action buttons so cards do not use hardcoded state transitions.

The design-system contract is the source of truth for UI lab coverage. Add new entity cards there first, then wire the component and DTO factory in `design-system.js` / `test-data/factories.js`.

## Related

- [components](../components/README.md) - entity component rules and shared block usage
- [test-data](../test-data/README.md) - DTO-shaped factories used by demos and tests
