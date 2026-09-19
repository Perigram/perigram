# Test Data Factories

**Enterprise Pattern:** Reusable factory functions for consistent test data across the application and design-system demos.

Factories in this directory represent **API DTO shape**, not raw MongoDB documents. They preserve the strict v24 block contract: root `_id` plus `identity`, `origin`, `status`, `lineage`, `specs`, `attachments`, `data`, and `summary`.

Factories can be imported by Nuxt UI code and by server/runtime modules that
run under direct Node loaders. Runtime modules in this directory must use
repository package imports such as `#shared/...`, `#packages/...`, and
`#utils/...` for cross-root contracts; Nuxt UI code may import the factories
themselves through `~/test-data/...` at the call site.

Test data comes from factory functions rather than inline mock objects, so overrides can be spread onto defaults.

`persisted-acceptance.js` is the privacy-safe regression fixture for the current
process protocol. It defines a synthetic organization/role assignment, a saved
v4 `Project -> Compose Lineage -> Artifact` graph (including connections and
viewport), representative block DTOs, and the expected compiled screens/actions.
Its spec round-trips persisted graph state and asserts Lineage inference, Home
filtering, project detail scoping, role-owned actions, selectors/status, and
Artifact viewer dispatch. It must never be replaced with copied production
records or credentials.

`ui-mapping-fixtures.js` is the synthetic compiler output for the UI mapping
contract: a deliberately fictional facilities-grid domain (zones → sectors →
stations → units, crews, readings/schematics/logs, audit runs) chosen to
exercise the mapping, not to model anything real — four lineage levels,
single and array cross-type refs, and variable file cardinality. It is the
second full hydration of the same contract; the UI generation layer
(shared/ui-mapping, components/ui-mapping) renders either domain without
domain knowledge (only the timeline layout matcher's `log_entry` type id is
reused by name). The CTS client bundle covers every field base
and qualifier (all units, few/many enums, single/array relations, variants
with payloads, records, lists, maps, json, blobs), all four declarable
classes, and all three preview modes; the compiled contract speaks CTS
vocabulary (`typeList` / `instanceDetail` screens, `typeId` sources scoped
by `instanceId`, `createInstance` / `updateInstance` / `deleteInstance`
actions) — the future compiler contract, not the current entity-era one —
with relation- and lineage-scoped child regions; the
instance graph runs three lineage levels deep with varied relation
cardinality (probes carry 0–10 related files) — the variable-cardinality
case slot budgets collapse. The
[UI mapping showcase](../pages/test/README.md) renders it; the mapping
contract itself is canonical in [shared/ui-mapping/README.md](../shared/ui-mapping/README.md).

## Usage

### Basic Usage
```javascript
import { createMockProject } from '~/test-data/factories';

const project = createMockProject();
```

### With Overrides
```javascript
const customProject = createMockProject({
  identity: { name: 'My Custom Project' },
  data: { customer: 'Different Corp' }
});
```

### Creating Multiple Items
```javascript
const projects = createMockProjectsList(5);
```

## Available Factories

- `createMockProject()` - Complete project object
- `createMockQueue()` - Queue with entries and history
- `createMockSheet()` - Physical material sheet
- `createMockBatch()` - Material batch with piles
- `createMockWarehouse()` - Warehouse with inventory counts
- `createMockRequisition()` - Requisition with items
- `createMockRemnant()` - Reusable material remnant
- `createMockCatalog()` - Material catalog with colors
- `createMockStatistics()` - Dashboard statistics
- `createMockHistory()` - Status change timeline
- `createMockMaterial()` - Material specifications
- `createMockProjectsList(count)` - Array of projects

## Extending

New factories follow the same `factories.js` pattern shown above.

## Design-System Alignment

Factories are built from:
- v24 block contract in `server/core/blocks/README.md`
- API DTO shapes emitted by feature models/services
- Entity design-system manifest in `@cutkit/domain-cnc` through the
  compatibility exports in `utils/design-system-contract.js`
- Workflow state definitions in `packages/domain-cnc/src/index.js`

Factory modules avoid Nuxt root aliases internally so direct Node imports,
server scripts, and Nitro-generated chunks resolve the same dependency graph.
They also avoid parent-relative cross-root imports because Nitro may move
modules into generated chunks during SSR builds. `scripts/check-arch.js`
enforces this for non-spec files in `test-data/`.

When a component needs a new field for display, update the relevant DTO factory and manifest entry together. Do not add flat compatibility fields.
When an entity type has a workflow, the factory `status.state` must be one of
that workflow's canonical states; `shared/design-system.spec.js` enforces this
for UI lab demos. Material pile factories use `STOCKED`, and the reusable
remnant factory uses `AVAILABLE`, matching the current domain workflows.
UI Lab/admin access examples use the same permission template and active
membership shape as the access model. `createMockUser()` includes role,
organization membership, and permissions so permission editors do not render a
fake role-only user contract.
Current mutable location examples belong in `status.lifecycle.data.location`, not in root `data` or `lineage`. Use typed shapes such as `warehouse`, `coordinates`, or `address` so `EntityStatus` can render the same location contract used by real DTOs.
Geometry previews for design/remnant cards belong under `data.geometry.preview` with layer paths or polygon points. Do not add UI-only filename fields when the card needs a visual preview.
`createMockPile()` represents a general/manual warehouse material pile. `createMockBatchPile()` represents a requisition-sourced pile and must include `lineage.requisitionId` so UI Lab keeps `materialPile` and `batchPile` visually distinct even though both use the `material_pile` backend entity type.

## Workbench Context

`workbench-context.js` is the admin workbench source of truth for generated
and runtime dev data. It stores entities as a type/id map, refs, relationships,
compiled workflows, access defaults, and typed command input bindings in
one context. Command outputs are upserted back into that same context before
they are rendered, so the UI does not create placeholder entity cards. Local
preview status transitions patch entity `status` blocks inside this same
context rather than calling persisted APIs for draft fixtures.
`workbench-manual-entities.js` owns the typed manual entity creation rules used
by the workbench. It creates minimal DTOs from v24 blocks instead of copying
factory demo payloads: lineage references are declared as `entityId` fields,
queues get only the typed cassette/quantity inputs needed for nesting, and
cassette designer output is stored in the backend `cassette` bucket while
previewing through the cassette-template UI surface. Queue item parameter
defaults are extracted through `utils/occs/parameters.js` and support both
legacy cassette `definition.params` and OCCS v2 `definition.parameters`, so
saved Cassette Designer v2 templates can feed the nesting command through the
normal queue input. Default manual drafts only fill name and workflow state;
entity references must be selected explicitly.

`scenarios.js` composes factory DTOs into the base coherent CNC graph and uses
the default OCCS cassette template from `utils/occs/templates.js` for
`refs.cassetteTemplate`.
The context helper projects that graph to a scenario shape only when the seed
endpoint needs collection arrays for persistence. Scenario generation owns
cross-entity consistency; individual factories remain low-level DTO
constructors and should not grow random/default entity methods.

Scenario statuses are derived from the compiled workflow draft passed by the
workbench. This keeps generated test data aligned with the status machine being
edited instead of static factory defaults.
