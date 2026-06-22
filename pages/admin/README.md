# COMPONENT: Admin Pages

Authenticated administrative and internal development pages.

## Workbench

`index.vue` renders the unified contract workbench at `/admin`; `/admin/workbench`
keeps the same surface as a compatibility route. Workbench section switching is
owned by the app navigation breadcrumb through `/admin?section=...`, while the
page body keeps only the compact reset/export action row. `workbench.vue` reads
the committed domain from `/api/admin/domain`, commands from
`/api/admin/commands`, command runs from `/api/admin/commands/runs`, and tasks
from `/api/admin/tasks`. It does not import `@cutkit/domain-cnc` directly.

Sections:

- Entities: design-system surface previews resolved from the domain constructor
  contract, extracted data-model fields,
  workflow graph editing, and feedback.
- Designer: Cassette Designer v2 OCCS layout prototype.
- Context: generated fixture graph and test access context.
- Commands: typed command inputs, latest command run output, related task
  definitions/runs, and entity/attachment previews.

The Context section can add manual entities to the same fixture graph. Cassette
templates are created through `CassetteDesigner` in local-save mode; other
entity types use typed forms with `entityId` selectors for lineage/dependency
fields. The type selector is built from loaded domain definitions with a
design-system contract fallback so it remains usable during slow or failed
domain loads. Manual entries immediately become options for command inputs and
can be included when seeding the dev fixture context. The manual creator builds
minimal v24 DTO blocks and does not copy demo factory data payloads; queue
creation is the exception that asks for a cassette template and quantity so
nesting commands have job items. Required lineage/dependency references are not
auto-selected from the fixture graph; the create action stays disabled until
the operator chooses them explicitly.

Command output hydration includes both the synchronous command result and
related task-run outputs. Async nesting completion therefore updates the
in-memory `nesting_run` and `sheet_design` previews when the task finishes.
Output previews resolve only from the workbench fixture context; the page does
not fetch command output entity refs through normal protected entity APIs. Refs
not present in context remain listed as missing output refs instead of producing
browser-side 401/403/404 requests during polling.
Artifact output cards open the same attachment-kind-aware preview dialog used by
artifact surfaces, so DXF/SVG outputs render through `DrawingCanvas` and
download-only/PDF outputs keep a direct download path.

The page provides edited workflows as `statusWorkflows` so nested entity cards
render against the local draft, while execution still goes through server
runtime APIs.
Entity status controls in fixture previews use a local `statusTransitionHandler`
to update the in-memory workbench context, avoiding server transition calls for
entities that have not been persisted.
The workflow editor uses `WorkflowDesignerV2`, which edits v2 state-machine
regions while preserving flat workflow drafts through normalization. It edits
region initial states, states, transitions, lifecycle metadata, transition
access, capabilities, and hooks, and renders a compact visual graph for the
selected region.

## Workflow Overrides

`workflows.vue` is the organization-scoped workflow override surface. It loads
domain entities/workflows from `/api/admin/domain`, shows only entity types
whose backing feature is admin-accessible to the current user, loads the active
override from `/api/workflow-overrides/:entityType`, and saves normalized v2
workflow definitions through the same endpoint. Reset reloads the domain default
into the editor without saving it.

The Workbench no longer exposes a cassette designer section. Cassette template
editing belongs to the production app cassette surface; Workbench keeps only
Entities, Context, and Commands sections. The Context section can still create a
local cassette fixture through the legacy non-persisted `CassetteDesigner` so
command scenarios can receive cassette-template inputs without routing users
through a second production designer.

Workbench command runs can submit a per-run `testAccess` object with custom
`userId`, `organizationId`, optional compatibility label, memberships, permission
grants, and `restrictedTo` data. The server preserves that object shape and
evaluates explicit grants through the same access engine as production
requests, including optional logical `grant.rule` predicates, so fixture
ownership and scoped access experiments do not need compatibility-label
branches.

The workflow tab delegates state/transition editing to
`components/WorkflowDesignerV2.vue`, keeping Workbench on the same workflow
graph editor as the admin workflow surface.

`workflows.vue` is the admin workflow override page. It loads committed domain
workflows from `/api/admin/domain`, fetches an organization override from
`/api/workflow-overrides/:entityType`, and saves edited workflow JSON through
the same override endpoint.

## Users

`users.vue` is the platform/admin user list. It shows copied membership
permissions as read-only legacy fallback data and links access changes to
organization Team management, because active organization access is composed
from process role assignments rather than direct permission JSON edits.

## Domain Builder

`domain-builder.vue` is a browser-local editor for CNC domain source drafts. It
loads package definitions, edits entities/routes/workflows/summaries/commands
and hook contracts, validates the draft, and exports generated JS. It does not
write repository files. Entity definitions render as schema contracts with
block chips and related workflow/route/summary counts; frontend routes render
as endpoint pairs; workflows render as state-machine selectors plus the graph
and selected state/transition inspectors; summaries render as parent-to-child
aggregation contracts with count and sum-field rollups; validation and export
surfaces render issue/source contract outputs instead of generic tables.

## ConfigBot

`config-bot.vue` is the v0.1 admin interface for generating draft packages from
the existing domain-cnc and Vue component catalog. It calls
`/api/config-bot/generate`, `/api/config-bot/chat`, and
`/api/admin/config-bot/reindex`.

ConfigBot packages target admin micro-app pages/workflows. They are export-only:
the page has no apply action and the backend returns virtual files rather than
writing repository files. Access is controlled by the `config_bot: admin`
permission grant through the backend access engine.
The draft viewer includes a metadata-rendered preview tab for the generated page
shell, selected lego components, and workflow summaries alongside the virtual
file and domain JSON tabs.

## Data Model Review

`data-model-review.vue` compares extracted Mongo collection fields with the
framework manifest and stores review decisions in localStorage.

## Marketing Animations

`marketing-animations.vue` previews reusable public marketing visuals under the
authenticated admin route. It currently hosts the cassette workflow animation
used by the public landing page, including motion metadata and reduced-motion
support notes. The animation itself lives in
`components/marketing/CassetteMarketingAnimation.vue` so public and admin
surfaces render the same asset.

## Related

- [Runtime registry](../../server/runtime/README.md)
- [domain-cnc](../../packages/domain-cnc/README.md)
- [marketing components](../../components/marketing/README.md)
