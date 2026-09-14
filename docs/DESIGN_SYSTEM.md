# CutKit Design System

## Source Of Truth

CutKit uses PrimeVue 4, Tailwind utilities, and a small app token layer. The design system is code-driven:

- `assets/tokens/index.js` owns app semantic tokens and exports bounded PrimeVue/Tailwind projections.
- `assets/presets/re_l.js` extends Aura with the primary brand palette only.
- `tailwind.config.js` exposes semantic Tailwind aliases backed by PrimeVue `--p-*` and CutKit `--ck-*` variables.
- `assets/css/main.css` contains global app-shell, integration, and layout rules; it does not override PrimeVue selectors or variables.
- `packages/domain-cnc/src/index.js` defines the CNC entity card/demo contract
  without importing Vue.
- `utils/design-system-contract.js` re-exports that contract for existing UI
  lab callers and provides validation.
- `/test/ui-lab` renders directly from that contract and `test-data/factories.js`.

## Token Policy

PrimeVue/Aura owns generic controls, containers, typography defaults, spacing,
borders, radii, shadows, and interaction states. Use CutKit `--ck-*` tokens only
for semantic typography, reusable layout constraints, and data-driven domain,
geometry, or process visuals consumed by registered primitives or derived
semantic composition. The
authoritative ownership matrix and exception policy live in
[the UI component audit](./UI_COMPONENT_AUDIT.md).

Motion is behavior, not a second theme layer. Interaction-specific motion that
PrimeVue cannot provide stays inside its owning derived composition; generic
state transitions use Aura's duration. JavaScript motion must honor reduced
motion while preserving control state and keyboard behavior.

Typography uses eight complete token-backed roles: `page-title`,
`section-heading`, `body`, `label`, `supporting`, `metric`, `technical`, and
`prose`. `assets/tokens/index.js` defines each role's Plex family, size, line
height, weight, tracking, and numeric behavior once; `tailwind.config.js`
generates the corresponding `text-*` aliases. `page-title` is the only
responsive role. Generic controls retain Aura typography, while technical and
prose content opt in explicitly even when rendered through a form surface.
Element names never select an application role, so changing operational markup
between `p`, `blockquote`, headings, `pre`, or `code` cannot change its type.
`assets/css/fonts.css` only loads the families and establishes inheritance.
Raw size, weight, leading, tracking, mono, and serif utilities are prohibited
in Vue surfaces. The only local font-size exception is a documented runtime
data value that directly represents visualization geometry or information
magnitude; it cannot compact labels, controls, headings, or status text. Avoid gradients,
ornamental backgrounds, and page-local theme colors; promote durable semantic
decisions to `assets/tokens/index.js` without recreating Aura component chrome.

`status-*` aliases are for application feedback (`info`, `success`, `warning`,
`danger`, and `neutral`). `entity-*` aliases own the compact family tones used
by shared entity references. `signal-*` aliases are for process-canvas roles
such as `entity`, `data`, `structure`, `decision`, and `effect`; the name
describes the meaning, not a fixed hue. Do not use raw Tailwind palette
utilities for app chrome, entity-reference tones, or process handles. The
process canvas uses its own surface token; a source socket and its wire consume
the same semantic signal token, while node stripes retain their separate
operation-concern role. Drawing
and user data colors (for example DXF layers and pen strokes) remain literal
data and are intentionally exempt.

Do not add page or panel headers, descriptions, helper bubbles, notes, tips, or
empty-state prose unless the workflow would be ambiguous or blocked without
them. Prefer compact controls, clear placement, icons, typed labels, and
domain-specific data surfaces over explanatory text.

The production app shell, UI lab, shared primitives, and process canvas consume
the same projections. Nuxt emits `cssVariableTokens` and
`darkCssVariableTokens` directly; runtime CSS must not mirror token values,
define `--p-*` variables, target `.p-*` selectors, or use `!important`. Aura
remains the single owner of generic focus and control states. The design-system
suite enforces this boundary.

Allowed local hardcoded visual values are limited to real data, such as pen stroke colors, DXF layer colors, or uploaded asset metadata. Page-local decorative colors, radii, animation durations, chat/dialog dimensions, swatch sizes, and max-widths must be promoted to tokens or removed.

## Component Contract

Entity cards support `variant="inline"`, `variant="compact"`, and `variant="card"`.
Those variants are compatibility aliases for constructor surfaces. The domain
contract also declares `detail`, `table`, `picker`, and `workspace` surfaces for
framework consumers. A surface selects preview mode, field groups, data display
density, relation display, status/trace policy, and action placement.

Card content is part of the contract, not filler. The title area owns identity and status, the body uses `SpecsBlock`/`DataBlock` for concise operational facts, and the footer owns actions. Prefer canonical DTO paths (`data.*`, `identity.*`, `lineage.*`, `attachments.*`, `summary.*`) and use flat aliases only as compatibility fallbacks where current services still emit them.
Generated card surfaces may replace aggregate child-count facts when the card
already has relation-backed child previews to show. Prefer explicit
DTO-backed preview refs such as `summary.queuePreview`, `summary.runPreview`,
`summary.sheetPreview`, `summary.cassettePreview`, and `summary.colorPreview`
over sibling-screen inference. Use compact `EntityInlineRef` micro cards for
those child previews instead of rendering `N children` rows in the card body.
If no previewable child refs are loaded, keep the numeric count.
Standard field groups live in `@cutkit/domain-cnc`; Vue cards consume resolved
field descriptors through `utils/entity-display-contract.js`. Final apps may
layer additional field groups and surface overrides, but access policy still
controls whether a path can render.

`cassette`, `cassetteTemplate`, `cassetteDesign`, and `cassetteInstance` are
separate card contracts. `cassette` covers the base `cassettes` collection,
while template/design/instance cards cover their own production surfaces.

`material`, `materialPile`, and `batchPile` are intentionally different card
contracts. `material` covers the base material record, while `materialPile` and
`batchPile` are different UI surfaces over the same backend `material_pile`
entity type. `materialPile` is the general warehouse/manual stock surface;
`batchPile` is a requisition-sourced received pile surface and must expose batch
context such as `lineage.requisitionId`, receipt serial, specs, and stock.

`EntityStatus` owns lifecycle actions and current lifecycle context for entity
types with real `cncWorkflows` definitions. Non-workflow cards hide status
chrome by default instead of inventing local states. Workflow transitions may
declare `display: 'inline' | 'menu' | 'hidden'`; self-loop metadata transitions
are hidden by default, primary forward actions are inline only on expanded/full
status surfaces, and card/inline status surfaces use an ellipsis menu to avoid
multiple badge-like controls in title rows. The status popover includes overflow
actions, current `status.lifecycle.data.location`, status metadata, and compact
status history without section headings or empty placeholder copy. Last-update
timestamps are part of the status timeline; when persisted events are not
available, `StatusHistory` renders the entity's current `status`/`origin` as the
first event. Status rows wrap deliberately in tight cards, while badges keep
stable minimum width.
When the target state declares lifecycle evidence requirements, `EntityStatus`
opens a compact `StatusTransitionDialog` to collect the operator description
and proof attachments before submitting the transition. The dialog stays
schema-driven; relation snapshots are captured by the status API from declared
lifecycle snapshot sources instead of reading arbitrary page state.

Shared ownership:

- `EntityCard` owns semantic card structure and is the only non-legacy direct
  owner of PrimeVue `Card`; Aura owns the rendered card chrome and states.
- `EntitySelect` and `EntityMultiSelect` own PrimeVue Select/MultiSelect in app
  components. Canonical entity options use compact `EntityInlineRef` cards with
  previews. Selected entity refs render outside the PrimeVue value/chip area;
  the bound PrimeVue control stays present as a compact change trigger so
  overlay, keyboard, and selection behavior remain owned by PrimeVue. Non-entity
  options delegate without changing PrimeVue slots or behavior.
- Entity-specific cards pass custom lifecycle commands through `EntityCard` `statusActions`; they should not rebuild identity/status title rows just to customize status buttons.
- `StandardDialog` owns semantic dialog structure and is the only direct owner
  of PrimeVue `Dialog`; Aura owns the rendered dialog chrome and states.
- `StandardPage` owns page shell width and spacing.
- `ActionToolbar`, `ResponsiveGrid`, `StateBlock`, and `TableFrame` own repeated page-level layout patterns.
- `ResponsiveGrid`'s `bounded` variant uses the shared bounded-item min/max
  width tokens for operational cards that must not grow indefinitely; extra
  width creates additional tracks.
- `IdentityBlock`, `EntityStatus`, `StatusBadge`, `TraceChain`, `SpecsBlock`, and `DataBlock` own v24 block visualization.
- `StatusLocation` renders typed mutable location facts from `status.lifecycle.data.location` so cards do not hardcode warehouse ids or coordinate text as static fields.
- `DrawingCanvas` owns layer-aware SVG canvas rendering for DXF/SVG previews, cassette thumbnails, mapping previews, and cassette designer interactions. Sources must normalize into its `{ viewBox, layers }` contract and provide layer standard metadata explicitly; the shared canvas does not invent production layer codes.
- `GeometryPreview` wraps `DrawingCanvas` for token-backed DXF/layer/polygon previews from `data.geometry.preview` so design cards show geometry instead of file-name fields.
- `TypedSettingsForm` renders simple typed contract fields for admin operation
  parameters and lifecycle hook settings; do not use raw JSON editors for those
  contracts when a field descriptor exists.

Feature pages/components should compose these primitives with PrimeVue form/table controls and semantic layout classes. They should not import `primevue/card`, `primevue/dialog`, or `useBlocks` directly.

## DTO Contract

Demo data follows API DTO shape, not raw MongoDB documents.

Required v24 blocks:

- `identity`
- `origin`
- `status`
- `lineage`
- `attachments`
- `data`
- `summary`

Mutable current-state facts belong under `status.lifecycle`. Location is typed as `status.lifecycle.data.location`, with `warehouse`, `coordinates`, and `address` UI support. Use `lineage` for ancestry and `attachments` for files; do not duplicate those as decorative card body fields.

Hoisted aliases are allowed only when current model/service DTOs emit them.

`framework.manifest.json` snapshots the design-system contract for LLM/RAG/MCP consumers. It records entity card components, status policies, trace policies, `DataBlock` field paths, shared token projections, and validation results without requiring Vue component loading.

## Cleanup Policy

Legacy files are deleted only after import/routing scans prove they are unused. One-off diagnostics pages may exist outside the design-system manifest, but they must still use shared wrappers and token rules when they are routed.

## Verification

Run the focused contract check after changing tokens, wrappers, manifest, or factories:

```bash
npx vitest run shared/design-system.spec.js
```

For token syntax, import-check the token and preset modules:

```bash
node -e "import('./assets/presets/re_l.js').then(() => console.log('preset ok'))"
```

After changing entity card fields, factories, component contracts, or tokens, refresh and verify the framework manifest:

```bash
npm run framework:write-manifest
npm run framework:manifest
```
