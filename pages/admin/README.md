# COMPONENT: Admin Pages

Administrative pages for organization/user management, diagnostics, support, and internal review tools.

## Workbench

`workbench.vue` is the unified authenticated development surface. It lists
domain entities and edits the selected entity across one set of sections:
UI display fields, extracted data-model decisions, feedback, workflow/state
machine draft, backend permission templates, and UI action permissions.
Workbench workflow drafts strip transition role lists so access stays in the
shared permission model while workflows keep lifecycle state, capabilities, and
hooks.

## Domain Builder

`domain-builder.vue` is an authenticated development tool for editing
`@cutkit/domain-cnc` entity definitions, frontend route metadata, workflow
definitions, lifecycle schemas, transition hooks, and summary rules in a
browser-local draft. Entity/routes/summaries use table controls. Workflows use
Vue Flow core for the graph canvas: statuses are selectable/draggable nodes,
transitions are selectable edges with compact guard/hook summary labels,
reciprocal transitions use curved routing, transitions can be created by
connecting nodes or using the source/target click flow, and manual node
positions are stored separately from exported domain data. The side panel edits
lifecycle flags, actors, attachments, app roles, capabilities, and known hook
handlers. The tool exports draft JSON or generated JS and does not write
repository files.

## Data Model Review

`data-model-review.vue` loads generated model extraction output from `/api/debug/data-models`, lets reviewers annotate field decisions in localStorage, and exports a markdown refactor plan.

The page also compares extracted collections with `framework.manifest.json` so model cleanup decisions stay aligned with the framework entity contract. The extractor output is review input; the committed manifest remains the framework-facing contract used by devtools/MCP.

Support/runtime collections (`collection_name` from the backend template, invitations, material options, sessions, and status events) remain visible for field cleanup but are excluded from manifest gap warnings because they are not framework entities.

## Related

- [server utils](../../server/utils/README.md) - data model extractor behavior
- [shared contracts](../../shared/README.md) - permission templates and UI action matrix
- [packages](../../packages/README.md) - framework manifest and package contract
- [test pages](../test/README.md) - UI lab feedback workflow
