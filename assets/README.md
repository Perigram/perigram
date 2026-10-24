# COMPONENT: Frontend Assets

Parent: [root README](../README.md).

## Design Tokens And Theme

- `tokens/index.js` is the app-level source for semantic typography, reusable
  layout constraints, domain signals, geometry/data visualization, motion, and
  the primary brand palette.
- `presets/re_l.js` extends Aura with the semantic palettes and the
  component-token set exported by `tokens/index.js` (see
  [tokens/README.md](./tokens/README.md)).
- `css/main.css` provides global app-shell, integration, and layout rules. It
  must not define PrimeVue variables or target PrimeVue component selectors.
- `css/fonts.css` provides global font imports; `scss/` holds the
  font-face mixins and font-path variables.

## Rules

- Keep global CSS limited to global app-shell behavior, layout helpers, and
  documented integration behavior. PrimeVue/Aura owns generic component
  typography, spacing, chrome, and interaction states.
- Put reusable visual values in `tokens/index.js`; do not duplicate page max-widths, fonts, radii, shadows, or motion values in Vue files.
- Colors should come from PrimeVue semantic `--p-*` variables unless the value represents user/data content.
- Keep the visual hierarchy operational: light mode uses near-white chrome and
  dark mode uses the ink rail, while `bg-process-canvas` isolates graph work
  from surrounding page chrome. Signal orange is reserved for interactive
  state, selection, and intentional emphasis. Structural cards and panels are
  border-defined rather than elevated; reserve shadow for overlays. Use
  `status-*` for feedback, `entity-*` for shared entity-reference families, and
  `signal-*` for process-canvas roles rather than raw Tailwind color utilities.
- The visual ownership contract lives in
  [components/README.md](../components/README.md) §Style Guide and §Visual
  Tokens; `shared/design-system.spec.js` enforces it mechanically.

## Related

- [Visual tokens](./tokens/README.md)
- [Components guide](../components/README.md)
- [Animated brand mark](./rive/perigram-mark/README.md)
