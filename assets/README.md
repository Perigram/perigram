# COMPONENT: Frontend Assets

This directory contains global frontend assets used by Nuxt.

## Design Tokens And Theme

- `tokens/index.js` is the app-level visual-token source, including the
  hard-neutral near-white light chrome and dark ink surface scale,
  signal-orange primary scale, JetBrains Mono interface typography, 3px/6px
  control/container geometry, flat structural surfaces with overlay-only
  elevation, semantic status/entity/process-signal roles, and PrimeVue state
  overrides.
- `presets/re_l.js` defines the PrimeVue preset by extending Aura and consuming token projections.
- `css/main.css` declares runtime `--ck-*` variables, bridges the active
  PrimeVue `--p-*` surface/action variables for hot reload, and provides layout
  helpers such as `grid-hub` and `grid-details`.
- `css/fonts.css` and SCSS files provide global font and legacy preprocessor support.

## Rules

- Keep global CSS limited to token variables, layout helpers, and unavoidable PrimeVue global overrides.
- Put reusable visual values in `tokens/index.js`; do not duplicate page max-widths, fonts, radii, shadows, or motion values in Vue files.
- Colors should come from PrimeVue semantic `--p-*` variables unless the value represents user/data content.
- Keep the visual hierarchy operational: light mode uses near-white chrome and
  dark mode uses the ink rail, while signal orange is reserved for interactive
  state, selection, and intentional emphasis. Structural cards and panels are
  border-defined rather than elevated; reserve shadow for overlays. Use
  `status-*` for feedback, `entity-*` for shared entity-reference families, and
  `signal-*` for process-canvas roles rather than raw Tailwind color utilities.
- The document root is intentionally `14px` so rem-based controls remain
  compact in dense engineering workspaces. Do not counteract it with page-local
  root or body font-size overrides.

## Related

- [Design system](../docs/DESIGN_SYSTEM.md)
- [Components guide](../components/README.md)
