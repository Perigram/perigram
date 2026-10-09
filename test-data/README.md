# Test Data Factories

**Enterprise Pattern:** Reusable factory functions for consistent test data across the application and design-system demos.

Factories in this directory represent **API DTO shape**, not raw MongoDB documents. They preserve the strict v24 block contract: root `_id` plus `identity`, `origin`, `status`, `lineage`, `specs`, `attachments`, `data`, and `summary`.

Factories can be imported by Nuxt UI code and by server/runtime modules that
run under direct Node loaders. Runtime modules in this directory must use
repository package imports such as `#shared/...`, `#packages/...`, and
`#utils/...` for cross-root contracts; Nuxt UI code may import the factories
themselves through `~/test-data/...` at the call site.

`plugins/` carries the demo marketplace plugin: `coatings.json` is a
publishable listing (see
[docs/PLUGIN_AUTHORING.md](../docs/PLUGIN_AUTHORING.md)) and
`coatings-executor.mjs` is its endpoint-mode executor — run it on the host
and point the plugin's Connection at
`http://host.docker.internal:8787/match` from inside the dev compose
network.

Test data comes from factory functions rather than inline mock objects, so overrides can be spread onto defaults.

`persisted-acceptance.js` is the privacy-safe regression fixture for the current
process protocol. It defines a synthetic organization/role assignment, a saved
v4 `Project -> Compose Lineage -> Artifact` graph (including connections and
viewport), representative block DTOs, and the expected compiled screens/actions.
Its spec round-trips persisted graph state and asserts Lineage inference, Home
filtering, project detail scoping, role-owned actions, selectors/status, and
Artifact viewer dispatch. It must never be replaced with copied production
records or credentials.

`ui-mapping-real.js` hydrates the showcase from the REAL pipeline
(`?source=real`): the CTS registry (CNC starter pack through the real
`compileClientBundle`, plus a synthesized `artifact` type for fixture
entities the pack does not type yet), the REAL process compiler
(`compileProcessDefinition` + `resolveRoleAssignmentAccess` over the
persisted acceptance fixture) projected from the compiler's entity
vocabulary into the CTS vocabulary this layer consumes, and the
fixture's real v24 block DTOs (project, facade) projected into the CTS
stored shape. The bridge is mechanical projection; gaps are honest —
state values stay domain-shaped until the compiler emits CTS-native
contracts, and instances stay DTO projections until SPEC §13 per-class
instance services exist.

`ui-mapping-fixtures.js` is the synthetic compiler output for the UI mapping
contract: hydration four, a self-recursive filesystem-like graph that breaks
the skeleton every earlier hydration shared (rooted group-tree with items
inside and files attached). Here containment recurses (folders inside
folders, six levels) across a forest of three top folders with no single
root; items (keepers) float with no lineage at all; the rich types are
files — documents supersede each other in a chain and many-to-many link
sheets in both directions, folders pin documents (group-to-file); and the
bulk of the data is a stream of fourteen small stateful watch jobs, so the
home screen is a heavy table stream plus a document grid. No timeline type
exists. The UI generation layer renders any hydration without domain
knowledge. Instances carry the wire's one flat `state` string (SPEC §7 —
type records carry no state vocabulary); the compiled contract carries the
per-type state display policy (`statePolicy`) exactly as
`statePolicyByType` derives it from compiled producer workflows, so the
fixtures exercise the same state-surface channel live hydration serves,
plus the authored machine edges (`stateTransitions`, as
`stateTransitionsByType` derives them) that the board projection reads
as its legal-move contract — the process-class watch jobs render as a
board; the item-class keepers keep their non-board projections.
The random world (`ui-mapping-random.js`) follows the same split: state
vocabularies are generated beside the types and served through the
contract, with a linear chain of edges per vocabulary.

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
- Entity design-system manifest in `@perigram/facade` through the
  compatibility exports in `utils/design-system-contract.js`
- Workflow state definitions in `packages/facade/src/index.js`

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
Current mutable location examples belong in `status.lifecycle.data.location`, not in root `data` or `lineage`. Use typed shapes such as `warehouse`, `coordinates`, or `address` so `InstanceState` can render the same location contract used by real DTOs.
Geometry previews for design/remnant cards belong under `data.geometry.preview` with layer paths or polygon points. Do not add UI-only filename fields when the card needs a visual preview.

## Workbench Context

The workbench context module and its manual-creation rules table were orphans
of the deleted entity-era workbench and are gone; factories remain low-level
DTO constructors.

The legacy `scenarios.js` demo-graph composer was deleted with the entity-era
CNC vocabulary (SPEC §19 abandoned data). The context helper
(`contextToScenario`) projects workbench context entities to the collection
arrays the seed endpoint persists; individual factories remain low-level DTO
constructors and should not grow random/default entity methods.

Scenario statuses are derived from the compiled workflow draft passed by the
workbench. This keeps generated test data aligned with the status machine being
edited instead of static factory defaults.
