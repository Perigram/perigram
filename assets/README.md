# COMPONENT: Frontend Assets

This directory contains global frontend assets used by Nuxt.

## Design Tokens And Theme

- `tokens/index.js` is the app-level visual-token source, including the
  graphite/slate surface scale, cyan primary scale, control/container geometry,
  elevation, and PrimeVue state overrides.
- `presets/re_l.js` defines the PrimeVue preset by extending Aura and consuming token projections.
- `css/main.css` declares runtime `--ck-*` variables and layout helpers such as `grid-hub` and `grid-details`.
- `css/fonts.css` and SCSS files provide global font and legacy preprocessor support.

## Rules

- Keep global CSS limited to token variables, layout helpers, and unavoidable PrimeVue global overrides.
- Put reusable visual values in `tokens/index.js`; do not duplicate page max-widths, radii, or motion values in Vue files.
- Colors should come from PrimeVue semantic `--p-*` variables unless the value represents user/data content.
- Keep the visual hierarchy operational: surfaces and borders establish
  structure, while the cyan primary scale is reserved for interactive state,
  selection, and intentional emphasis in both light and dark modes.

## Related

- [Design system](../docs/DESIGN_SYSTEM.md)
- [Components guide](../components/README.md)
