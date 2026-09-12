# CODE: Design Tokens

This directory is the frontend visual-token source for the current PrimeVue + Tailwind stack.

## Source Files

- `index.js` exports application semantic tokens plus bounded projections for
  PrimeVue, Tailwind, and Nuxt runtime CSS variables.
  Its active palette uses near-white light chrome, dark ink chrome, and
  signal-orange intent accents; `--ck-process-canvas-background` provides a
  dedicated graph-work surface. `typography.roles` is the complete application
  type contract: page title, section heading, body, label, supporting, metric,
  technical, and prose. The roles select IBM Plex Sans, Mono, or Serif and own
  their full treatment; Tailwind generates one `text-*` alias per role directly
  from this object.
  Aura, not this module, owns generic control and container typography,
  spacing, borders, radii, shadows, chrome, and interaction states.
- Nuxt emits the exported `cssVariableTokens` and `darkCssVariableTokens`
  directly. `assets/css/main.css` consumes those variables but must not
  duplicate their values or bridge PrimeVue `--p-*` variables.
- `assets/presets/re_l.js` extends Aura with the bounded primary palette
  projection only. The component-token projection remains empty.
- Tailwind semantic aliases are consumed by `tailwind.config.js`.

## Rules

- Prefer PrimeVue semantic variables (`--p-*`) for generic component visuals.
- Generic radius and elevation aliases resolve directly to Aura variables; this
  module does not define application radius or shadow values.
- Use `--ck-*` tokens only for application-owned semantic typography, reusable
  layout constraints, domain signals, and geometry/data visualization.
  Do not use them to recreate Aura chrome or states.
- Apply one semantic role to application text instead of composing font size,
  weight, line height, tracking, or family utilities. Only page titles scale
  responsively. Generic PrimeVue controls retain Aura typography. A local font
  size is valid only when a documented runtime data value directly drives
  visualization geometry or information magnitude.
- Component-specific dimensions such as support chat size, dialog widths, popover/menu minimum widths, preview height, table action column width, and form swatch size live here because they are reused UI decisions rather than page-local styling.
- Application tokens do not own a motion scale or component-specific spacing.
  Interaction behavior unavailable in PrimeVue stays local to its owning
  derived composition, while generic transitions and spacing resolve through
  Aura variables. JavaScript motion must consume `useReducedMotion()` so it can
  remove spatial movement while preserving focus, labels, and control state.
- Use `status-*` aliases for feedback, `entity-*` aliases for shared
  entity-reference families, and `signal-*` aliases for semantic process-canvas
  roles. Use `bg-process-canvas` for graph work rather than borrowing a page or
  panel surface. Do not introduce page-local hardcoded colors, radii, shadows,
  or transition durations unless the value is real data, such as a pen color or
  DXF layer color.
- Shared and domain primitives own semantic structure and behavior, not generic
  visual chrome. Feature components should compose `EntityCard`,
  `StandardDialog`, `StandardPage`, PrimeVue `Panel`, and semantic layout
  classes while leaving generic visuals and interaction states to Aura.
- Visual values driven by domain, geometry, or process data require exact-file
  documentation and enforcement allowlisting. Integration sizing is a reusable
  layout constraint, while behavior unavailable in PrimeVue belongs in a
  registered primitive or derived semantic composition; neither may own generic
  chrome or states.
