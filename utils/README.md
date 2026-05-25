# COMPONENT: Frontend Utilities

Shared frontend utility modules used by Vue pages/components.

## Design System Contract

- `design-system-contract.js`: Compatibility exports and validation for the CNC design-system contract now owned by `@cutkit/domain-cnc`. It does not import Vue components.
- `design-system.js`: Runtime binding that attaches Vue card components and DTO factories to the contract. Used by `/test/ui-lab`.
- `data-display.js`: Shared path resolution and value formatting for generated `DataBlock` rows. It formats scalar values, booleans, scalar arrays, object arrays, and named object references while hiding non-displayable nested objects instead of rendering `[object Object]`.
- `status-engine.js`: Compatibility status severity/icon mapping and entity route/icon registry used by shared status and trace components. New source-of-truth UI, artifact, and route metadata belongs in `@cutkit/domain-cnc` and is adapted by `@cutkit/vue`.
- `status-actions.js`: Converts workflow definitions into default `EntityStatus` action buttons so cards do not use hardcoded state transitions. Respects transition `display` (`inline`, `menu`, `hidden`) and hides self-loop metadata transitions by default. Callers may pass a workflow override; otherwise the utility uses the committed `@cutkit/domain-cnc` workflows.
- `status-location.js`: Normalizes typed current location facts from `status.lifecycle.data.location` for status surfaces. Supported UI types are `warehouse`, `coordinates`, and `address`.
- `selectOptions.js`: Pure helpers for PrimeVue Select option arrays. Use it to
  normalize canonical DTOs (`identity.name`, `identity.slug`, `_id`) into flat
  string `name`/id values before passing them to `optionLabel="name"` controls.
- `drawingPreview.js`: Pure drawing preview helpers for `DrawingCanvas`. It normalizes entity geometry previews and cassette render results into the shared `{ viewBox, layers }` drawing contract, extracts designer edge overlays, and resolves layer pens by explicit source mapping, caller-provided `standardCode`, layer-name standard fallback, then default pen. It must not hardcode production layer standard codes; source/caller data owns layer semantics.
- `domain-builder.js`: Browser-side helpers for `/admin/domain-builder`. It clones CNC package definitions into a draft, validates entity/workflow/summary consistency, builds automatic Vue Flow node/edge layout data with reciprocal-transition metadata used unless the page has browser-local manual node positions, and generates deterministic `@cutkit/domain-cnc` source for manual export.
- `workflow-compiler.js`: Shared workbench/domain-builder compiler wrapper for live workflow drafts. It validates draft machines, exposes state options for typed forms, and derives permission summaries used by fixture scenarios and workbench test access. If a caller has not loaded entity or hook definitions yet, it falls back to committed CNC contracts so workflow validation does not report every known workflow/hook as unknown.
- `cassette.js` / `cassetteRenderer.js`: Browser cassette designer helpers. ID generation must work on plain HTTP LAN deployments where `crypto.randomUUID` may be unavailable; use local helpers that fall back to `crypto.getRandomValues` before non-cryptographic IDs.

## Utility Protocol

Keep utilities pure: they should not call `$fetch`, mutate Pinia stores, or own
component state. Cross-entity generated data belongs in `test-data/scenarios.js`;
stateful workbench flows belong in stores/composables; backend writes belong in
server feature services and repositories.

The design-system contract is the source of truth for UI lab coverage. Add new entity cards there first, then wire the component and DTO factory in `design-system.js` / `test-data/factories.js`.

## Related

- [components](../components/README.md) - entity component rules and shared block usage
- [test-data](../test-data/README.md) - DTO-shaped factories used by demos and tests
