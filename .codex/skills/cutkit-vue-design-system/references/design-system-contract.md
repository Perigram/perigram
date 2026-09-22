# CutKit Vue Design-System Contract

This reference summarizes the current CutKit Vue component system in this
repository.

## Source Files

| Concern | Files |
|---|---|
| System docs | `README.md`, `components/README.md`, `components/shared/README.md`, `docs/DESIGN_SYSTEM.md` |
| Shared primitives | `components/shared/**` |
| Entity cards/details | `components/entities/**` |
| Design contract | `utils/design-system-contract.js`, `utils/design-system.js` |
| DTO factories | `test-data/factories.js` |
| Tokens | `assets/tokens/index.js`, `assets/presets/re_l.js`, `assets/css/main.css`, `tailwind.config.js` |
| Frontend adapter | `packages/vue/src/index.js` |

## Visual Language

- Operational CNC/manufacturing UI, not marketing chrome.
- PrimeVue 4 unstyled components provide UI controls.
- Tailwind utilities provide layout, spacing, alignment, and responsive grids.
- Current theme: zinc-neutral surfaces, teal primary actions, visible focus
  rings, compact 8-10px radii, subtle card elevation.
- Avoid decorative gradients, page-local theme colors, ornamental backgrounds,
  arbitrary shadows, arbitrary radii, and one-off transition durations.

## Token Layers

`assets/tokens/index.js` is the app token source.

- `designTokens.color`: maps to PrimeVue semantic variables and `--ck-*` app
  surfaces.
- `designTokens.layout`: app max width, grid gaps, dialog widths, support chat
  dimensions, popover/menu widths, swatches, preview height, table action column
  width.
- `designTokens.radius`: `ui` = `0.5rem`, `panel` = `0.625rem`, `full` =
  `9999px`.
- `designTokens.shadow`: `card`, `cardHover`, `overlay`.
- `designTokens.motion`: `fast` = `120ms`, `normal` = `200ms`.
- `cssVariableTokens`: emits runtime `--ck-*` variables.
- `tailwindThemeExtension`: exposes aliases such as `bg-page`, `bg-chrome`,
  `bg-subtle`, `rounded-ui`, `rounded-panel`, `shadow-card`,
  `shadow-card-hover`, `shadow-overlay`, `max-w-app`.
- `primeSemanticTokens`: teal primary palette, zinc surfaces, focus rings,
  content/form/overlay radii.
- `primeComponentTokens`: overrides DataView, Dialog, Panel, Card, Button, Tag,
  Chip, and DataTable.

Use direct CSS-variable utilities such as `bg-[var(--ck-page-background)]` or
`[box-shadow:var(--ck-shadow-card)]` when Nuxt HMR must reflect token changes
without restarting Tailwind.

## Shared Primitives

| Primitive | Purpose |
|---|---|
| `InstanceCard` | Standard entity card chrome with identity, optional trace, optional status, body, footer, and inline popover. |
| `InstancePage` | Standard detail-page shell with trace, identity, status, info, actions, main body, and sidebar. |
| `IdentityBlock` | Canonical identity rendering. Fallback: `name` -> `slug` -> `uid` -> `Unnamed`. |
| `DataBlock` | Label/value rows for entity-specific DTO fields using `{ path, i18n, suffix?, prefix? }`. |
| `SpecsBlock` | Standard width, length, area, sheet thickness, and foil thickness display. |
| `StatusBadge` | Read-only status tag with shared status mapping. |
| `InstanceStatus` | Interactive status display, workflow-derived transition actions, current location, and compact history popover. |
| `StatusHistory` | Status audit timeline for lifecycle events. |
| `StatusLocation` | Typed current lifecycle location from `status.lifecycle.data.location`. |
| `TraceLink` | Icon-aware link to a related entity. |
| `TraceChain` | Canonical lineage breadcrumb chain using `:entity`, not raw ancestry arrays. |
| `ActionToolbar` | Responsive title/subtitle/action row for pages, sections, tab panels. |
| `ResponsiveGrid` | Token-backed repeated-card grid; variants: `cards`, `dense`, `wide`. |
| `StateBlock` | Loading, empty, and error state block. |
| `TableFrame` | Standard frame around PrimeVue `DataTable`. |
| `StandardDialog` | Standard modal shell and footer. |
| `StandardPage` | Standard page shell with header and breadcrumbs. |

## Entity Policies

Entity cards support `variant="card"`, `variant="compact"`, and
`variant="inline"`.

`utils/design-system-contract.js` defines:

- `DESIGN_SYSTEM_VARIANTS`: `card`, `compact`, `inline`
- `DESIGN_SYSTEM_GROUPS`: `production`, `material`, `master`, `system`
- `DESIGN_SYSTEM_PRIMITIVES`: shared primitive registry
- `DESIGN_SYSTEM_ENTITY_CONTRACTS`: entity key, API entity type, group, i18n
  label key, component prop name, DTO factory, status policy, trace policy, docs
  links
- `validateDesignSystemContracts()`: basic contract validator

Status policies are `interactive`, `hidden`, or `readonly`. Trace policy is
boolean.

Status action objects and workflow transitions may use
`display: 'inline' | 'menu' | 'hidden'`. Self-loop metadata transitions are
hidden by default. Inline/card status contexts use the ellipsis menu by default
so title rows do not show multiple badge-like controls; expanded/full status
contexts may show primary inline actions. Put destructive delete/remove commands
in menu actions and leave edit/configuration outside status.

## DTO Contract

Prefer canonical v24 DTO blocks:

- root `_id`
- `identity`
- `origin`
- `status`
- `lineage`
- `specs`
- `attachments`
- `data`
- `summary`

Avoid flat aliases such as `entity.name`, `entity.id`, `entity.type`, or
`entity.parameters` unless the current API response still emits them and the
code is explicitly defensive.

Mutable current location belongs in `status.lifecycle.data.location`, with typed
shapes:

- `{ type: 'warehouse', warehouseId, label? }`
- `{ type: 'coordinates', coordinates: { x, y, z } }` or `{ lat, lng }`
- `{ type: 'address', address }`

## Forbidden Or Restricted Patterns

- No direct `primevue/card` imports outside `InstanceCard` and legacy exceptions
  being removed.
- No direct `primevue/dialog` imports outside `StandardDialog`.
- No `useBlocks.js` imports in entity cards, detail pages, or feature
  components.
- No manual `$fetch` for standard CRUD/status; use `useEntity`.
- No direct rendering of `entity.identity.*` in templates when `IdentityBlock`
  fits.
- No manual status rows or transition buttons outside `InstanceStatus`.
- No custom title/status row in entity cards unless `InstanceCard` slots cannot
  express the case.
- No page-local hardcoded colors, radii, shadows, animation durations, max
  widths, chat/dialog dimensions, or swatch sizes.

## Allowed Direct Fetch Cases

Direct `$fetch` is reserved for non-standard workflows:

- Uploads/downloads
- Invitations
- Permissions
- Support chat
- Payments
- Debug endpoints
- Project-scoped subresources

## Verification

Run the focused design-system checks listed in [SKILL.md](../SKILL.md).

Run architecture checks for backend tasks, but do not run Nuxt dev servers or
`npm build` unless the user explicitly asks.
