# COMPONENT: Admin Pages

Administrative pages for organization/user management, diagnostics, support, and internal review tools.

## Data Model Review

`data-model-review.vue` loads generated model extraction output from `/api/debug/data-models`, lets reviewers annotate field decisions in localStorage, and exports a markdown refactor plan.

The page also compares extracted collections with `framework.manifest.json` so model cleanup decisions stay aligned with the framework entity contract. The extractor output is review input; the committed manifest remains the framework-facing contract used by devtools/MCP.

Support/runtime collections (`collection_name` from the backend template, invitations, material options, sessions, and status events) remain visible for field cleanup but are excluded from manifest gap warnings because they are not framework entities.

## Related

- [server utils](../../server/utils/README.md) - data model extractor behavior
- [packages](../../packages/README.md) - framework manifest and package contract
- [test pages](../test/README.md) - UI lab feedback workflow
