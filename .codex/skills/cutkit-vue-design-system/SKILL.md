---
name: cutkit-vue-design-system
description: Apply the CutKit Vue v24 design system when creating, reviewing, or changing CutKit/Nuxt Vue components, especially entity cards, detail pages, shared UI primitives, PrimeVue/Tailwind styling, design tokens, UI lab/demo contracts, frontend documentation, components, composables/useEntity.js, utils/design-system files, assets/tokens, assets/css, pages that render entity UI, or the @cutkit/vue frontend adapter.
---

# CutKit Vue Design System

Use this skill to keep CutKit Vue UI work aligned with the current v24
design-system contract: PrimeVue 4 controls, Tailwind layout utilities,
canonical DTO blocks, shared entity primitives, token-backed chrome, i18n
labels, and manifest-driven UI lab coverage.

## First Reads

Before changing UI code, read project docs in this order:

1. `AGENTS.md`
2. `README.md`
3. `components/README.md`
4. `components/shared/README.md`
5. `docs/DESIGN_SYSTEM.md`
6. The local component README for the area being changed, if present

For compact reference, load
`references/design-system-contract.md` from this skill when you need a checklist
of primitives, tokens, DTO paths, and validation commands.

## Working Rules

- Prefer the repo's shared primitives over local markup: `EntityCard`,
  `EntityPage`, `IdentityBlock`, `EntityStatus`, `StatusBadge`, `TraceChain`,
  `SpecsBlock`, `DataBlock`, `ActionToolbar`, `ResponsiveGrid`, `StateBlock`,
  `TableFrame`, `StandardDialog`, and `StandardPage`.
- Use PrimeVue controls for UI elements and Tailwind utilities only for layout,
  spacing, alignment, and responsive behavior.
- Keep feature components free of page-local visual styling. Promote reusable
  colors, radii, dimensions, shadows, and motion values to
  `assets/tokens/index.js` and project them through Tailwind aliases, PrimeVue
  tokens, or `--ck-*` variables.
- Treat entity UI as operational, not decorative: identity/status in the title
  area, concise DTO-backed facts in the body, and actions in the footer.
- Use canonical DTO blocks: root `_id` plus `identity`, `origin`, `status`,
  `lineage`, `specs`, `attachments`, `data`, and `summary`. Flat aliases are
  only compatibility fallbacks when current APIs still emit them.
- Use `status.lifecycle.data.location` for mutable current location. Supported
  UI shapes are `warehouse`, `coordinates`, and `address`; lineage remains
  ancestry, and attachments remain files.
- Localize all user-visible labels, headings, placeholders, dialog text, toast
  text, and accessible labels with `$t(...)` or `t(...)`; keep
  `i18n/locales/en.json` and `i18n/locales/ru.json` structurally aligned.
- Add `size="small"` to PrimeVue `Button`, `Tag`, and `Badge` inside compact or
  inline contexts.

## Entity Cards

Build entity-specific cards as thin wrappers around `EntityCard`.

```vue
<EntityCard :entity="entity" entity-type="queue" :variant="variant">
  <template #before-identity v-if="entity.data?.queueNumber">
    <small>#{{ entity.data.queueNumber }}</small>
  </template>

  <template v-if="variant === 'card'">
    <Divider />
    <DataBlock :entity="entity" :fields="FIELDS" />
  </template>

  <template #footer v-if="variant === 'card'">
    <div class="flex justify-end gap-2" @click.stop>
      <Button icon="pi pi-pencil" text rounded size="small" :aria-label="$t('common.edit')" />
    </div>
  </template>
</EntityCard>
```

Use `before-identity`, `subtitle`, default body, `compact-content`,
`inline-extra`, and `footer` slots. Avoid overriding `#title` unless there is no
other way, because `EntityCard` owns identity/status placement.

Pass custom lifecycle commands as `:status-actions` to `EntityCard`; do not
rebuild status controls in the parent.

Use `display: 'inline' | 'menu' | 'hidden'` on status actions. Inline/card
status contexts should show the status badge plus an ellipsis menu, not multiple
badge-like action pills. Expanded/full status contexts may show primary inline
actions. Put destructive delete/remove commands in the status menu; keep
edit/configuration commands in card footers or page action slots.

Use `:show-status="false"` or `:show-trace="false"` only when the design-system
manifest or existing component policy intentionally hides them for that entity.

## Detail Pages

Build entity detail components with `EntityPage`.

- Put header actions in the `actions` slot.
- Put summary metrics in the `info` slot.
- Put secondary panels in the `sidebar` slot.
- Pass custom lifecycle commands through `:status-actions`.
- Do not rebuild trace, identity, status, or page header rows locally.

## Data Display

- Use `SpecsBlock` for standard physical dimensions: width, length, area, sheet
  thickness, and foil thickness.
- Use `DataBlock` for entity-specific facts. Define the field list in
  `<script setup>` near the component.
- Field descriptors use `{ path, i18n, suffix?, prefix? }`; paths are
  dot-notation into the DTO.
- Do not render nested objects manually unless they are genuine custom UI.
  `DataBlock` already hides non-displayable nested objects and formats stable
  references.

## Data And Actions

- Use `useEntity(type, id)` for standard entity fetching, CRUD, updates, and
  status transitions.
- Use direct `$fetch` only for workflows not represented by `useEntity`:
  uploads/downloads, invitations, permissions, support chat, payments, debug
  endpoints, and project-scoped subresources.
- Entity cards and pages must not import `useBlocks.js`; only shared
  block/status/trace primitives may consume `useIdentity`, `useStatus`,
  `useSpecs`, or `useLineage`.
- Direct `primevue/card` and `primevue/dialog` imports belong in shared wrappers
  (`EntityCard`, `StandardDialog`), not feature components.

## Manifest And Tests

When adding or renaming entity cards, update the contract-driven demo path:

1. `utils/design-system-contract.js`
2. `utils/design-system.js`
3. `test-data/factories.js`
4. `/test/ui-lab` coverage if the existing manifest does not render the case
5. `framework.manifest.json` via the project scripts

Use focused verification after UI design-system changes:

```bash
npx vitest run shared/design-system.spec.js
node -e "import('./assets/presets/re_l.js').then(() => console.log('preset ok'))"
npm run framework:write-manifest
npm run framework:manifest
```

Do not run Nuxt dev servers or `npm build` in this project unless the user
explicitly asks.

## Documentation Sync

For every UI implementation change:

- Update the relevant local README if behavior, structure, primitives, tokens,
  or contracts changed.
- Add related README links when adding a new component area.
- Add an `Agent Notes` entry under the relevant task in `TODO.org` with date,
  task, files changed, docs updated, and key decisions.
- Keep code and documentation commits separate when committing: implementation
  commit first, docs/TODO commit with `neo: ...` prefix.
