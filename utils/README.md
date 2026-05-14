# COMPONENT: Frontend Utilities

Shared frontend utility modules used by Vue pages/components.

## Design System Contract

- `design-system-contract.js`: UI contract metadata for entity demos. Defines entity keys, card prop names, status/trace policy, factory names, variants, groups, and docs links without importing Vue components.
- `design-system.js`: Runtime binding that attaches Vue card components and DTO factories to the contract. Used by `/test/ui-lab`.
- `status-engine.js`: Central status severity/icon mapping and entity route/icon registry used by shared status and trace components.

The design-system contract is the source of truth for UI lab coverage. Add new entity cards there first, then wire the component and DTO factory in `design-system.js` / `test-data/factories.js`.

## Related

- [components](../components/README.md) - entity component rules and shared block usage
- [test-data](../test-data/README.md) - DTO-shaped factories used by demos and tests
