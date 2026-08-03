# COMPONENT: Frontend Assets

This directory contains global frontend assets used by Nuxt.

## Design Tokens And Theme

- `tokens/index.js` is the app-level visual-token source, including the
  field-notebook surface scale, signal-orange primary scale, JetBrains Mono
  interface typography, control/container geometry, elevation, semantic status and
  process-signal roles, and PrimeVue state overrides.
- `presets/re_l.js` defines the PrimeVue preset by extending Aura and consuming token projections.
- `css/main.css` declares runtime `--ck-*` variables, bridges the active
  PrimeVue `--p-*` surface/action variables for hot reload, and provides layout
  helpers such as `grid-hub` and `grid-details`.
- `css/fonts.css` and SCSS files provide global font and legacy preprocessor support.

## Rules

- Keep global CSS limited to token variables, layout helpers, and unavoidable PrimeVue global overrides.
- Put reusable visual values in `tokens/index.js`; do not duplicate page max-widths, fonts, radii, shadows, or motion values in Vue files.
- Colors should come from PrimeVue semantic `--p-*` variables unless the value represents user/data content.
- Keep the visual hierarchy operational: warm paper surfaces and crisp borders
  establish structure, while signal orange is reserved for interactive state,
  selection, and intentional emphasis in both light and dark modes. Use
  `status-*` for feedback and `signal-*` for process-canvas roles rather than
  raw Tailwind color utilities.
- The document root is intentionally `14px` so rem-based controls remain
  compact in dense engineering workspaces. Do not counteract it with page-local
  root or body font-size overrides.

## Related

- [Design system](../docs/DESIGN_SYSTEM.md)
- [Components guide](../components/README.md)
