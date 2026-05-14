# CutKit Design System

## Source Of Truth

CutKit uses PrimeVue 4, Tailwind utilities, and a small app token layer. The design system is code-driven:

- `assets/tokens/index.js` owns semantic app tokens and exports PrimeVue/Tailwind projections.
- `assets/presets/re_l.js` is the PrimeVue preset and consumes component token overrides.
- `tailwind.config.js` exposes semantic Tailwind aliases backed by PrimeVue `--p-*` and CutKit `--ck-*` variables.
- `assets/css/main.css` declares runtime `--ck-*` variables and only global layout helpers.
- `utils/design-system-contract.js` defines the entity card/demo contract.
- `/test/ui-lab` renders directly from that contract and `test-data/factories.js`.

## Token Policy

Use PrimeVue semantic variables for color and component state. Use CutKit `--ck-*` tokens for app layout, radius, and motion values that PrimeVue does not own.

Allowed local hardcoded visual values are limited to real data, such as pen stroke colors, DXF layer colors, or uploaded asset metadata. Page-local decorative colors, radii, animation durations, chat/dialog dimensions, swatch sizes, and max-widths must be promoted to tokens or removed.

## Component Contract

Entity cards support `variant="inline"`, `variant="compact"`, and `variant="card"`.

Shared ownership:

- `EntityCard` owns card chrome and is the only non-legacy direct owner of PrimeVue `Card`.
- `StandardDialog` owns dialog chrome and is the only direct owner of PrimeVue `Dialog`.
- `StandardPage` owns page shell width and spacing.
- `IdentityBlock`, `EntityStatus`, `StatusBadge`, `TraceChain`, `SpecsBlock`, and `DataBlock` own v24 block visualization.

Feature pages/components should compose these primitives with PrimeVue form/table controls and semantic layout classes. They should not import `primevue/card`, `primevue/dialog`, or `useBlocks` directly.

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

## Cleanup Policy

Legacy files are deleted only after import/routing scans prove they are unused. One-off diagnostics pages may exist outside the design-system manifest, but they must still use shared wrappers and token rules when they are routed.

## Verification

Run the focused contract check after changing tokens, wrappers, manifest, or factories:

```bash
npx vitest run shared/design-system.spec.js
```
