# COMPONENT: Entity UI Components

Manifest-backed Vue cards and detail surfaces for Perigram domain entities.

## Scope

Each subdirectory owns one entity surface or a closely related display surface.
Most cards are registered through the design-system manifest in
`packages/facade/src/ui.js` and bound to Vue components in
`utils/design-system.js`.
`EntityRevision` is a read-only system entity surface used by provenance rows
such as cassette template geometry versions and cassette design source
revisions.
`Library` is the material-scoped cassette-template container surface; it shows
material data and cassette child counts from the domain field groups.

## Card Contract

- Every entity card renders a single `InstanceCard :variant="variant"` and leaves
  identity, trace, status, popover, and footer chrome to the shared primitive.
  See [components/shared/README.md](../shared/README.md) for the default-slot
  body contract.
- Standard facts must resolve from the domain display constructor in
  `@perigram/facade` field groups. Do not add new local `DataBlock` path arrays
  to entity cards; add or extend a field group and make sure the path is covered
  by field access policy.
- The default slot is the canonical operational body and is reused by card
  variants and inline/compact popovers.
- Card bodies should represent the entity's contract data, not a generic table:
  production entities emphasize flow and generated outputs, material entities
  emphasize physical specs and stock, catalog entities emphasize options and
  visual samples, and system entities emphasize ownership/contact/file context.
- Use `DataBlock`, `GeometryPreview`, `InstanceInlineRef`, and
  PrimeVue `Tag`/`Badge` controls for concise facts. Use `TraceLink` only where
  direct route navigation is intended, not for entity relation summaries. Do not
  render raw nested objects or rebuild identity/status rows locally.
- Entity facts are access-aware. `DataBlock` requires an
  `type-id` prop and filter paths through `shared/instance-field-access.js`
  using the field policies exported by `@perigram/facade`. If a field is not
  declared in the policy, cards must not display it.
- Relation refs should pass design-system UI keys (`materialPile`,
  `nestingRun`, `cassetteDesign`, `entityRevision`) instead of backend
  snake-case names. The shared domain UI adapter still accepts backend aliases
  for compatibility, but component code should speak in surface keys.
- Inline and compact variants may add `compact-content` or `inline-extra` only
  for short, stable cues; the full body remains the authoritative summary.
- Subtitle chips are collapsed-context cues only. If an entity card declares a
  `#subtitle` slot for field values, it must guard it with
  `v-if="variant !== 'card'"` so full cards do not repeat `DataBlock`,
  DataBlock, relation, or summary body facts in the header.

## Validation

After changing card fields, factories, or manifest-backed components, run:

```bash
npx vitest run shared/design-system.spec.js
npx vitest run shared/localization.spec.js
npm run framework:write-manifest
npm run framework:manifest
```

Do not run Nuxt dev servers or `npm run build` from agent tasks unless a human
explicitly asks.

## Related

- [Shared UI components](../shared/README.md)
- [Design system](../../docs/DESIGN_SYSTEM.md)
- [DTO factories](../../test-data/README.md)
- [Domain UI contract](../../packages/facade/README.md)
