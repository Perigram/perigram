```yaml
doc_id: COMPONENTS-SPEC-001
classification: reference
status: active
owner: product-owner
created: 2026-10-24
updated: 2026-10-24
```

# SPEC: Components

The Vue surface tree of the app: shared primitives, registry-bound entity
cards, the generative screen engine and its compiled surfaces, the
process/type designers, calls, media, directory, and artifacts. The parent
`components/README.md` is the inventory owner: it carries the UI law and
the component map (~150 lines); every contract section lives in the child
README that owns the concern. Consumers: `pages/`, `layouts/`, and every
feature surface.

## Contracts owned here

### UI law (parent README is the canonical home)

| Law | Statement |
|---|---|
| PrimeVue | Generic controls and containers are raw, unmodified PrimeVue (Aura preset, brand tokens from `assets/tokens/`). Feature code owns layout and data-driven styling. |
| Cascade | Styles emit in declared layers `tailwind-base, primevue, tailwind-utilities`; `assets/css/main.css` owns the statement and is the only `@tailwind` site. App CSS and utilities outrank PrimeVue identically in dev and production. |
| Primitives | Composite surfaces compose registered shared primitives ([shared/README.md](./shared/README.md) owns the avatar `:label` law); entity option lists may import PrimeVue selects directly. |
| Loading marks | Inline spinners are `ProgressSpinner` sized to the row; menus render them through the `itemicon` slot. |
| Motion | Contextual, inside the owning composition; GSAP patterns from `composables/useMotion.js`; preset durations; `useReducedMotion()`. |
| Layout | Tailwind utilities for flex/grid/spacing/alignment. |
| Text chrome | Minimal: controls, placement, icons, typed data labels carry the interface. |
| Technical IDs | Raw IDs stay internal; timestamps render locale-formatted. |
| Localization | All user-facing strings through i18n. |
| Sizing | Rem basis shared with PrimeVue; mobile scales through root font-size. |

### Component inventory (parent README owns)

- Top-level loose SFCs (`AuthProgress`, `ChatSupport`, `Footer`,
  `LanguageSwitcher`, `PermissionEditor`, `PermissionRuleBuilder`,
  `ThemeSwitcher`, `UserForm`) are inventoried in the parent README.
- Every child folder is registered in the parent's map with a one-line
  owns-statement linking its README.

### Single card/surface registry

`utils/design-system.js` builds the one entity-surface registry:
`DESIGN_SYSTEM_ENTITIES` binds each `DESIGN_SYSTEM_ENTITY_CONTRACTS` entry
(vocabulary source: `utils/design-system-contract.js` — key, wire `typeId`,
`labelKey`, field groups, surfaces, factory) to its card component. Every
card consumer — `InstanceInlineRef`, `DrawingCanvas`, ui-mapping, the UI
lab — resolves cards through this registry. A second hand-maintained
card-component map is a defect. `ENTITY_CONTRACT_BY_TYPE` keys entries by
both wire `typeId` and surface `key`: both are live vocabularies.

### One generative engine

Every compiled screen — lists, details, home, system screens — renders
through the ui-mapping generator ([ui-mapping/README.md](./ui-mapping/README.md)
for materializations, [shared/ui-mapping/README.md](../shared/ui-mapping/README.md)
for the mapping contracts). [generated/README.md](./generated/README.md)
owns the compiled-surface tree: the `[screenKey]` screens route, the home
workspace, and the `/organization/*` overloads.

### Entity surfaces

[entities/README.md](./entities/README.md) is the one folded home of the
entity-card family: a surface table (surface key → DTO contract → live
consumers) plus each card's real invariants. Cards are registry-bound
surfaces; adding an entity type registers a card and a contract entry.

## Structure

| Folder | Owns |
|---|---|
| [shared/](./shared/README.md) | registered primitives (InstanceCard, DrawingCanvas, EntityPopup, chat surfaces, designer frame) |
| [entities/](./entities/README.md) | registry-bound entity cards, one folded README |
| [generated/](./generated/README.md) | compiled screen surfaces: screens route, home workspace, organization overloads |
| [ui-mapping/](./ui-mapping/README.md) | generator materializations (33 SFCs), type-label seam |
| [process-designer/](./process-designer/README.md) | designer canvas surface (see its [SPEC](./process-designer/SPEC.md)) |
| `type-designer/` | declaration editor nodes for the designer |
| [calls/](./calls/README.md) | call surfaces over `stores/calls.js` |
| [media/](./media/README.md) | MediaDock over `stores/media.js` |
| [directory/](./directory/README.md) | DirectoryDetailSurface |
| [artifacts/](./artifacts/README.md) | ArtifactViewer (CTS payload mounts) |

## Laws

- Root [SPEC.md](../SPEC.md) §UI and §Generative UI own the UI and
  generative-engine law this tree implements.
- Message semantics are owned by
  [server/features/support/README.md](../server/features/support/README.md);
  the frontend chat surfaces contract lives in
  [shared/README.md](./shared/README.md).
- Tokens and the surface ladder are owned by
  [assets/tokens/README.md](../assets/tokens/README.md).
- The mobile home-tab contract is owned by
  [composables/README.md](../composables/README.md).
- The cassette designer is plugin-owned:
  [workers/facade/README.md](../workers/facade/README.md).
- The designer authoring contract (palette membership, node/edge grammar)
  is owned by [packages/processes/README.md](../packages/processes/README.md).
- The runtime status model is owned by
  [server/core/machines/README.md](../server/core/machines/README.md).

## End state

Parent README ≈150 lines: style guide table, inventory, localization,
sizing, child links. One entities/README. Every child contract has one
home; every child links its parent.
