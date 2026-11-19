```yaml
doc_id: COMPONENTS-SPEC-001
classification: reference
status: active
owner: product-owner
created: 2026-10-24
updated: 2026-11-19
```

# SPEC: Components

The Vue surface tree of the app: shared primitives, registry-bound entity
cards, the generative screen engine and its compiled surfaces, the
process/type designers, calls, media, and directory. The parent
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

Every compiled screen — generator templates and the home overload —
renders through the ui-mapping generator ([ui-mapping/README.md](./ui-mapping/README.md)
for materializations, [shared/ui-mapping/README.md](../shared/ui-mapping/README.md)
for the mapping contracts). [generated/README.md](./generated/README.md)
owns the compiled-surface tree: the `[screenKey]` screens route, the home
workspace, and the `/organization/*` system screens (fixed components on
their own routes; the overload registry carries only `home`).

### Entity surfaces

[entities/README.md](./entities/README.md) is the one folded home of the
entity-card family: a surface table (surface key → DTO contract → live
consumers) plus each card's real invariants. Cards are registry-bound
surfaces; adding an entity type registers a card and a contract entry.

## Design-system consistency plan

The design system already has a coherent foundation: semantic token
projections, Aura-owned generic chrome, registered shared primitives,
entity surface contracts, a UI lab, and static visual-drift checks.
The next step is to make semantic composition and behavior as consistent
and enforceable as visual styling. This is an implementation plan, not
authorization to replace PrimeVue, rewrite the component tree, or add a
second component framework.

### Target component layers

1. **Foundations** — semantic tokens, typography roles, color, density,
   spacing, sizing, themes. Owned by `assets/tokens/`.
2. **Framework primitives** — raw PrimeVue/Aura components and their
   approved shared wrappers. PrimeVue owns generic component chrome.
3. **Shared semantic components** — registered components such as
   `InstanceCard`, `FactRows`, `StandardDialog`, and state primitives.
   They own reusable application semantics and behavior.
4. **Composition recipes** — documented slot contracts for recurring
   structures such as identity, metadata, facts, headers, forms, collections,
   and actions. Implement recipes with existing Vue components and slots;
   do not introduce a new runtime or universal prop-heavy component.
5. **Feature surfaces** — pages, workspaces, and entity-specific components.
   They own domain data and genuinely domain-specific composition, not
   generic chrome or independent visual conventions.

A component or rule has one authoritative owner. Registries may project
that contract for discovery and rendering, but must not duplicate its
meaning in parallel vocabularies.

### Implementation phases

#### Phase 1 — Repair existing contract violations (P0)

- Define the supported slots and their rendering semantics for each
  `InstanceCard` variant (`inline`, `compact`, `card`). Either preserve
  a slot consistently or explicitly mark it unsupported; do not silently
  drop supplied content. Check current consumers, including UserCard and
  OrganizationCard, and migrate them to the declared contract.
- Make `FactRows` render values according to semantic field/display roles.
  Ordinary text, supporting values, technical identifiers and measured
  values must not all inherit `text-technical`. Resolve the role from the
  existing field/display contract where possible; do not infer semantics
  from ad hoc component-local path lists.
- Remove untranslated English defaults from shared primitives.
  Generic labels such as dialog cancel/save must resolve through i18n or
  be required localized inputs. Locale-sensitive date formatting must use
  the application's active locale.
- Add focused regression tests for each repaired behavior.

**Exit criteria:** every supplied slot has an explicit per-variant
contract; representative entity cards retain their contextual content in
all supported variants; fact values use semantic typography; shared
controls expose no hardcoded user-facing English; locale formatting follows
the active application locale.

#### Phase 2 — Establish one component contract model (P1)

- Audit the relationship between
  `DESIGN_SYSTEM_VARIANTS`, `DESIGN_SYSTEM_PRIMITIVES`,
  `DESIGN_SYSTEM_ENTITY_CONTRACTS`, `DESIGN_SYSTEM_SURFACES`,
  `DESIGN_SYSTEM_SURFACE_CONTRACTS`, runtime display contracts, and
  component props/slots.
- For each vocabulary, document its owner, consumers, and whether it is
  authored input or derived projection. Remove duplicate vocabularies
  only where they express the same fact; keep distinct runtime and
  authoring concerns separate.
- Clarify the difference between component variants, host surface
  contexts, placement, and data-display modes. In particular, state
  whether `table`, `picker`, and `workspace` are component contracts,
  runtime contexts, or both through an explicit mapping.
- Make preview policy real and declarative per entity/surface, or remove
  the unused preview vocabulary from this contract and name its actual
  owner. A constant `previewFor() => 'none'` must not masquerade as a
  configurable policy.
- Keep `utils/design-system.js` as the single entity-card registry;
  do not add a second card map.

**Exit criteria:** every contract vocabulary has one documented owner;
every mapping between variants, surfaces and runtime display modes is
explicit; no dead or misleading contract field remains; registry tests
prove the single-card-registry law.

#### Phase 3 — Formalize composition recipes (P1)

- Identify recurring structures from existing components before creating
  abstractions: identity blocks, contextual metadata, fact groups,
  section headers, action areas, form rows, and collection headers.
- For each recipe, specify semantic purpose, slots, supported variants,
  ordering, empty-state behavior, density, typography roles, localization,
  and accessibility obligations.
- Implement recipes through existing shared primitives and Vue slot
  composition. Extract only patterns with multiple real consumers.
- Keep domain-specific content and actions in entity/feature components.
  Do not create a universal card or a large prop matrix to cover unrelated
  layouts.
- Update the relevant child README as the canonical home for each recipe
  family; keep the parent component inventory and UI law concise.

**Exit criteria:** repeated generic composition has one shared contract;
feature components compose it without duplicating generic markup or
chrome; domain-specific composition remains possible without exceptions
to the token and PrimeVue laws.

#### Phase 4 — Extend enforcement from visual to behavioral contracts (P1)

- Retain and extend `scripts/ui-visual-inventory.js` and
  `shared/design-system.spec.js`; do not replace the existing visual
  guardrails.
- Add component contract tests for props, slots, variants, required
  inputs, and unsupported combinations.
- Add rendered variant/slot matrix tests for every registered entity card.
- Add behavioral and accessibility tests: keyboard activation, accessible
  names, focus visibility and restoration, disabled/loading behavior,
  and nested interactive-element correctness.
- Add theme and responsive coverage for canonical primitives and recipes.
- Test rendered output and interactions, not only source-code strings.
- Use the UI lab as the inspectable catalog of canonical examples and
  variants; examples must be generated from the same contract vocabulary
  they demonstrate.

**Exit criteria:** violations of visual, semantic, accessibility, or
behavioral contracts fail automated checks; the UI lab covers every
registered shared primitive and supported variant; no test relies solely
on source-text coincidence where rendered behavior is the contract.

#### Phase 5 — Repository-wide consistency audit (P2)

- Audit shared primitives, entity cards, ui-mapping materializations,
  generated surfaces, pages and layouts against the finalized contracts.
- Classify each finding as a shared-system defect, legitimate
  domain-specific behavior, or an explicit documented exception.
- Fix systemic causes before applying consumer-by-consumer patches.
- Remove obsolete local styling and compatibility branches after their
  consumers migrate.
- Update component READMEs and the design-system agent skill to describe
  the implemented contracts, not aspirational or stale behavior.

**Exit criteria:** all active UI surfaces comply or have a narrow,
documented exception with an owner; no broad allowlist hides recurring
drift; documentation, UI lab, tests and implementation describe the same
system.

### Enforcement laws

- Tokens are the only source of visual design values; semantic roles are
  selected by meaning, not by convenience or the primitive currently
  rendering the value.
- PrimeVue/Aura owns generic control and container internals. Shared
  wrappers own application semantics, not reimplemented generic chrome.
- Shared primitives must localize all user-facing text and provide
  consistent accessibility and interaction behavior.
- A declared component variant is a behavioral and composition contract,
  not merely a CSS switch.
- Slots are public APIs: supported content must render predictably;
  unsupported content must be explicit and detectable.
- Composition recipes are extracted from repeated real use, not invented
  speculatively. Feature components retain domain-specific data and logic.
- Every contract has one authoritative owner. Derived registries and UI
  lab manifests consume that owner rather than becoming parallel sources.
- Static visual checks and rendered behavioral tests are complementary;
  neither substitutes for the other.
- Exceptions are narrow, justified, and owned. No feature-level styling
  exemption may become a general escape hatch.

## Structure

| Folder | Owns |
|---|---|
| [shared/](./shared/README.md) | registered primitives (InstanceCard, DrawingCanvas, EntityPopup, chat surfaces, designer frame) |
| [chat/](./chat/README.md) | the chat column family: rail, thread, list, bubble, composer, search, thread state core |
| [entities/](./entities/README.md) | registry-bound entity cards, one folded README |
| [generated/](./generated/README.md) | compiled screen surfaces: screens route, home workspace, `/organization/*` system screens |
| [ui-mapping/](./ui-mapping/README.md) | generator materializations (33 SFCs), type-label seam |
| [process-designer/](./process-designer/README.md) | designer canvas surface (see its [SPEC](./process-designer/SPEC.md)) |
| `type-designer/` | declaration editor nodes for the designer |
| [calls/](./calls/README.md) | call surfaces over `stores/calls.js` |
| [media/](./media/README.md) | MediaDock over `stores/media.js` |
| [directory/](./directory/README.md) | DirectoryDetailSurface |

## Laws

- Root [SPEC.md](../SPEC.md) §4 and §22 own the UI and
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
