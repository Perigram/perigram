# CODE: Design Tokens

This directory is the frontend visual-token source for the current PrimeVue + Tailwind stack.

Parent: [assets](../README.md).

## Source Files

- `index.js` exports application semantic tokens plus bounded projections for
  PrimeVue, Tailwind, and Nuxt runtime CSS variables.
  Primary is contrast, not a color: it rides the zinc surface scale, so
  controls painted with it read as ink-on-surface (near-black on the light
  canvas, near-white on the dark one) like the monochrome primaries of the
  PrimeVue showcase pages. PrimeVue's focus rings and selection highlights
  keep their primary-driven defaults, so they render as neutral ink and zinc
  tints. Brand energy lives in the Perigram accent — the logo red `#ff0040`
  expanded into a full tonal ramp — reserved for text selection, the
  decision signal, and brand ink. The surface contract is flat: the gray page (`--p-surface-100`
  light, `--p-surface-950` dark) is the single canvas; structural
  containers — panes, tab strips, layouts, chats, call surfaces — paint
  no background over it, PrimeVue controls and overlays carry the lighter
  content surface, and `--ck-subtle-background` (one step off the canvas)
  provides in-surface contrast for bubbles, hover rows, and placeholders.
  `--ck-process-canvas-background` provides a dedicated graph-work surface.
  `typography.roles` is the complete application
  type contract: page title, section heading, body, label, supporting, metric,
  technical, and prose. The roles select IBM Plex Sans, Mono, or Serif and own
  their full treatment; Tailwind generates one `text-*` alias per role directly
  from this object. The ladder: the label and technical roles ride the 15px
  small tier with PrimeVue's small controls and tags (`formField.sm`,
  `tag.root`), body values render 16px in the light scheme's ink text color
  (`surface.800`), and muted stays `surface.500` for labels, supporting text,
  and placeholders — never data values (SPEC §4, owner direction 2026-10-27).
  Aura owns generic control and container typography,
  spacing, borders, radii, shadows, and interaction states.
- `index.js` also exports `primeFormFluidPT`, the global passthrough that
  mounts every form-field control (input, textarea, number, select,
  date, password, autocomplete, tree-select) with PrimeVue's fluid class:
  form fields fill their host instead of their native `size` attribute, so
  bare inputs in dialogs, inspector panes, and form grids never escape
  narrow hosts. Width utilities still override (unlayered Tailwind beats
  the `primevue` cascade layer), and buttons are excluded — fluid buttons
  stretch, and only a `Fluid` wrapper region opts actions into that.
- `index.js` also exports `primeTabsStripPT`, the global passthrough that
  gives every scrollable tab strip's viewport `scroll-padding-inline` equal
  to the nav-button width (`--p-tabs-nav-button-width`), so scrolled tabs
  land clear of the prev/next chevrons. Scroll-padding is layout-neutral:
  real padding would flip strips into scroll mode while tabs still fit.
- Nuxt emits the exported `cssVariableTokens` and `darkCssVariableTokens`
  directly. `assets/css/main.css` consumes those variables but must not
  duplicate their values or bridge PrimeVue `--p-*` variables.
- `assets/presets/re_l.js` extends Aura with the neutral (zinc) primary
  palette, the Perigram accent palette, and per-scheme primary colors
  resolved against the surface scale plus the zinc surface scale
  projection and a minimal component-token set:

  | Component | Deviation from Aura |
  |---|---|
  | Table / TreeTable / view headers, footers, footer cells, paginators (standalone or embedded) | render transparent — the hosting surface (page, panel, card) owns the background |
  | DataTable small body cells | `0.5rem 0.75rem` — the 15px tier keeps small-table rows breathing |
  | Header chrome | free of hover and sorted-column tint (the sort state is the icon) and of the bottom border |
  | Header slots (the generated search/sort strips) | theme side padding dropped — they align inside padded surfaces with a bottom rhythm |
  | Embedded paginators (table, tree-table, view — top and bottom) | separator borders dropped |
  | Cards | shadow dropped |
  | Tab strips | transparent |
  | Tree rows | explorer density — transparent, zero root padding, `0.75rem` indent, tight node padding, `1.5rem` toggle |
  | Panels and PanelMenu panels | no background; Panels drop the border too (PanelMenu keeps Aura's hairline; the workspace node's pane Panels restore it locally) |
  | Splitter gutters | invisible — draggable |

  Everything else keeps Aura defaults.
- Tailwind semantic aliases are consumed by `tailwind.config.js`, whose
  content globs include `shared/ui-mapping/*.js`: the UI mapping contract's
  LAYOUT vocabulary is complete class strings in that file, so Tailwind
  must scan it or every layout class it emits silently compiles to nothing.

## Rules

- Prefer PrimeVue semantic variables (`--p-*`) for generic component visuals.
- Generic radius and elevation aliases resolve directly to preset variables; this
  module does not define application radius or shadow values.
- Use `--ck-*` tokens only for application-owned semantic typography, reusable
  layout constraints, domain signals, and geometry/data visualization.
  Do not use them to recreate preset chrome or states.
- Dockview panel chrome maps its `--dv-*` variables from `--p-*` and `--ck-*`
  tokens in `assets/css/main.css`; the workspace dock is one themed surface
  family, not a second design system.
- Apply one semantic role to application text instead of composing font size,
  weight, line height, tracking, or family utilities. Only page titles scale
  responsively. Generic PrimeVue controls retain their inherited typography. A local font
  size is valid only when a documented runtime data value directly drives
  visualization geometry or information magnitude. Roles carry font-family:
  icon glyphs (`pi pi-*`, `ck-*`) shrink through font-size utilities alone.
- Component-specific dimensions such as support chat size, dialog widths, popover/menu minimum widths, preview height, table action column width, and form swatch size live here because they are reused UI decisions rather than page-local styling.
- Application tokens do not own a motion scale or component-specific spacing.
  Interaction behavior unavailable in PrimeVue stays local to its owning
  derived composition, while generic transitions and spacing resolve through
  preset variables. JavaScript motion must consume `useReducedMotion()` so it can
  remove spatial movement while preserving focus, labels, and control state.
- Use `status-*` aliases for feedback, `entity-*` aliases for shared
  entity-reference families, and `signal-*` aliases for semantic process-canvas
  roles. Use `bg-process-canvas` for graph work rather than borrowing a page or
  panel surface. Page-local hardcoded colors, radii, shadows,
  or transition durations require a real data value, such as a pen color or
  DXF layer color.
- Shared and domain primitives own semantic structure and behavior, not generic
  visual chrome. Feature components should compose `InstanceCard`,
  `StandardDialog`, `StandardPage`, PrimeVue `Panel`, and semantic layout
  classes while leaving generic visuals and interaction states to the preset.
- Visual values driven by domain, geometry, or process data require exact-file
  documentation and enforcement allowlisting. Integration sizing is a reusable
  layout constraint, while behavior unavailable in PrimeVue belongs in a
  registered primitive or derived semantic composition; neither may own generic
  chrome or states.
