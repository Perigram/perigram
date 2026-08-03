# CODE: Design Tokens

This directory is the frontend visual-token source for the current PrimeVue + Tailwind stack.

## Source Files

- `index.js` exports token groups plus projections for PrimeVue and Tailwind.
  Its active palette uses field-notebook surfaces and signal-orange intent
  accents; JetBrains Mono is the compact application face. Controls use a 6px
  UI radius while containers use a 12px
  panel radius so dense operational screens retain hierarchy.
- Runtime CSS variables are declared in `assets/css/main.css` using the same
  `--ck-*` names. That file also bridges the active PrimeVue `--p-*` variables
  so hot-reloaded pages and fresh preset initialization use the same theme.
- PrimeVue component token overrides are consumed by `assets/presets/re_l.js`.
- Tailwind semantic aliases are consumed by `tailwind.config.js`.

## Rules

- Prefer PrimeVue semantic variables (`--p-*`) for colors.
- Use `--ck-*` tokens for app layout, typography, surface roles, radius,
  elevation, and motion values not owned by PrimeVue. `assets/css/main.css`
  mirrors every runtime token exported by `cssVariableTokens`.
- Maintain distinct light and dark component-state tokens where a shared
  primitive has a surface (especially forms, tables, menus, dialogs, and
  drawers). Do not use a fixed light surface token as a cross-theme override.
- Component-specific dimensions such as support chat size, dialog widths, popover/menu minimum widths, preview height, table action column width, and form swatch size live here because they are reused UI decisions rather than page-local styling.
- Use `status-*` aliases for feedback and `signal-*` aliases for semantic
  process-canvas roles. Do not introduce page-local hardcoded colors, radii,
  shadows, or transition durations unless the value is real data, such as a pen
  color or DXF layer color.
- Shared wrappers own visual chrome. Feature components should compose `EntityCard`, `StandardDialog`, `StandardPage`, `Panel`, and semantic layout classes.
