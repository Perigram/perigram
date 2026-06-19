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

- Entities: design-system surface previews, extracted data-model fields,
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
The workflow editor is the current development surface for lifecycle drafting:
it edits the loaded domain workflow graph, state lifecycle schemas, transition
access, transition capabilities, and hooks. Lifecycle actors and transition
capabilities use selectable option lists built from existing workflow usage plus
standard capability names. Hook rows expose handler, phase, and mode selectors,
and hook parameters render through `TypedSettingsForm`; domain hook contracts
with `entityType` or `workflowState` parameters therefore render selects instead
of free-text fields.

The Designer section embeds `CassetteDesignerV2` directly and hides the generic
workbench draft/reset action row while the designer is active, because cassette
template save/load/reset are owned inside the designer. The left designer rail
keeps the current cassette name, load-template action, compact icon-only
save/reset buttons, and session draft recovery; undo/redo controls sit in the
canvas top-left overlay. The same rail owns global OCCS parameters, layer
visibility, and OCCS JSON tabs. Parameter rows use a responsive grid while that
panel is docked full-width and return to one column when the panel is a narrow
side rail. Selected-object editing is canvas-local:
face role/delete actions, dimension labels, offsets, anchors, fold angles,
attachment face placement, and section planes are edited from drawing
overlays/popovers.
New drafts start with one root face; plus actions add one child face at a time,
defaulting to a return flange from non-return parents and to a mounting flange
with `-90` fold from return-flange parents. Save emits an OCCS v2 definition with `extensions.cutkit.graphTree`; the
designer persists it through the `saveCassetteTemplate` command, then the
workbench mirrors the saved cassette DTO into the fixture context, selects it as
`refs.cassetteTemplate`, and rewrites the active queue's first nesting item with
parameters extracted by the canonical OCCS helper so the `solveNesting` test
command receives the saved template through its normal queue input. On load and
after fixture rebuilds, the workbench fetches persisted `PARAMETRIC` templates
from `/api/cassettes`, upserts them into that same fixture context, and passes
their ids to the designer so saves update only real DB templates; generated demo
templates are saved as new cassette rows. Parameter
and fold-angle fields use the
lightweight cassette expression editor with text validation, inline token
highlighting, a tooltip usage guide, and one grouped insert-chip panel under
the active expression without resizing the parameter list. Dimension labels are
clickable drawing text, while offset controls use compact value chips centered
on canvas points, positive offsets extend outward, and anchors stay in the same
popup for the base offset fields.
Invalid expression drafts
keep the drawing on the last successful preview and show a panel warning until
evaluation succeeds again. The designer keeps session-local autosave drafts and
offers recovery/discard before overwriting them, but only explicit Save writes
through the command API and does not show a persistent autosaved badge. The drawing canvas renders only geometry and
geometry-bound designer hit targets. Assembly topology is outside the canvas:
the responsive assembly rail/dock renders a compact workpiece DAG/list for
selecting real OCCS workpieces and attachments, while the folded 3D preview
shares that rail on `lg` and wider layouts. Below `lg`, topology keeps the full
mobile assembly row and the 3D preview is suppressed so workpiece controls do
not collapse. New workpieces get their own root
face, definition, cassette occurrence, and editable face-relative joint with
source/target face selection, snap points, and offsets. A link action declares
additional attachments to the selected workpiece without creating another
workpiece; the renderer chooses a placement attachment internally and keeps the
others as constraints. The workpiece DAG/list is the topology control: row
buttons add related workpieces, start a link to another workpiece, or delete
non-root workpieces, and relation rows are listed under both source and target
workpieces so multi-parent attachments remain visible. Relation rows select
attachments, expose unlink actions, and show folded-preview diagnostics for
unresolved or impossible constraints. Section graphics are emitted on the toggleable
`code.cassette_mark` layer. Selecting workpieces or attachments shows connected workpieces in
the 2D editor background; while an attachment is selected, clicking faces in
the canvas updates its source/target face ids. Deleting a non-root workpiece
removes only that workpiece, its faces, and incident joints. Edge hover shows a
`+` chip and only that visible chip adds folds within the selected workpiece;
folded-edge chips open inline plain numeric fold-angle editing, and the
selected-face menu changes role or deletes the child face. Inline popups are
draggable, remember their browser-session position, keep close controls in the
input line instead of a dedicated header row, and close on Enter or Escape.
Outside attachment mode, face/fold clicks from other workpieces
are ignored and selection-only changes do not regenerate the preview source, so
pan/zoom is preserved. A separate fold-delete command is not exposed; deleting the
child face is the supported removal operation. The folded 3D panel is one
cassette assembly window with deterministic per-workpiece hues; placement
attachment snaps are applied after sheet folding, extra attachments are
highlighted when impossible or unresolved, clicking a workpiece selects it in
the designer and isolates it in 3D, while the back button returns to the whole
cassette view. The preview supports drag orbit, wheel zoom, reset, and a stable
panel shell inside the viewport-bounded designer work area. Its 2D production layers and
3D folded payload are derived through `utils/occs/` helpers before rendering in
shared components. Generated CAD-style dimensions are semantic
`dimension.cassette` OCCS entities/layers, with template labels kept as
expressions and evaluated designs storing numeric values. It renders folded
faces through a Three.js WebGL scene with
depth testing, double-sided materials, outline edges, lights, and raycast
workpiece selection, so layer visibility settings persist across preview
regeneration without SVG painter-order artifacts.

Workbench command runs can submit a per-run `testAccess` object with custom
`userId`, `organizationId`, optional compatibility label, memberships, permission
grants, and `restrictedTo` data. The server preserves that object shape and
evaluates explicit grants through the same access engine as production
requests, so fixture ownership and scoped access experiments do not need
compatibility-label branches.

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
