# COMPONENT: Test Data

DTO fixtures and authoring seams for the UI lab, the design-system spec,
SSR smokes, and the e2e suite. Runtime modules here are imported by both
Nuxt UI code and direct Node loaders, so cross-root contracts use the
repository package imports (`#shared/…`, `#packages/…`, `#utils/…`);
Nuxt UI code imports the factories through `~/test-data/…` at the call
site. `scripts/check-arch.js` enforces these portable-import rules for
non-spec files here.

## Modules

- `factories.js` — DTO factories for the UI lab,
  `shared/design-system.spec.js`, and `utils/design-system.js`. Factories
  model API DTOs, not raw MongoDB documents: root `_id` plus the
  canonical blocks (`identity`, `origin`, `status`, `lineage`,
  `relations`, `provenance`, `specs`, `attachments`, `data`, `summary`).
  Exports `MOCK_IDS` (the stable demo ids) and:

| Factory | Builds |
|---|---|
| `createMockEntityRevision()` | cassette-geometry revision with snapshot and content hash |
| `createMockPenTemplate()` | cutting pen with a stroke definition |
| `createMockLayerStandard()` | facade layer standard (code, category, default pen) |
| `createMockUser()` | user with role, permission-template permissions, and an active membership |
| `createMockOrganization()` | fabricator organization |
| `createMockHistory(statuses)` | status-event timeline; takes a states array (default `DRAFT → ACTIVE → CLOSED`) |
| `createMockStatistics()` | dashboard utilization/cost totals |

- `persisted-acceptance.js` — the privacy-safe persisted-graph fixture:
  a synthetic organization with roles and a role assignment, a saved
  species process definition (cts state records, producer outputs,
  process nodes, viewport), and a project → facade hierarchy. Consumed
  by the compiler, designer, and process-definition runtime specs
  (`packages/processes`, `shared`, `composables`,
  `server/features/process-definitions`). Keep it synthetic: production
  records and credentials stay out of this fixture.
- `order-process-authoring.js` — the e2e seam that composes the order
  process (`createOrderProcessAuthoring` and the compose helpers) over a
  mounted domain. Each table line constructs a `nesting-entry` child with
  its `design` ref and `count`, and each entry constructs the physical
  `cassette-instance` it stands for. The graph nests the entries per
  material, constructs one sheet design per solved composition under the
  nesting attempt, reuses a stored sheet design whose `compositionKey`
  matches, and cuts each new sheet through a sheet instance and cut plan.
  `e2e/order-process.spec.js` drives it through the real authoring API.
- `ui-mapping-fixtures.js` / `ui-mapping-random.js` — synthetic compiler
  output for the UI mapping contract. The fixed world is a
  self-recursive filesystem-like graph: a forest of three top folders
  with containment recursing six levels, keeper items floating free of
  lineage, documents superseding each other, many-to-many link sheets,
  and fourteen stateful watch jobs as the bulk stream. Instances carry
  the wire's one flat `state` string; the compiled contract carries
  `statePolicy` and `stateTransitions` per type exactly as the live
  derivation produces them. The random world follows the same split
  with generated vocabularies and a linear edge chain per vocabulary.
  The world is what the seed rolls: classes, fields, edges, and
  instance counts all come from the PRNG, and the only post-roll
  touches are validity floors (an identifier flag somewhere, a control
  pin somewhere, nullable marking on refs whose targets rolled empty).
  Projection and arrangement coverage is a property of rerolling
  seeds, not of stamps.
  Their specs pin the shapes; `shared/design-system.spec.js` and
  `test-tools/ui-mapping-page.ssr-smoke.js` render them.

## Usage

```javascript
import { createMockUser } from '~/test-data/factories';

const admin = createMockUser({ identity: { name: 'Site Admin' } });
```

Every factory except `createMockHistory` (a states
array) and `createMockStatistics` (fixed totals) takes an overrides
object spread onto the defaults.

## Design-System Alignment

- A factory `status.state` for a typed workflow must be one of that
  workflow's canonical states; `shared/design-system.spec.js` enforces
  this for UI lab demos.
- `createMockUser()` includes role, organization membership, and
  permissions so permission editors render the real access shape.
- Mutable location examples belong in `status.lifecycle.data.location`
  with typed shapes (`warehouse`, `coordinates`, `address`).
- Geometry previews for design/remnant cards belong under
  `data.geometry.preview` with layer paths or polygon points; do not add
  UI-only filename fields when the card needs a visual preview.
- When a component needs a new field for display, update the relevant
  DTO factory and manifest entry together; do not add flat compatibility
  fields.
- Shape sources: the v24 block contract
  ([server/core/blocks/README.md](../server/core/blocks/README.md)) and
  the entity design-system manifest through the compatibility exports in
  `utils/design-system-contract.js`.

Parent: [root README](../README.md).
