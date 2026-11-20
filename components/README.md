# COMPONENT: Components

The app's Vue surface tree: shared primitives, registry-bound entity cards,
the generative screen engine and its compiled surfaces, the process/type
designers, calls, media, directory. This README owns the UI
law and the component inventory; every contract section lives in the child
README that owns the concern. Parent: [root README](../README.md).
Target law: [SPEC.md](./SPEC.md).

## Style Guide

| Law | Contract |
|---|---|
| PrimeVue | Generic controls and containers are raw PrimeVue on the Aura preset — brand palette, zinc surface scale, compact geometry from `assets/tokens/`. Feature code owns layout and data-driven styling; typography, padding, borders, radii, shadows, and interaction states stay on preset tokens. A surface PrimeVue or a registered primitive already owns is composed from it; when ownership is unclear, ask the PrimeVue MCP before authoring markup. |
| Cascade | Styles emit in declared layers `tailwind-base, primevue, tailwind-utilities`; `assets/css/main.css` owns the statement and is the only `@tailwind` site. App CSS and utilities outrank PrimeVue identically in dev and production; `!important` order patches are defects. |
| Primitives | Reusable domain surfaces, operational workspaces, designers, and recurring layouts compose the registered shared primitives and semantic aliases from `assets/tokens/`. The avatar `:label` law lives in [shared/README.md](./shared/README.md). |
| Loading marks | Inline spinners are `ProgressSpinner` sized to the row; menu items render them through the `itemicon` slot; full loading surfaces use `StateBlock`. |
| Motion | Motion is contextual behavior inside the owning derived composition: GSAP patterns from `composables/useMotion.js`, preset transition durations for generic states, `useReducedMotion()`. Static operational controls stay static. |
| Layout | Tailwind utilities for flex, grid, spacing, alignment. |
| Text chrome | Controls, placement, icons, and typed data labels carry the interface; page/panel headers, helper bubbles, and empty-state prose appear only when the workflow is otherwise ambiguous or blocked. |
| Technical IDs | Database ids, type ids, and actor ids stay internal — resolve them to display names or omit them. Timestamps render locale-formatted. |
| Variants | Components support `inline`, `compact`, and `card` variants. |
| Child entities | Full child entities render through the child's dedicated card; compact relation context inside another card or detail row uses `InstanceInlineRef`. |
| Permissions | Sub-components gate actions (edit, delete, view) on explicit permission grants. |
| Single-select lists | `Listbox` with single-line `#option` templates (content + trailing meta); per-row contextual detail (history, pickers, rename) opens a `Popover` anchored at the row's trigger; row menus trigger on right-click/long-press with `@click.stop` on triggers. |
| Data grids | `TableFrame` + `DataTable` with `#body` cells. |
| Text actions | Link-style text actions are `Button` with `link`/`text` variants. |

## Standard Patterns

All entity-related components use these patterns:

| Concern | Pattern |
|---|---|
| Identity display | `titleFor(dtoToScreenInstance(entity, typeRecord), typeRecord, { unnamedLabel: t('common.unnamed') })` — `dtoToScreenInstance` from `utils/instance-shape.js`, `titleFor` from `shared/ui-mapping`; the one title resolver |
| Status display + transitions/actions | `<InstanceState :instance="..." type-id="..." :actions="..." />` |
| Read-only status display | `<StateTag :value="stateValue" :policy="policyByType[typeId]" />` — policy map from `useStatePolicy()` |
| Drawing and geometry preview | `<DrawingCanvas ... />` for layer-aware DXF/SVG canvas work; `<GeometryPreview :source="..." />` over the resolved previewSource value |
| Structured key/value data (specs, parameters, tool dims) | `<FactRows :rows="instanceFactRows({ typeId, typeRecord, entity, auth, translator })" variant="compact|default" />` — the one derivation over the generated field vocabulary; `shared/instance-field-access.js` gates every row through the `auth` input |
| Lineage breadcrumb | `<TraceChain :entity="..." />` |
| Audit log | `<StateHistory :entity="..." type-id="..." />` |
| Detail/page header | The unified page header: the ui-mapping `SurfaceHeader` — instance pages, editor pages, and custom pages |
| CRUD + status operations | instances store (`stores/instances.js`); status transitions through `useStateController` |
| Entity/container structure | Entity cards: `<InstanceCard>`; non-entity sections: PrimeVue `<Panel>` or semantic layout; Aura owns generic chrome |
| Section/page action rows | `<ActionToolbar>` |
| Route-level aggregate facts | `<MetricPanel>` |
| Repeated card grids | `<ResponsiveGrid>` |
| Operational designers | `<DesignerWorkspace layout="lanes|canvas" workspace-id="...">` owns the dock layout and its persisted panel state; feature components own content state |
| Bounded scrolling workspace sections | `<ScrollablePanel>` |
| Loading/empty/error surfaces | `<StateBlock>` |
| Data table frame | `<TableFrame><DataTable ... /></TableFrame>` |
| Dialog container | `<StandardDialog>` |
| Single-field rename/edit | `<NameEditPopover>` |
| Typed admin settings | `<TypedSettingsForm :fields="..." v-model="..." />` |
| Entity dropdowns | `<InstanceSelect>` / `<InstanceMultiSelect>` — entity options render as one-line instance option rows; the single picker's closed control is a trigger with the selected instance as the instance tile beside it; option lists over a pool build through `instancePickerOptions` ([shared](./shared/README.md), SPEC §22.13) |
| Floating designer toolbar | PrimeVue `Toolbar` inside `DesignerWorkspace` (shared shell contract in [components/shared/README.md](./shared/README.md)) |

## Component Inventory

| Folder | Owns |
|---|---|
| [shared/](./shared/README.md) | Registered primitives: `InstanceCard`, `DrawingCanvas`, `EntityPopup`, chat surfaces, designer frame |
| [chat/](./chat/README.md) | The chat column family: inbox rail, thread header, message list and bubble, composer, search panel, the record comments side panel, the thread state core |
| [entities/](./entities/README.md) | Registry-bound entity cards — the folded surface table and card invariants |
| [generated/](./generated/README.md) | Compiled screen surfaces: the `[screenKey]` screens route, the home workspace, `/organization/*` system screens, action visibility, the file-surface/editor registry |
| [ui-mapping/](./ui-mapping/README.md) | Generator materializations and the type-label seam |
| [process-designer/](./process-designer/README.md) | The process designer canvas surface |
| [type-designer/](./type-designer/README.md) | Class declaration vocabulary: the DescriptorEditor, Field/State/TypeNode canvas cards, and the class dialog (SPEC §27) |
| [calls/](./calls/README.md) | Call surfaces over `stores/calls.js` |
| [media/](./media/README.md) | The MediaDock now-playing dock over `stores/media.js` |
| [directory/](./directory/README.md) | `DirectoryDetailSurface` — user/organization detail inside the home workspace |

Plugin-owned editor surfaces — the cassette designer and the sheet-design
editor — live in [workers/facade](../workers/facade/README.md) and mount
through the remote-surface contract.

Top-level SFCs:

| File | Purpose |
|---|---|
| `AuthProgress.vue` | Full-screen authenticating state (heading + spinner) |
| `ChatSupport.vue` | The chat column host shell: composes [components/chat](./chat/README.md) for every host — the popup dialog, the `/chats` route, entity panels, and the home tab |
| `Footer.vue` | App footer chrome |
| `LanguageSwitcher.vue` | Locale select |
| `PermissionEditor.vue` | The typed grant editor for the `shared/access-control.js` grant shape, covering direct permissions and Process Designer access: grants render as accordions in the selected access area, the level edits inline as `Allow <level> when <predicate>`, and predicates are nested boolean filter expressions (rows and nested groups, `all`/`any` gate, per-clause `not` toggle) built from real domain contracts — exact `id`, workflow `status` from the served type declarations' state trees, property paths from the entity field descriptors. Entity-id clauses use entity pickers; free text serves custom paths and transition names; authoring happens in the filter builder, and saved grants serialize only complete predicates. |
| `PermissionRuleBuilder.vue` | The nested rule-tree builder used by `PermissionEditor` |
| `ThemeSwitcher.vue` | Light/dark toggle |

## UI Inventory Policy

Component cleanup uses a route/registry inventory:

- **route-active** — reached from `pages/**` or `layouts/**`;
- **registry-active** — referenced by the design-system manifest, `utils/design-system.js`, `InstanceInlineRef`, or framework inspection scripts;
- **dormant** — unrouted but architecturally meaningful.

Dormant components are inspected and may be refactored; removal of legacy
components (old dashboard/footer widgets) is an explicit human cleanup
decision. Visual findings derive mechanically: run
`node scripts/ui-visual-inventory.js` after an intentional visual change;
`shared/design-system.spec.js` derives the same findings per Vue file,
validates scoped layout declarations, and rejects runtime PrimeVue
selectors, variable declarations, and `!important` rules in global runtime
CSS.

## Data Access

- Prefer canonical DTO blocks for entity data: `identity.*`, `status.*`, `lineage.*`, `attachments.*`, `data.*`, `summary.*`. Hoisted aliases serve as defensive fallbacks while a current API response still emits them.
- Mutable current location is a typed lifecycle fact (`status.lifecycle.data.location`: `warehouse`, `coordinates`, `address`) — [server/features/states/README.md](../server/features/states/README.md) owns the contract.
- Standard CRUD and status operations go through the instances store ([stores/README.md](../stores/README.md)); `$fetch` is reserved for workflows outside it — declared domain operations, uploads/downloads, invitations, permissions, support chat, organization billing, debug endpoints, and project-scoped subresources.
- PrimeVue `<Select>` with `optionLabel="name"` receives option arrays normalized through `utils/selectOptions.js` when the source is a canonical DTO.
- Check [framework.manifest.json](../framework.manifest.json) (entity definitions and data-model fields) before assuming a data structure.

## Localization

- User-visible labels, headings, dialog headers, toast summaries/details, placeholders, and accessible labels use `$t(...)` in templates or `t(...)` from `useI18n()` in script.
- Keep `i18n/locales/en.json` and `i18n/locales/ru.json` structurally aligned whenever adding keys.
- Run `npx vitest run shared/localization.spec.js` after adding frontend copy or translation keys; it catches locale key drift and missing static translation keys.
- Brand names such as `Perigram` remain literal.

## Sizing

PrimeVue Button, Tag, and Badge keep their own font-size: add `size="small"` to these elements inside compact and inline variant contexts.

## Canonical contract homes

- Tokens and the surface ladder: [assets/tokens/README.md](../assets/tokens/README.md)
- Table row-surface recipe: [components/ui-mapping/README.md](./ui-mapping/README.md)
- `InstanceCard` body/variant contract, the shared instance tree, chat surface components, `useBlocks` rule: [components/shared/README.md](./shared/README.md)
- Entity card family — registry, surface table, card invariants: [components/entities/README.md](./entities/README.md)
- Compiled screens and the home workspace: [components/generated/README.md](./generated/README.md)
- Mobile home tabs: [composables/README.md](../composables/README.md)
- Chat message semantics: [server/features/support/README.md](../server/features/support/README.md)
- Designer authoring contract (palette membership, node/edge grammar): [packages/processes/README.md](../packages/processes/README.md)
- Runtime status model: [server/core/machines/README.md](../server/core/machines/README.md)
- Entity data shapes: [framework.manifest.json](../framework.manifest.json)
