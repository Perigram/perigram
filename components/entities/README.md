# COMPONENT: Entity UI Components

Manifest-backed Vue cards and detail surfaces for CutKit domain entities.

## Scope

Each subdirectory owns one entity surface or a closely related display surface.
Most cards are registered through the design-system manifest in
`packages/domain-cnc/src/ui.js` and bound to Vue components in
`utils/design-system.js`.

## Card Contract

- Every entity card renders a single `EntityCard :variant="variant"` and leaves
  identity, trace, status, popover, and footer chrome to the shared primitive.
- The default slot is the canonical operational body and is reused by card
  variants and inline/compact popovers.
- Card bodies should represent the entity's contract data, not a generic table:
  production entities emphasize flow and generated outputs, material entities
  emphasize physical specs and stock, catalog entities emphasize options and
  visual samples, and system entities emphasize ownership/contact/file context.
- Use `SpecsBlock`, `DataBlock`, `GeometryPreview`, `TraceLink`, and PrimeVue
  `Tag`/`Badge` controls for concise facts. Do not render raw nested objects or
  rebuild identity/status rows locally.
- Inline and compact variants may add `compact-content` or `inline-extra` only
  for short, stable cues; the full body remains the authoritative summary.

## Validation

After changing card fields, factories, or manifest-backed components, run:

```bash
npx vitest run shared/design-system.spec.js
npm run framework:write-manifest
npm run framework:manifest
```

Do not run Nuxt dev servers or `npm run build` from agent tasks unless a human
explicitly asks.

## Related

- [Shared UI components](../shared/README.md)
- [Design system](../../docs/DESIGN_SYSTEM.md)
- [DTO factories](../../test-data/README.md)
- [Domain UI contract](../../packages/domain-cnc/README.md)
