# COMPONENT: Frontend Utilities

Shared frontend utility modules used by Vue pages/components.

## Design System Contract

- `design-system-contract.js`: Compatibility exports and validation for the CNC design-system contract now owned by `@perigram/domain-cnc`. It does not import Vue components.
- `design-system.js`: Runtime binding that attaches Vue card components and DTO factories to the contract. Used by `/test/ui-lab`.
- `processDesignerSocketTone.js`: Pure process-port resolver used by every
  designer node form and source edge. It maps structured port type/role data to a
  semantic signal token so a socket and the wire it produces cannot drift
  into separate color contracts.
- `processDesignerIdentity.js`: Pure identity minting for the process
  designer — opaque kebab-safe registry type ids, and `mintId()` for every
  canvas/definition id created at runtime (nodes, edges, services, sockets,
  stations), collision-proof across same-millisecond drops.
- `processDesignerCommandPorts.js`: Pure projection of a domain command
  contract into the handle-shaped port rows the runCommand inspector panel
  renders; consumes no designer state.
- `processDesignerDefinitionRecords.js`: Pure factories for the
  definition-plane service and socket records (Roles tab surfaces); the
  process-node record factories stay with the designer node-sync family.
- `processDesignerTypeMigrations.js`: Pure seam of the type-migration
  authoring loop (CTS SPEC §11/§14): a refused declaration post's plan
  payload becomes step rows labeled by the authored vocabulary
  (`declarationVocabulary` maps field ids back to labels through the tree
  and the stored view), confirmed rows become migration steps, and the
  steps write back onto (and clear from) the designer tree's class nodes.
  The consuming flow and dialog live in
  [components/process-designer](../components/process-designer/README.md);
  the step language and the 400 plan payload are the
  [cts-types](../server/features/cts-types/README.md) contract.
- `instance-display-contract.js`: Pure resolver for the UI constructor and the
  one fact vocabulary seam — one resolver per display fact, bundle-only.
  `factsFor(typeView, surface)` projects the served CTS client bundle's
  derived `sections` plus the field descriptors into ordered slot-qualified
  fact rows for a surface (class-generic group policy, shared field limits:
  inline 1, compact 3). `resolveInstanceDisplayContract` composes on top:
  bundle rows first, app extensions (`app-instance-surfaces.js`) over them,
  per-call `fieldGroups`/`surfaces`/`overrides` last (they always win).
  The legacy residual domain map is deleted — undeclared types resolve no
  fact rows. Surface chrome (preview/dataDisplay/relations/actions/status/
  trace) is class-generic policy derived from the type record (payload
  presence, declared state axes); record titles and glyphs come from
  `titleFor`/`iconFor` in [shared/ui-mapping](../shared/ui-mapping/README.md)
  (the former identity-chrome helpers `instanceIdentityLabel`/
  `instanceIdentityMeta` are gone).
- `app-instance-surfaces.js`: App-owned display extensions layered on top of
  the bundle-resolved fact rows (`resolveInstanceDisplayContract` composes
  them; per-call overrides still win). The seam is the app's only
  route-specific patch channel; its former project/warehouse entries died
  with those entity types, so it currently carries no entries.
- `data-display.js`: Shared path resolution and value formatting for generated `DataBlock` rows. It formats scalar values, booleans, scalar arrays, object arrays, and named object references while hiding non-displayable nested objects instead of rendering `[object Object]`. Declared `unit`s render as value suffixes through the closed unit-symbol table (`mm`, `m`, `m2`→`m²`, `percent`, `min`, `deg`); `display: 'dimensions'` renders the width × length span of a resolved specs object.

## Utility Protocol

Keep utilities pure: they should not call `$fetch`, mutate Pinia stores, or own
component state. Cross-entity generated data belongs in the
[test-data workbench context](../test-data/README.md);
stateful workbench flows belong in stores/composables; backend writes belong in
server feature services and repositories.

The design-system contract is the source of truth for UI lab coverage. Add new
entity cards, field groups, and surface contracts there first, then wire the
component and DTO factory in `design-system.js` / `test-data/factories.js`.

## Related

- [components](../components/README.md) - entity component rules and shared block usage
- [test-data](../test-data/README.md) - DTO-shaped factories used by demos and tests
