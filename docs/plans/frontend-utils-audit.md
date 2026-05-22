# Frontend Utility Audit

## Current Ownership

- Entity display contracts: `utils/design-system-contract.js`,
  `utils/design-system.js`, and shared/entity Vue components.
- Workflow/status helpers: `utils/workflow-compiler.js`,
  `utils/domain-builder.js`, `utils/status-actions.js`,
  `utils/status-engine.js`, and `utils/status-location.js`.
- Geometry/cassette helpers: `utils/dxfParser.js`, `utils/cassette.js`,
  `utils/cassetteRenderer.js`, `components/shared/GeometryPreview.vue`,
  and cassette editor/designer components.
- Generated test data: low-level DTO factories in `test-data/factories.js`;
  cross-entity coherent graphs in `test-data/scenarios.js`.
- Stateful workbench flows: Pinia stores such as
  `stores/workbenchFixtures.js`; backend writes through server services.

## Protocol

- Utilities stay pure: no `$fetch`, no Pinia mutation, no component state.
- Cross-entity defaults and generated references belong in scenario graphs, not
  entity methods.
- Typed form descriptors use shared components such as `TypedSettingsForm` and
  `EntityRefInput`; raw JSON/text inputs are debug fallbacks only.
- Workflow state/options must come from the compiled draft machine when the
  workbench is editing machines live.
- Geometry previews should read `data.geometry.preview` and stay reusable for
  DXF-derived artifacts, sheet designs, remnants, and cassette designs.

## Follow-Up Targets

- Move any remaining direct backend calls out of utility modules.
- Consolidate cassette preview/designer output into the same geometry preview
  protocol used by fixture scenarios.
- Add more scenario variants only after the base CNC graph remains coherent and
  persisted action runs work end to end.
