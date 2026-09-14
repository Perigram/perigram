# COMPONENT: Frontend Assets

## Design Tokens And Theme

- `tokens/index.js` is the app-level source for semantic typography, reusable
  layout constraints, domain signals, geometry/data visualization, motion, and
  the primary brand palette.
- `presets/re_l.js` extends Aura with the primary palette projection only.
- `css/main.css` provides global app-shell, integration, and layout rules. It
  must not define PrimeVue variables or target PrimeVue component selectors.
- `css/fonts.css` and SCSS files provide global font and legacy preprocessor support.

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
- The authoritative visual ownership contract and complete repository inventory
  live in [the UI component audit](../docs/UI_COMPONENT_AUDIT.md).

## Related

- [Design system](../docs/DESIGN_SYSTEM.md)
- [Components guide](../components/README.md)
