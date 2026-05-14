# CODE: Test and Demo Pages

Internal visual verification pages for UI contracts and component variants.

## UI Lab

`ui-lab.vue` is the design-system demo. It renders entity cards and shared primitives from `utils/design-system.js`, not from a hand-maintained component list.

The page demonstrates:
- entity card variants: `card`, `compact`, `inline`
- shared primitives: `IdentityBlock`, `EntityStatus`, `StatusHistory`, `TraceChain`, `SpecsBlock`, `DataBlock`
- manifest health: missing component/factory/docs/DTO block issues

Demo data comes from `test-data/factories.js` and should match API DTO shape.

## Variant Showcase

`components/VariantShowcase.vue` is a compact matrix route for checking every manifest entity across all card variants in a table layout. It uses the same manifest and factories as UI lab.

## Related

- [components](../../components/README.md) - frontend component contract
- [utils](../../utils/README.md) - design-system manifest and status registry
- [test-data](../../test-data/README.md) - DTO factories
