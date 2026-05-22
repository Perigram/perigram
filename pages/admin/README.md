# COMPONENT: Admin Pages

Administrative pages for organization/user management, diagnostics, support, and internal review tools.

## Workbench

`workbench.vue` is the unified authenticated development surface. It has three
global sections: Entities, Context, and Operations. The Entities section lists domain
entity UI surfaces and edits the selected surface across its own workspace
tabs: UI Lab component variants, extracted data-model decisions, feedback, and
workflow/state machine draft. The selector is keyed by UI contract key, so
surfaces like `materialPile` and `batchPile` remain separate even when they
share the same backend entity type. The UI section renders rows from the same
`createDesignSystemDemoRows()` path as `/test/ui-lab`. The data model section
loads the same `/api/debug/data-models` response shape as Data Model Review and
shows compact field chips instead of the full review table. The workflow
section uses the same Vue Flow graph editor pattern as Domain Builder:
draggable status nodes, connectable transitions, and a side panel for lifecycle
state, access requirements, capabilities, attachments, and typed hook settings.
Feedback is a plain note for the selected entity.

The Context section owns generated dev fixture data and the global workbench
test-access context used by operation runs. The Operations section is separate
from the entity workspace. It loads runnable service actions from
`/api/admin/operations`, shows handler availability, runs selected operations
with generated typed controls, and shows only the latest persisted
`service_action_runs` output. The selected operation also shows related process
contracts and spawned `process_runs` from `/api/admin/processes`, including
executor metadata, queue status, attempts, lease information, input, output, and
error details. The single
WorkbenchContext compiles the currently edited workflow draft, generates a
coherent CNC entity graph, persists it through `/api/workbench/fixtures/seed`,
and feeds the resulting entity refs into typed operation inputs. Input and
output previews reuse the design-system entity registry, so selecting a
`nesting_run`, `sheet_design`, or generated `artifact` renders the same entity
component used by UI Lab instead of a separate service-page mapping. Operation
parameters are contract typed as well: entity references use entity selectors,
while generated raw object/array payloads are marked hidden and kept out of the
service form. Operation result refs are hydrated back into WorkbenchContext,
including generated artifact DTOs via `/api/artifacts/:id/metadata`; missing
refs are reported instead of rendered as synthetic placeholder cards.
The page provides the compiled workflow draft as `statusWorkflows`, so nested
`EntityStatus` instances in entity cards reflect the machine currently being
edited instead of the committed package defaults.
The Context section renders generated test data with full `card` entity
variants so fixture previews expose component body content and expanded status
controls; operation input/output previews stay compact.
It also provides the current WorkbenchContext as `entityContext`, allowing
entity cards to detect related generated entities such as a nesting run's
`sheet_design` children by lineage.

`users.vue` manages user permissions against the real access model. The dialog
passes active membership permissions into `PermissionEditor`, and test/UI Lab
users include role, membership, and permission template data instead of a fake
role-only shape.

## Domain Builder

`domain-builder.vue` is an authenticated development tool for editing
`@cutkit/domain-cnc` entity definitions, frontend route metadata, workflow
definitions, lifecycle schemas, transition access requirements, transition
hooks, and summary rules in a browser-local draft.
Entity/routes/summaries use table controls. Workflows use
Vue Flow core for the graph canvas: statuses are selectable/draggable nodes,
transitions are selectable edges with compact guard/hook summary labels,
reciprocal transitions use curved routing, transitions can be created by
connecting nodes or using the source/target click flow, and manual node
positions are stored separately from exported domain data. The side panel edits
lifecycle flags, actors, attachments, access JSON, capabilities, and known hook
handlers. The tool exports draft JSON or generated JS and does not write
repository files.

## Data Model Review

`data-model-review.vue` loads generated model extraction output from `/api/debug/data-models`, lets reviewers annotate field decisions in localStorage, and exports a markdown refactor plan.

The page also compares extracted collections with `framework.manifest.json` so model cleanup decisions stay aligned with the framework entity contract. The extractor output is review input; the committed manifest remains the framework-facing contract used by devtools/MCP.

Support/runtime collections (`collection_name` from the backend template, invitations, material options, sessions, and status events) remain visible for field cleanup but are excluded from manifest gap warnings because they are not framework entities.

## Related

- [server utils](../../server/utils/README.md) - data model extractor behavior
- [packages](../../packages/README.md) - framework manifest and package contract
- [test pages](../test/README.md) - UI lab feedback workflow
