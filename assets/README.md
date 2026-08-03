# COMPONENT: Frontend Assets

This directory contains global frontend assets used by Nuxt.

## Design Tokens And Theme

- `tokens/index.js` is the app-level visual-token source, including the
  warm-neutral workbench surface scale, cobalt primary scale, UI/technical
  typography, control/container geometry, elevation, semantic status and
  process-signal roles, and PrimeVue state overrides.
- `presets/re_l.js` defines the PrimeVue preset by extending Aura and consuming token projections.
- `css/main.css` declares runtime `--ck-*` variables and layout helpers such as `grid-hub` and `grid-details`.
- `css/fonts.css` and SCSS files provide global font and legacy preprocessor support.

## Rules

- Keep global CSS limited to token variables, layout helpers, and unavoidable PrimeVue global overrides.
- Put reusable visual values in `tokens/index.js`; do not duplicate page max-widths, fonts, radii, shadows, or motion values in Vue files.
- Colors should come from PrimeVue semantic `--p-*` variables unless the value represents user/data content.
- Keep the visual hierarchy operational: warm surfaces and hairline borders
  establish structure, while cobalt is reserved for interactive state,
  selection, and intentional emphasis in both light and dark modes. Use
  `status-*` for feedback and `signal-*` for process-canvas roles rather than
  raw Tailwind color utilities.
- The document root is intentionally `14px` so rem-based controls remain
  compact in dense engineering workspaces. Do not counteract it with page-local
  root or body font-size overrides.

## Related

- [Design system](../docs/DESIGN_SYSTEM.md)
- [Components guide](../components/README.md)
