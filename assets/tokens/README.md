# CODE: Design Tokens

This directory is the frontend visual-token source for the current PrimeVue + Tailwind stack.

## Source Files

- `index.js` exports token groups plus projections for PrimeVue and Tailwind.
  Its active palette uses near-white light chrome, dark ink chrome, and
  signal-orange intent accents; `--ck-process-canvas-background` provides a
  dedicated graph-work surface; JetBrains Mono is the compact application face.
  Controls use a 3px UI radius while containers use a 6px panel radius,
  keeping dense operational screens precise instead of soft.
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
- Motion is a semantic, opt-in interaction contract. `designTokens.motion`
  provides fast/normal/emphasis durations, standard/enter/exit easing curves,
  overlay entry geometry, and the JavaScript seconds scale required by
  `motion-v`; CSS exposes the matching `--ck-motion-*` and `--ck-ease-*`
  values. Spring settings live under `designTokens.motion.spring`, not inside
  a feature component.
- `assets/css/main.css` applies the shared interaction curve to PrimeVue
  controls and selection states, and rebinds connected overlays, dialogs,
  drawers, and toasts away from PrimeVue's fixed animation values. Those
  effects are bounded feedback only: no page-layout animation, lift, or
  decorative bounce belongs in a feature component.
- `designTokens.dock` owns only shared compact dock geometry: pointer distance,
  scale, spacing, label, and indicator metrics. `components/shared/MotionDock.vue`
  consumes those defaults plus `motion.spring.dock` for the Vue Bits-derived
  proximity interaction; its colors, borders, and focus state still resolve
  through PrimeVue variables.
- CSS shortens all design-system durations for `prefers-reduced-motion`, and
  JavaScript motion primitives must consume `useReducedMotion()` so they can
  remove spatial movement while preserving focus, labels, and control state.
- Use `status-*` aliases for feedback, `entity-*` aliases for shared
  entity-reference families, and `signal-*` aliases for semantic process-canvas
  roles. Use `bg-process-canvas` for graph work rather than borrowing a page or
  panel surface. Do not introduce page-local hardcoded colors, radii, shadows,
  or transition durations unless the value is real data, such as a pen color or
  DXF layer color.
- Cards and panels are structural, non-elevated surfaces. Their hover feedback
  must be an in-place border or color state because shared roots clip media;
  use the overlay shadow token only for floating UI.
- Shared wrappers own visual chrome. Feature components should compose `EntityCard`, `StandardDialog`, `StandardPage`, `Panel`, and semantic layout classes.
