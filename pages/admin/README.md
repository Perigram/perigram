# COMPONENT: Admin Pages

Authenticated administrative and internal development pages.

## Workbench

`workbench.vue` is the unified contract workbench. It reads the committed domain
from `/api/admin/domain`, commands from `/api/admin/commands`, command runs from
`/api/admin/commands/runs`, and tasks from `/api/admin/tasks`. It does not import
`@cutkit/domain-cnc` directly.

Sections:

- Entities: design-system surface previews, extracted data-model fields,
  workflow graph editing, and feedback.
- Context: generated fixture graph and test access context.
- Commands: typed command inputs, latest command run output, related task
  definitions/runs, and entity/attachment previews.

The Context section can add manual entities to the same fixture graph. Cassette
templates are created through `CassetteDesigner` in local-save mode; other
entity types use typed forms with `entityId` selectors for lineage/dependency
fields. Manual entries immediately become options for command inputs and can be
included when seeding the dev fixture context. The manual creator builds
minimal v24 DTO blocks and does not copy demo factory data payloads; queue
creation is the exception that asks for a cassette template and quantity so
nesting commands have job items.

Command output hydration includes both the synchronous command result and
related task-run outputs. Async nesting completion therefore updates the
in-memory `nesting_run` and `sheet_design` previews when the task finishes.

The page provides edited workflows as `statusWorkflows` so nested entity cards
render against the local draft, while execution still goes through server
runtime APIs.

Workbench command runs can submit a per-run `testAccess` object with custom
`userId`, `organizationId`, `role`, memberships, permission grants, and
`restrictedTo` data. The server preserves that object shape and evaluates it
through the same access engine as production requests, so fixture ownership and
scoped access experiments do not need role-name branches.

## Domain Builder

`domain-builder.vue` is a browser-local editor for CNC domain source drafts. It
loads package definitions, edits entities/routes/workflows/summaries/commands
and hook contracts, validates the draft, and exports generated JS. It does not
write repository files.

## Data Model Review

`data-model-review.vue` compares extracted Mongo collection fields with the
framework manifest and stores review decisions in localStorage.

## Related

- [Runtime registry](../../server/runtime/README.md)
- [domain-cnc](../../packages/domain-cnc/README.md)
