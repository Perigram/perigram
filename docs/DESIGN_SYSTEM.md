# CutKit Design System

## Source of Truth

The frontend design-system contract is manifest-driven:

- `utils/design-system-contract.js` defines entity metadata without Vue imports.
- `utils/design-system.js` binds that metadata to Vue card components and DTO factories.
- `test-data/factories.js` provides DTO-shaped examples.
- `/test/ui-lab` renders directly from the manifest.

New entity cards must be added to the manifest before they appear in UI lab.

## Entity Card Contract

Every entity card should support:

- `variant="inline"`
- `variant="compact"`
- `variant="card"`

Cards use shared primitives for standard blocks:

- `IdentityBlock` for `identity`
- `EntityStatus` or `StatusBadge` for `status`
- `TraceChain` for `lineage`
- `SpecsBlock` for physical dimensions
- `DataBlock` for entity-specific label/value fields
- `EntityCard` for card chrome

## DTO Contract

Demo data follows API DTO shape, not raw MongoDB documents.

Required v24 blocks:

- `identity`
- `origin`
- `status`
- `lineage`
- `attachments`
- `data`
- `summary`

Hoisted aliases are allowed only when current model/service DTOs emit them.

## Legacy Quarantine

Legacy/demo surfaces are excluded from the manifest until intentionally migrated:

- `components/**/*.v23.vue`
- `components/CassetteDesigner.old.vue`
- archived styling notes under `docs/archive/`
- one-off diagnostics pages not intended as design-system examples

Do not delete quarantined files without a separate import check and cleanup task.

## Verification

Run the focused contract check after changing manifest/factories:

```bash
npx vitest run shared/design-system.spec.js
```
