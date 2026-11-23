# COMPONENT: Shared UI Components

This directory contains reusable, standardized UI components and blocks that MUST be used across the application.

Parent: [components](../README.md).

---

## Critical Architectural Rule: Blocks vs. Composables

`useBlocks.js` exposes low-level composables (`useStatus`, `useLineage`).

**These composables are ONLY for use inside the shared state/trace primitives.**
Entity cards and page components must NEVER import from `useBlocks.js` directly.

State-only conditionals in entity cards should use a local `computed` from `entity.states`. Do not import `useStatus` outside shared status/block primitives.

All shared and entity UI components consume the strict DTO contract: root `_id`
plus canonical blocks only. Display identity through the one title resolver
(`titleFor` from `shared/ui-mapping`, fed by the wire-to-screen bridge over
the bundle type record: the declared `identifier` field value, else the
localized unnamed placeholder; ids and slugs stay private display
vocabulary), status through `entity.status.*`, and feature data
through `entity.data.*`; do not read flat compatibility fields such as
`entity.name`, `entity.id`, `entity.type`, or `entity.parameters`.

---

## Fact Rows

### `FactRows.vue`
The one read-only fact-row renderer. Rows arrive pre-resolved from
`instanceFactRows`
([utils](../../utils/README.md) → `fact-rows.js`): the generated field
vocabulary over the served type record, the field-access gate applied at
derivation, values formatted through `utils/data-display.js`.

**Usage:**
```vue
const rows = computed(() => instanceFactRows({
  typeId, typeRecord: typeById(typeId), entity, auth: factGateAuth(), translator: { t, te }
}));
<FactRows :rows="rows" />
```

Props: `:rows` (required — `instanceFactRows` output; `{ group, label,
display, swatch, role }` rows), `variant` (`default` definition grid or `compact`
inline facts). The default layout uses its own inline-size container, so
columns follow the width assigned by a page or split pane; pass
`variant="compact"` wherever a dense surface needs inline facts. Rows carry
their `group` for sectioned surfaces (detail bodies chunk by group). Each
row's `role` resolves its value typography from the field/display contract
(`factRoleFor`: `number`, `quantity`, `instant` bases and `display: 'code'`
render the technical mono face with tabular numerals; every other value
renders the body face). Hand-built rows omit `role` for the body face.
Row gating and value decoration are the derivation's
(`shared/instance-field-access.js` over the `auth` input): do not render
sensitive facts beside `FactRows` unless the API DTO has already been
redacted for that same field policy.

### `InstanceSurfaceContent.vue`, `InstancePreview.vue`, `InstanceRelationsBlock.vue`
Contract-driven body primitives for app constructors. `InstanceSurfaceContent`
resolves an entity type plus `surface` through `utils/instance-display-contract.js`
(surface chrome) and `utils/fact-rows.js` (scalar fact rows over the served
org type view, `useFileTypeView` cache) and renders preview, data facts, and
relation rows with the shared primitives.
On the `detail` surface with a visible preview it composes a real page body:
media and the fact column sit side by side from 48rem of the surface's own
width and stack above it on narrower containers; card surfaces keep the
simple preview-first stack. With `dataDisplay: 'sectioned'` the fact column
chunks by field group (identity, overview, specs, stock, production) under
small localized `entityGroups.*` headings, so detail pages read as separate
concerns instead of one flat grid. `FactRows` renders
`display: 'swatch'` fields as a color dot beside the value for declared
hex-color facts. `InstancePreview` resolves the unified payload preview
first (a `fill` prop opts a host-owned fixed-height band in: the generic
media renders chromeless and fills it, so the host frames the preview):
a file instance with a stored payload renders through the type's
declared preview policy (`file-preview-contract.js` → `FilePayloadViewer`, the same
contract generated detail bodies use); a type with a served plugin preview
binding mounts the plugin's preview module (read-only, over the record and
its payload document); a declared `previewSource` value renders through
`GeometryPreview` (see [generated surfaces](../generated/README.md)). `InstanceRelationsBlock` renders relation descriptors through
`InstanceInlineRef`. Single refs render as inline chips; relation lists can also
render compact micro cards in a bounded responsive grid with preview on the
left, identity/status/facts on the right, and at most two visible refs before
an in-grid `+N` overflow control opens the hidden refs. Generated card surfaces pass
`suppress-child-counts` plus `relationVariant="compact"` to
`InstanceSurfaceContent`; when the DTO already carries relation-backed child
previews such as `summary.queuePreview`, `summary.runPreview`,
`summary.sheetPreview`, `summary.cassettePreview`, or `summary.colorPreview`,
those refs replace aggregate child-count fields such as `summary.queueCount`.
If no previewable child refs are available, the original numeric count row
stays visible instead of leaving the card empty. Specialized production cards
may still use custom slots where the workflow needs more than the default
body.
The overflow popover passes the requested relation variant through to every
`InstanceInlineRef`, so compact galleries remain compact after opening `+N`.

### `DesignerNodeCard.vue` and `DesignerSocketHandle.vue`

The shared designer-canvas card vocabulary. `DesignerNodeCard` is the one
node-card frame every canvas card composes — size ladder (`sm` declaration
leaves, `md` type/class cards, `lg` operation cards), selection border,
uniform padding, and the population surface (operation cards pass
`primary` for the primary-tinted surface; every other card keeps the
plain content surface). The card border is chrome.
`DesignerSocketHandle` is the one typed
socket handle: ONE uniform filled circle — color (the
payload family, from the port spec through
[`utils/processDesignerSocketTone.js`](../../utils/README.md)) is the
only socket channel — with the
standard 12px handle geometry and the
process-plane id minted by `mintProcessSocketHandle` (the declaration
plane's persisted `input:`/`output:` spellings pass `handleId`).
Operation cards (process designer) and declaration cards (type designer
family, on both the process and the type canvas) all consume them, so a
transported type keeps one semantic look on every card it appears on; a
spec-less handle degrades to the neutral data tone (the type canvas
renders read-only and supplies no specs). The channel→meaning contract
these primitives enforce (what color and size
each encode, and the card arrangement) is canonical in the
[process designer README](../../components/process-designer/README.md)
("Node UI contract").

### `DesignerWorkspace.vue`

Shared full-height shell for operational designers — the home of the
operational-designer chrome contract. The workspace is one dock grid:
the default slot's canvas is the dock's center
panel, and `palette`, `inspector`, and `preview` are dock panels around
it. Every cell is a pane with a tab: panels drag between groups and dock
to group edges, the canvas tab drags like any other panel, and joins
into the canvas center are refused so it stays whole. The pane boxes
and their 6px gutters follow the home workspace's dock language
([generated](../generated/README.md)). Initial panel sizes measure the
rendered content within panel-specific floors and caps; after that the
user owns the layout, and it persists per editor. The preview panel grows
to a 320px floor when it opens; a larger saved size is preserved.

Every operational designer uses this contract: cassette design and the
sheet-design editor use `layout="lanes"`; the process designer uses
`layout="canvas"`. Every designer first mounts through `DesignerSurface`,
and `DesignerDialog` uses the same surface for dialog entry points.

`workspaceId` names the editor's persisted dock layout
(`utils/designer-workspace-state.js`), scoped to the signed-in user and
active organization. `layout` records the host's intended composition
(`lanes` for persistent side panels, `canvas` for graph canvases). A
restored layout applies only when it still contains the canvas panel;
otherwise the workspace rebuilds the default composition — palette left,
inspector right, commands below the canvas. The canvas
header's ellipsis toggles dock panels and mirrors their open state in
`panels`. Narrow hosts (below 48rem of workspace width) replace the dock
with one bounded tabbed overlay with the file strip above it and the
commands row below; the wide dock layout is restored when the host
widens. Canvas commands render in the commands panel (`canvas-items`
prop), and panel content composes as plain labeled sections.

The file panel carries the edited document's identity inside the editor:
a host passing `chrome` — the editor-page chrome api
(`editor-page-chrome.js`, `{ name, dirty, saving, diverged, save(),
rename(), reload() }`) — opens the `file` dock panel above the canvas,
rendered by `DesignerFilePanel`: the name with in-place rename, the
divergence refresh, and the dirty-marked save. The bound dirty state
registers on the workspace page-dirty registry under the hosting page
key, so pane-close confirmation follows the editor wherever it mounts.
The file panel and the canvas panel are structural: neither is
closeable, and the canvas header's ellipsis menu carries the toggles for
the content panels (palette, inspector, preview, commands). The bottom
command bar is the `commands` dock panel below the canvas: it carries
the canvas commands through `DesignerToolbarItems`, docks and drags like
every other panel, and its ellipsis toggle reopens it. An `ownsChrome` file surface (the `graph-editor` binding) owns
its whole page on every mount: the standalone route fills the
viewport, the workspace pane tab renders the editor flush with neither
header nor lineage strip, and the record page renders the editor with
the pane's Back control alone above it.

The dock sits in a padded wrapper so the pane boxes keep their outer
gutter. Every item in the commands panel and the ellipsis menu renders
through `DesignerToolbarItems` — one icon-only geometry for every item;
a boolean-pressed item is the same button outlined with an aria-pressed
state, label as tooltip/accessible name. Every
canvas-capable designer exposes the same first-level zoom cluster in
the canvas group (zoom out, zoom in, reset/fit — plus frame selection
on graph canvases), undo/redo where the editor owns a history, and
content operations with the destructive item last in its group;
DrawingCanvas hides its internal zoom cluster in designer mode and
exposes the commands for the panel instead. A designer may position
feature-local handles and popovers inside its canvas cell. Slot content
compiles in the parent scope, so designer code drives panels through the
workspace ref API (`panels`, `toggle`, `setPanel`, `openPanel`).

Items are plain data —
`{ icon, label, onClick, disabled?, loading?, pressed?, onIcon?, hasPopup?, separator? }`
with `icon` a PrimeIcon class.

Touch hosts navigate canvases with gestures, not mouse emulation:
DrawingCanvas pans with one finger in viewer modes and pinch-zooms/pans
with two fingers in every viewer/designer mode (designer keeps single-finger
taps for face/edge interaction), Vue Flow graph canvases pan with one
finger and pinch-zoom natively on coarse pointers, and the Three viewports
keep their OrbitControls touch handling. Gesture-owning canvas roots
declare `touch-action: none` so the page never claims the gesture.

### `DesignerSurface.vue` and `DesignerDialog.vue`

`DesignerSurface` is the shared full-height flex boundary for every operational
designer before it mounts `DesignerWorkspace`; it works consistently in routes,
generated workspace panes, and dialog content. `DesignerDialog` is the only
dialog host for standalone designer launches. It fills the viewport and mounts
its content through `DesignerSurface`, so a cassette designer opened from an
entity action uses the same sizing contract as route and pane designers.
The host keeps the preset's dialog-content padding; its scoped PrimeVue integration
owns only the flex sizing needed for the designer surface.

The `scene` group is feature-owned. It must carry selectable item metadata
in `object.userData.designerItem`; non-selectable helpers set no such value.
The viewport disposes geometry and materials when its scene changes or it
is unmounted. It never persists geometry or interprets domain-specific
metadata.

### Graph designer contract

Use a feature-owned graph document for any designer that needs editable
nodes. The graph document must declare a schema version, nodes, edges,
outputs, and any typed public parameters. The designer validates socket
compatibility and acyclicity before save; the feature owns its evaluator
and persistence.

The shared workspace does not prescribe graph node kinds or a graph
evaluator. The process designer owns business-flow nodes and a future
geometry designer may own curve or mesh nodes. Do not reuse a graph
evaluator across domains merely because both editors render nodes with
VueFlow.

## Status & History (`components/shared/state/`)

### `InstanceState.vue`
Interactive status surface for display + state-machine transitions on the
shared instance chrome (cards, pages, tab chrome). Status-changing action
buttons must live here (not in parent layouts).

Props: `:instance`, `type-id`, `variant` (`icon` | `inline` | `full`), `:actions` (optional lifecycle override set for workflow-driven surfaces), `:expanded` (optional override).
Rendering guard: the component renders only when the resolved flat display
exists — the instance carries a non-empty `state` value AND the type has a
served state vocabulary. A type the organization's process authored no states
for renders no state surface at all.

**Flat state contract (SPEC §7):** the value is the instance's flat wire
`state` string; the vocabulary and display policy derive client-side from the
compiled producer workflows the hydration payload carries, through
`statePolicyByType` / `stateDisplayFor`
([shared/ui-mapping](../../shared/ui-mapping/README.md) — the canonical
contract; generated screens resolve through the same functions, so there is
one resolution chain, not two). Dotted values render as segmented paths
(ancestor segments muted, leaf styled) exactly like the generated
`StateTag`; unknown values degrade to the neutral stop-line chip.
There is no registry `states` facet read, no `@perigram/domain-cnc`
workflow fallback, and no v24 `status` block read — those axes are retired.

**Transitions** load from the canonical status API
(`/api/state/actions`), which applies the process-compiled workflow
server-side, so access and preflight filtering stay server-side; labels,
severities, and icons for action targets resolve through the same flat
policy. When an action includes `intent`, `InstanceState` posts that intent
with the target state so frontend components do not infer business meaning
from raw state names. When a target state lifecycle schema declares a
description, attachment slots, or snapshots, `InstanceState` opens
`StateTransitionDialog` before running the transition; the dialog uploads
proof files through `/api/files/upload` and submits
`stateMeta.metadata.note` plus `stateMeta.lifecycle.attachments` to the
status API.

Successful server transitions emit the `transitioned` event from
`InstanceState`; matching browser-local instance-change events emit `refresh`
from the status component itself. `InstanceCard` forwards
both as `refresh` on its shell, so instance-specific cards can
reload instance-local data after lifecycle changes without wiring listeners
in each card. Status transition results and failures are surfaced through
PrimeVue toast messages. Failed transitions also refresh server actions and
emit `refresh`, so stale popover actions are corrected after backend
preflight rejects an action.
The root exposes stable E2E hooks through `data-instance-status`,
`data-type-id`, and `data-instance-id`; menu triggers and transition buttons
use `data-status-menu-trigger` and `data-status-action`.

Card and page command actions must live outside `InstanceState` in the card
footer or page action slots; only real lifecycle transitions belong in the
status surface.

### `StateHistory.vue`
Fetches and displays the audit log (`status_events`) for any instance.

Props: `:instance`, `type-id`, `target-id`, `mock-events`, `compact`.
Steps are states: events group under the state they occurred in, newest
state first (the latest state leads). A `StepItem`'s `Step` header carries
the state badge alone (the stepper's number bubble stays hidden — the badge
is the marker); its `StepPanel` lists the events recorded under that state,
newest first, with the newest state's panel open by default — one panel
open at a time, the stepper's own accordion.
Step badges resolve through the flat state contract: the type's policy map
(`statePolicyByType` over the hydration payload's compiled producer
workflows) drives each historical value's label, severity, and icon through
`stateDisplayFor`, with the raw `toStatePrimary` remaining the state
identifier, not the display contract.
Each event row carries its actor display name, timestamp, and evidence:
notes, lifecycle proof attachment refs as download links, snapshot count
chips, field edits (the changed leaves with from → to), and payload
revisions (the minting reason with its version and a restore's source
revision — SPEC §24). Timestamps render inside the event row, never in a
separate fixed-width side column.
Persisted events may include response-only `actor` data from the status API.
`StateHistory` prefers the event's first-class stamp actor — the persisted
`label`/`name` for display and `id`/`userId` for the chat action — and falls
back to `status.userId`-derived display only when the event predates the
stamp. Service/system principals render the localized system actor label
and get no chat action.
User actors render as their display name with an icon-only chat action that
opens the support chat in direct user conversation mode for that actor. An
event whose user record is gone renders the localized unknown-user label
rather than a raw id.
Structured v2 events prefer `toStatePrimary` for the visible badge and keep
`region` available for grouped status surfaces.

### `DrawingCanvas.vue`
Shared SVG canvas for layer-aware drawing surfaces. It accepts normalized geometry previews, baked cassette `layerData` / `polygonParts`, DXF text/URLs, SVG URLs, legacy parametric cassette graphs, and OCCS cassette definitions with Perigram graph-tree extensions; owns layer visibility by default, viewer pan/zoom, cassette designer edge actions, shared viewer grid/stroke presentation, and layer-to-pen resolution through `utils/drawingPreview.js`. Viewport navigation is pointer-class aware: mouse wheel zooms at the cursor and drag pans (Shift in designer mode), while touch input pans with one finger in viewer modes and pinch-zoomes/pans with two fingers in every viewer/designer mode; designer mode reserves single-finger taps for face/edge interaction. `cadcraftNavigation` follows CadCraft's mouse law instead: a notched mouse wheel zooms at the cursor with the engine's exponential step (scroll up zooms in), a touchpad-style scroll pans with the fingers, middle or right drag pans, and a middle double-click refits, so a surface that drives a CadCraft host keeps one gesture set across its assembly and edit modes. The canvas root declares `touch-action: none` in viewer modes so the browser never claims a canvas gesture for page scrolling or zooming. A host that runs one canvas session across renderers reads and restores the camera through the `getViewBox` / `setViewBox` expose. `showGeometry: false` leaves the interaction overlays, dimension edit targets and the camera to the SVG while a host paints the geometry and the dimension labels behind it; dimension edit targets resolve from the drawing's structured `dimensionAnnotations`, with dimension-layer text labels as the fallback; a target carries the annotation's selection metadata (target type/id, shape id, field key) into `designer-point-edit`. The `view-change` event and `getViewportSize` expose feed that host's camera.

All drawing sources normalize to the same layer contract before rendering: `{ viewBox, layers: [{ name, standardCode?, paths }] }`. DXF layers keep their source layer names and optional mapping. Parametric cassette previews render through the same layer list and may provide caller-owned `layers.face` / `layers.boundary` metadata; if no layer metadata exists, they render as a neutral `geometry` layer instead of guessing production standards. Layer paths may be SVG paths, images, raw SVG snippets, or text primitives; text primitives are used for CAD-style dimension labels on semantic annotation layers such as `dimension.cassette`; labels with `designerControl` metadata stay in the layer output, and selected/hovered designer faces get compact chip overlays at those label coordinates that emit `designer-point-edit`. Designer overlay chip text uses PrimeVue `--p-content-background` against `currentColor` chip fills so labels keep contrast in both light and dark color schemes. Designer edge, fold-edge, face-select, point-edit, and section-edit hit overlays are overlays, not drawing layers. Free edge handles use invisible edge hit lines only for hover and show a `+` chip on hover; only the visible chip emits `designer-action` with the edge's source `edgeIndex`. Fold edge handles emit `designer-fold-select`; the fold angle chip is shown only when hovered or when that fold's child face is selected, then emits `designer-fold-angle-edit`. Designer face overlays emit `designer-face-select`, show hover feedback, highlight `selectedDesignerFaceId`, and open dimension labels through `designer-point-edit`. With a host-rendered canvas, face and profile fills are host-owned; the SVG overlay keeps hit areas, hover/selection highlights and chips. Trapezoid faces expose width and height dimension labels; corner geometry is authored in the face shape editor. Placed-profile hit overlays (`drawing.designerProfiles`) cover each placed section and open-chain copy, emit `designer-profile-select` with the profile's workpiece and relation ids, highlight `selectedDesignerProfileId`, and follow the `designerProfileSelectable` gate. Designer chips, handles, and hit strokes keep their screen size across zoom. The geometry normalizer carries `dimensionAnnotations`, `designerFaces`, `designerProfiles`, `designerFoldEdges`, `designerSections`, `designerEdges`, and `designerAttachmentMarkers` onto the rendered drawing. Designer assembly context can render non-interactive transparent workpiece outlines and source/target attachment markers while limiting face hit targets to caller-provided selectable workpiece ids, so background workpieces do not steal active face clicks. Designer section graphics belong to the caller-provided `code.cassette_mark` layer, so layer visibility toggles them; the section overlay only emits `designer-section-edit` from invisible draggable section-plane hit targets while that layer is visible and releases document-wide on mouseup. The authoring overlays — free-shard `+` chips, the fold-angle chip, section drag handles, and point-edit targets — render only while `designerEditable` is true (a read-grant editor mount passes false); the selection overlays stay.
Cassette Designer v2 hardware placements are expanded by the OCCS renderer into
`code.cassette_mark` schematic paths, `cut.inner` hook polygons, `cut.hole`
fastener circles, boolean-shaped face paths with `fillRule: evenodd`, and
designer markers before they reach `DrawingCanvas`. The shared canvas renders
those layers but does not own hardware family, production-mode, curve-boolean,
or edge-array placement math.

Layer colors resolve in this order: explicit source layer mapping, caller-provided `standardCode`, standard-code fallback from the layer name, source layer styling, then the default pen. Stroke widths render at 2 px per pen-unit weight, bounded 0.5–4 px, so the layer standards' relative weights survive on screen. Geometry previews that provide `standardCode`, `code`, or a dot-code layer name load layer standards and pen templates before normalization; concurrent canvases share one in-flight load and reuse the completed catalogues within the active user and organization scope. When a standard exists but its configured pen is missing, the source layer `color`/`weight` is preserved. Standard and pen rows are §3 instances — the canvas reads `fields.code`, `fields.defaultPenId`/`fields.orgPenId`, and `fields.stroke`; plugin-delivered drawings arrive with their own standard pens already baked (the facade plugin ships its layer standards beside its renderer), and org-authored standard rows shadow those codes host-side. Card and thumbnail canvases choose a portrait or landscape aspect from the resolved viewBox so sheet-layout previews are not forced into a wide frame, and they own that aspect-ratio height instead of requiring parent cards to provide a fixed height. Canvases embedded in a fixed-height card preview band instead opt into `fill`: they paint no own border, rounding, or background (the host card owns the chrome), fill the band bounds exactly, and scale the SVG to cover (sketch scenes, uniform scale, cropped) or contain (vector drawings). Preview-mode `dimension.*` text is intentionally enlarged so card bands keep dimension labels readable, and geometry-normalized layer-data previews include dimension text points in the viewBox bounds so those labels are not clipped. Generic baked `geometry.type === 'dimension'` entries render as extension lines plus an offset dimension line with the text placed off that line, instead of a raw midpoint label on the measured segment. Use this component for file payload previews, cassette thumbnails, mapping previews, and designer canvases instead of duplicating SVG render logic in feature components.
Layer-standard pen references may point to either the pen Mongo `_id` or its
canonical `identity.uid`; both resolve to the same pen DTO.

The optional viewer layer panel is part of the shared canvas surface but must
render Perigram concepts through existing Perigram system components. Source DXF
layer names render through the identity policy helper; mapped layer standards use `LayerStandardCard`;
resolved pens/colors use `PenTemplateCard`. Inline color dots, hand-rolled
layer rows, or custom key/value renderers are not allowed for these entity
concepts. PrimeVue controls are limited to non-entity interaction chrome such as
visibility checkboxes, show/hide buttons, scroll containment, and count tags.
Surfaces that need their own panel, such as the facade plugin's cassette designer, pass
`visibleLayerNames` and handle `layer-toggle`; in that controlled mode
`DrawingCanvas` renders only the selected layer names and does not reset
visibility during drawing refresh.

Current drawing display owners:

| Surface | Source type |
|---|---|
| `GeometryPreview.vue` | `geometry-preview` |
| `FilePayloadViewer.vue` | `dxf-url`, `svg-url`, `sketch`, `graph` |
| `/test/ui-lab` | `geometry-preview` demo |

New drawing previews should add a source normalizer for `DrawingCanvas`, not a feature-local `<svg>`.

### `GeometryPreview.vue`
Entity-card wrapper around `DrawingCanvas` for design and remnant geometry.
Reads `entity.data.geometry.preview` first and falls back to
`entity.data.geometry.data`, `entity.data.geometry.points`, or polygon data such
as `entity.data.geometry.data.polygon`. The canvas root marks itself an
interactive card child and claims its clicks so parent card opens never
steal pan/preview clicks; trigger surfaces (inline refs, tiles, peek
bands) pass `:interactive="false"` and the trigger's own click behavior
owns the click.

Use this for DXF-derived layer previews and polygon remnants instead of displaying file ids, queue ids, or static filename fields in entity cards.
When callers pass `hideDimensionLayer`, geometry previews keep production
layers such as sheet/stock, cut, fold, and bend layers in compact cards while
suppressing dimension annotation layers so in-card sheet-design previews stay
readable. `fill` opts a host-owned fixed-height band in (DrawingCanvas
`fill`): the canvas drops its own frame and fills the band, so exactly one
surface — the host's — frames the preview.

### `GraphOutputView.vue`
The one graph-output value renderer: selects the best supported
representation from `utils/graphOutputViews.js` and mounts text (including
numeric and boolean scalars), Markdown, tables, images, document links, the
interactive `Scene2DViewer`, or the interactive `Scene3DViewer`; JSON is the
explicit fallback view. The selected output port's declared representation
chooses the scene viewer even when the value omits the marker. The `fill`
prop makes the scene viewers consume their parent's height. The graph
editor preview, outputs channel, and Page graph-result embed all render
through it.

### `Scene3DViewer.vue`
The host's common interactive 3D viewer for `perigram.scene-3d` graph values
(`{ representation, vertices: [[x,y,z]], faces: [[i,...]], edges?, normals? }`
in millimetres, right-handed Z-up). It renders a real WebGL scene through
three.js: depth-correct occlusion, basic lighting/material display, orbit,
pan, zoom, fit, and face selection with a highlight overlay. The camera is
Z-up and `OrbitControls` supplies the pointer, touch, and wheel gestures;
the fit control or double-click frames the scene bounds. `fill` sizes the
viewer to its parent with a 12rem floor; the default is a 20rem band.
`utils/scene3d.js` `scene3dGeometry` validates the value, triangulates
polygon faces, derives unique edges from face loops when none are declared,
and keeps source vertex indexes stable.

### `Scene2DViewer.vue`
The host's common interactive 2D viewer for `perigram.scene-2d` graph
values. It renders the declared primitives (`line`, `polyline`, `polygon`,
`circle`, `rect`, `text`) in an SVG viewport, computes bounds from
`bounds` or the primitive extents, and pans, zooms, and fits on the same
gesture grammar as the 3D viewer. `fill` sizes the viewer to its parent
with a 12rem floor; the default is a 20rem band.

### `FileChip.vue`
The app's one file chip (SPEC §22.8): the file's name, its file-type
glyph from the generated file-type icon family, the bordered subtle chip,
`name · size` on hover. A prose host passes `prose` for the inline-code
face. A descriptor carrying a stored `fileId` or a
direct `url` is openable; the peek resolves only for stored files with a
renderable mode (image, svg, pdf, text, dxf, graph through
`resolveAttachmentPeek` in
[file-preview-contract](../generated/README.md)) and raises its payload peek
on hover (SPEC §22.14) — the framed media band plus the name and
`mime · size` strip; the click stays the consumer's `open` event.
Accepts either wire shape (generator blobs and chat attachments).

### `InstancePeek.vue`
The record peek body (SPEC §22.14): the compiled record surface in its
peek presentation. `scopedDetailScreen`
([generated surfaces](../generated/README.md)) binds the compiled
detail screen (or the synthesized pair, or the record floor) to the
record; `GeneratedScreenHost presentation="peek"` renders the record
preview, the lineage trail with the record name as its last crumb (or
sole crumb), the state tag, the record's action cluster, and the
body's leading fact group, and the popover body provides the measured
`popup` container profile. Rendered inside
[`HoverPeek.vue`](#hoverpeekvue) by every instance-chip trigger; the
trigger gates the peek on the record being openable. Identity opens from
the generator swap the peek subject in place; the header's step-up
affordance opens the record as its own workspace page.

### `HoverPeek.vue`
The hover peek host (SPEC §22.14): the one delayed-hover preview surface.
The default scoped slot receives `peekEvents` (`mouseenter`/`mouseleave`)
to spread onto the trigger element; `#preview` carries the peek body.
A deliberate hover delay (300 ms) raises the anchored `Popover`, leaving
the trigger or the panel dismisses after a grace period that lets the
pointer cross into the panel, and hovering-capable pointers alone engage
it — touch hosts keep the click path. Opening another surface (a
workspace page or instance tab) dismisses the panel. A click on the peek
body emits
`open` (nested interactive controls keep their own clicks). The panel is
a 20rem column capped at 30rem height riding Aura's own chrome — the
preset's popover padding
spaces the body from the panel border, media bands frame themselves as
the bounded band scaled to the panel, and the body composes its preview
and leading facts without a scroll container.

### `chip-surface.js`
The chip recipe home: `CHIP_LABEL_PT` (the truncating label passthrough),
the default `FILE_CHIP_CLASS`/`INSTANCE_CHIP_CLASS`, and the prose
`FILE_PROSE_CHIP_CLASS`/`INSTANCE_PROSE_CHIP_CLASS`. Every chip the app
renders — file chips, instance chips, `InstanceCard`'s inline card
identity chip — consumes a recipe here; a second copy of a chip class
string is a defect.
The default face keeps the preset's chip geometry — padding, pill radius,
and icon box — and carries the clamps, the border, and the surface role:
`bg-subtle` for files, transparent for instances.
The prose face carries the inline-code layout for page text blocks and
their read composition: an inline Flex box in the UI font at em size
(`0.875em`), em-based padding (`0.5em` horizontal, `0.25em` vertical),
the small surface radius, baseline alignment, and a line height of one.
The `ck-chip` marker reasserts that padding inside the markdown editor,
whose descendant reset zeroes padding. Generated-family icon glyphs
(`ck-entity-icon`/`ck-file-type-icon`) drop their standalone scale inside
prose chips, so every chip icon fills the same em box. An unresolved
instance reference wears the same chip face. Collection counts render as
a `Tag` with `secondary` severity.

### `InstanceSelect.vue` / `InstanceMultiSelect.vue`
The entity dropdown wrappers: options carrying an entity render as
one-line instance option rows (below) in the option list; plain options
keep PrimeVue's label rendering. The single picker's closed control is a
trigger (SPEC §22.13): a button opening a popover hosting a filtered
`Listbox` of option rows, with the selected instance rendered as the
instance tile beside the control — never inside it. The filter matches
the identifier label through the one derivation, `instanceRecordTitle`
over the served type view, with the wire name, the option's label, and
the unnamed fallback standing in until the title resolves. An option is
entity-bearing when it carries an `entity` (or is itself) a record with
an id slot plus one of the record dialects — an `identity` block or the
flat §3 `fields` object — and a type id resolves (the `typeId` prop, the
option's `typeId`, or the entity's). The single picker's popover carries
the create affordance (SPEC §22.13 create amendment) when the host
passes compiled create actions for `typeId`: the created record leaves
through `create-select` (`{ type, id, entity }` — hosts own their model
shape) and a construct create through `construct-create`. The multi
wrapper shows selected
instances as glyph chips inside the control (PrimeVue chip display, the
chip-surface recipe). Option lists over an instance pool build through
`instancePickerOptions`
([utils](../../utils/README.md) — the one derivation: identifier-field
label, type-prefixed for multi-type pickers, value, entity, type id);
`instance-select.spec.js` owns the direct-import guard (plain enum
selects use PrimeVue directly). The wrapper preserves a caller width
utility on the PrimeVue select; only a select with no width utility
defaults to `w-full`.

### `InstanceInlineRef.vue`
Compact embedded entity reference for relation rows inside cards and details.
When only an id is provided, it resolves the DTO through the entity store's
access-filtered optional-reference lookup (with a directory-card fallback for
the framework party types, so cross-tenant users and organizations still
resolve to their name-level card). Registry-bound types render their
design-system card with `variant="inline"`; the card root lays out inline
and its identity chip wears `INSTANCE_CHIP_CLASS`, so those refs share
the relation line and default chip face with every other ref. An id-only ref
resolves once per record identity:
pool re-renders hand it a fresh entity object for the same record and the
chip keeps its instance (an open peek stays open), while the store's
record cache serves the repeated lookups. The peek hosts the served type
id — the pool key and the screen vocabulary — while ref spellings may
alias (`entity_revision` → `entity-revision`). A ref carrying a `revision` pin renders the lock glyph
beside the chip (SPEC §24: the ref consumes that revision whatever the
source's current payload holds). The record preview popup is the shared entity popup
([`EntityPopup.vue`](#entitypopupvue-with-useentitypopup): the referenced
record's compiled detail screen — or its record floor — in the standard
dialog); the chip, the
compact micro card, and the referenced entity card all open it through
`useEntityPopup`'s `open`/`openable` seam, so a type absent from the
served type view renders an inert
chip — no dead link. An openable chip or micro card states its
interactivity on hover: one step up the surface ladder
(`hover:bg-subtle`) beside the pointer cursor. `interactive: false` renders the inline card
non-expandable for non-interactive rows such as explorer entries and static
summaries. Contextual relation operations (the owner-bound Unlink a
relation gallery passes through `contextActionEntries`) render as the ref's
own ellipsis menu and execute through the surrounding generated screen's
action executor (`generatedExecuteAction` provide) — process actions never
run from shared UI code, and with no executor in scope the ellipsis stays
away. An entry is `{ action, entity, context }`: the manifest action
record, the owner instance, and the launch context carrying the relation
payload. Use this
for entity relation
context where an always-expanded nested card would overload the surface; do not
render extra lifecycle badges next to these relation chips because status
belongs on the actual entity card/detail.
Inline chips are the raw PrimeVue `Chip` — icon plus truncating label,
Aura's own chrome. The `prose` prop swaps in the inline-code face for
page text blocks and their read composition. There is no per-type tint: a tone mapping would mean
branching on authored type names inside shared code, and per-type
presentation vocabulary rides declarations (the registry's `glyph` is
the model) — no tone declaration exists, so none is synthesized. The
Chip is the popup trigger everywhere the ref renders — chat
message refs read as chips, not inline text — keeping the one-line,
no-line-height-inflation behavior inside prose and dense surfaces
(tables, field controls, relation rows) alike. The chip is also the peek
trigger (SPEC §22.14): a deliberate hover raises the record's peek —
[`InstancePeek.vue`](#instancepeekvue), the compiled record surface in
the peek rhythm — and the click — on the chip or on the peek body —
opens the record popup. Generated card identity chips (the
preview-dominant tile's overlay badge) are peek triggers too, opening
under the collection's onOpen contract.
`variant="compact"` renders a horizontal micro card instead of a chip —
but only when the type's compact surface earns the card: a preview band
or compact fact rows beside identity. Preview-less, fact-less relations
degrade to the plain identity chip (still the popup trigger), so
relation galleries never lay out grids of empty cards for data without
visual fields. That
compact ref uses the compact surface contract directly: a real preview on the
left when the entity has one, the same semantic inline chip for identity on the
right, a read-only status badge under identity, and compact facts below.
The whole card — the preview band included — is the open trigger:
previews inside ref, tile, and peek bands mount with
`InstancePreview :interactive="false"`, so the drawing canvas claims no
click of its own there.
`variant="option"` renders the one-line instance option row
(SPEC §22.13) pickers consume: a preview thumb (the type glyph when the
type serves no preview), the truncating identity label, and trailing
state tag plus type-label meta (`showTypeLabel`, for mixed-type lists);
every option renders the same row shape whatever the type serves.
`variant="tile"` renders the instance tile (SPEC §22.13, owner
direction 2026-10-29) — the one small-card face for an instance
reference on a panel: the §22.8 side-preview anatomy at row scale,
composed from the shared layout recipes (`LAYOUT.previewSideRow`,
`LAYOUT.rowBetween`, `LAYOUT.labeledBlock`) on the §22.9 spacing ladder —
the framed preview thumb, identity with type glyph and state tag, and
compact facts. A tile row carries no lineage breadcrumb: the trace
chain owns lineage, and a homogeneous panel renders its shared context
as one chain at the section. The tile
owns its row chrome: `active` marks the selected member of a working
set with the primary border, `selectable` turns the row into a list
option whose activation emits `select` instead of opening the record
popup, and the `trailing` slot rides the row's trailing end (the
chip-removable convention for a working set's remove). Panels that
surface records as small cards compose this tile; panel-invented card
chrome is a defect.
`compactLayout:
'stacked'` (chat preview cards) swaps the row for a flush preview band over
a one-line label strip whose small state tag rides beside the truncating
identity. Icons stay with the
identity chip and are not used as fake preview images. Generated card relation
galleries use a bounded responsive grid instead of in-card horizontal
scrolling; compact galleries show two refs and then an in-grid overflow tile so
cropping remains visible inside the card.
Use canonical design-system surface keys for new references, for example
`cassette`, `sheetDesign`, and `entityRevision`. Backend snake-case aliases
continue to resolve through the
domain UI adapter for compatibility, but they should not appear in new entity
component templates.
Inline reference hydration uses the entity collection boundary rather than the
protected detail route. Unreadable, stale, or deleted relation/provenance ids
therefore fall back to an id chip without producing expected 403/404 browser
failures; direct detail navigation retains its normal authorization errors.
Callers can pass `:fetch="false"` when the parent surface intentionally has
only a scoped relation id and should not probe a protected entity endpoint. In
that mode `InstanceInlineRef` renders the typed id chip unless an `entity` prop or
`entityContext` match is available.
When an `entityContext` provider is present, `InstanceInlineRef` resolves the
entity from that context before calling the API. This keeps workbench fixture
and project-local previews from requesting protected entities already loaded in
the surrounding surface.
Cassette and sheet-design compact refs
suppress dimension annotation layers in their micro preview so annotation text
does not overpower the gallery thumbnail.

### `UserChip.vue`
The user identity chip: a small plain avatar plus display name (no chip
chrome — caption-size caption line, not a boxed control) for person
identity in conversation surfaces — member list popups, the composer's
reply quote — replacing the generic inline-ref face for users. The
`avatar-only` variant renders the avatar alone at message scale (h-9)
for the thread's sender gutter. That face is
wrong for people: `InstanceCard`'s inline variant renders the type glyph
plus the identifier-flagged field (the served `user` type declares
`identifier: "name"` and the users glyph) and carries no avatar slot, so
inline user refs read as "users-icon + display name" and other users' avatars
never render there. The chip resolves its user through the instances
store's readable-reference seam, whose two legs speak two shapes:
org-mates resolve through the §3 user wire (`name`, `fields.bot`,
`fields.avatarUrl` — CTS SPEC §13 party projection), everyone else
through the directory card (`identity.name`, `data.avatarUrl`), and the
avatar image endpoint is open to every authenticated caller, so
the avatar renders for any reachable person, not just the viewer (the
letter label renders only while no image resolves — PrimeVue `Avatar`
renders label over image, so a constant label hides every avatar; see the
style guide in [components/README.md](../README.md)). A resolved user
carrying the bot marker renders the shared AI face
([`AiAvatar.vue`](#aiavatarvue)) instead of image or letter. The `online`
prop overlays the presence dot (the connections layer's
active-organization scope) — the caller owns the id set; the member list
popover is the consumer. A click
opens the shared entity popup (`useEntityPopup` → the user's directory
profile).
Keep person identity displays on this chip; keep entity refs on
`InstanceInlineRef`.

### `AgentActivity.vue`
An agent run's chronology: reasoning in collapsible `Fieldset`
disclosures and one small typed `Message` per tool invocation — the
localized tool name (`support.agentTools.*`, raw-name fallback), the
call's `detail`, the error of a failed call inside the same message;
severity by outcome (`info`/`secondary`/`error`) with the status glyph
as the icon. The pre-step presence rides the host's typing line. The `pt` adds only what tokens cannot express: the caption-size,
regular-weight label, the +/− svg (`.p-icon` pins 1rem), the
chronology's tighter root, and the collapsed state —
tracked through the toggle event beside Fieldset's internal one —
which drops the box's border while the legend strip keeps its filled
surface and its exact horizontal position, so a collapsed disclosure
reads as kin to the tool messages and nothing shifts. Compact geometry (legend
padding/gap, root insets) lives in the PrimeVue tokens and applies to
every Fieldset. Rendered both
for a live run and for the `agent` provenance persisted on a bot's
reply. A live disclosure collapses once the run moves past it — a later
step or a streaming answer — while the persisted chronology starts
open; the collapsed state stays the user's own toggling over that seed
([chat SPEC](../chat/SPEC.md) Live thought). The answer is
never rendered here: it is the message body at both sites.

### `AiAvatar.vue`
The AI identity face: the microchip PrimeIcon in the brand accent on
the subtle surface — the same shape as every other glyph avatar, and
the only AI marker on chat surfaces (no text badges). One component
for every surface that shows the assistant (chat inbox rows, thread
headers, pickers, the bot panel) and for bot-marked users inside
[`UserChip.vue`](#userchipvue). Sizing rides class fallthrough onto the
underlying `Avatar`; chip-size sites shrink the glyph through
`[&_.p-avatar-icon]:text-supporting` because Aura pins it at a fixed
size.

### `ChatBotPanel.vue`
The chat bot panel (`StandardDialog`): the organization AI's contact row
— the shared AI face ([`AiAvatar.vue`](#aiavatarvue)), the assistant
tag, the per-conversation join switch (group/instance threads only —
direct chats need no membership), the room's model pin, and its
lifecycle wake rules (type + state with an optional profile) — backed
by [stores/agentBots.js](../../stores/README.md). Wake rules speak
display labels everywhere — type names through `generatedEntityLabel`,
states through the flat state policy (`stateDisplayFor`), profiles
through the model-pin labels — raw type/state ids never render. The
trigger lives on group and instance thread headers.

The chat column family (inbox rail, thread, message list, composer,
search) lives in [components/chat](../chat/README.md); the atoms below
stay shared primitives.

### `InstanceTree.vue`

The one instance tree every picker browses (SPEC §26, §22.13): a PrimeVue
`Tree`, unmodified Aura. Home-screen sections are the roots and load
through the SAME compiled home-screen list sources the home sidebar's
PanelMenu renders — the instances store's `listInstances` with the
source's resolved filters — so the picker browses the full user-available
window (shared observation cache, no option-list cap). The
collection-view picker mounts it for its parent-record step. Entities expand
through pure lineage nesting (`linkedExplorerChildSources` list fetches;
relation links are skipped so the tree stays a hierarchy). Search is the
Tree's built-in lenient filter; the sections load on first sight and the
list stays searchable before the author expands anything. Entity labels
resolve through `instanceRecordTitle` over the served type view; each
entity row renders its type glyph beside the truncating identifier as
one tree row. The
section's generated create entries list beside the entity entries — and
every entity repeats the pattern through its type's detail-screen child
creates — when `showCreate` is on. Lazy loading is node-driven
(`@node-expand` carries the section/entity payload directly, so loads are
never routed by key-prefix parsing). Rows select; chevrons only expand.
`reset()` reloads sections for a fresh open; `focusFilter()` lands the
caret in the search field. The host owns the picked record, the
create-action flow, and file staging; the tree emits
`select`/`create-action`.

### `ChatAttachmentPicker.vue`
The chat composer's attachment surface: a Popover hosting the shared
`InstanceTree`, with leading file entries above it — files and entity refs
share the one attach surface: device upload constrained by the host's
`filesAccept`, and camera photo/video capture (`capture="environment"`; on
desktop browsers the capture hint degrades to the platform picker). Both
emit `files` for the host to stage, through the same caps and
instance-chat gating. Tapping an entity selects it and closes the picker;
tapping a create entry runs the generated flow in the host and attaches
the created entity. Each open resets the tree so it reflects the current
workspace pool. Recipient chat-only visibility is NOT computed here: the
support service derives it on send and on draft hydration through the
instance-options endpoint (see
[support feature](../../server/features/support/README.md)). The host
owns the draft `entityRefs`, the create-action flows, and file staging;
the picker only emits `select`/`create-action`/`files`.

### `InstanceCard.vue` (chat entry)
Full cards carry the composed instance-chat entry in the footer row (before
parent footer actions); the inline/compact faces open the shared record
popup, whose detail surface carries its own conversation entry. The entry
routes
through `utils/instance-chat.js`, so the surface the card lives on decides how
the thread opens (desktop drawer, mobile `/chats` target). The thread kind
follows the support conversation contract at the seam itself: a `user` target
opens the **direct** 1:1 conversation (the inbox-listed thread, matching
status-history actor chat); every other type opens the composed instance
thread. Popup-originated threads (comments and chat actions, the floating
launcher) render in the shared bottom-right chat popup
(`ChatSupportDialog`: the token-sized, non-modal drawer card), whose expand
action pins the conversation as a home-workspace pane tab (mobile has no
tabs: expand routes to `/chats` with the thread preset through the
shared chat target, consumed on chat mount); the sidebar
PanelMenu's Chats entry opens that general chats pane tab directly. The
thread header's title opens the entity popup (`EntityPopup.vue` +
`useEntityPopup`) — titled by display name (never an id); group headers
carry member chips inline through [`UserChip.vue`](#userchipvue).

### Detail-surface conversation entry
The record header's comments entry owns the record's conversation
(SPEC §22.17): on page hosts it opens the record's thread as the page
host's bounded side panel ([chat](../chat/README.md)
`RecordCommentsPanel`, mounted by the routed page, the screen pane, and
the workspace page host); hosts without the channel (the record popup)
and the compact peek route through `utils/instance-chat.js` into the
shared chat popup (a user-typed record opens the direct thread; every
other type the composed instance thread). `InstanceChatEntry.vue` is
the same seam as the composed icon-only chat button for
`InstanceCard`
footers. Directory-shaped surfaces
(organization overview, directory detail) call the seam directly with
their `identity.name` display source.

### `EntityPopup.vue` (with `useEntityPopup`)
The shared entity popup — the one record preview popup: the standard centered
`StandardDialog` (size
`md` for directory profiles, `xl` for instance detail screens; the dialog
content is the one scroll surface) hosting the entity's real detail
surface — the directory
profile for `user`/`organization`
([components/directory](../directory/README.md)), and the compiled detail
screen through the generator host
([components/generated](../generated/README.md)) for instance types. It
provides the measured `popup` container profile: the dialog body's real
width drives arrangement budgets and the profile's compact density tier
rides the hosted rhythm (SPEC §22.14).
Inline refs, compact micro cards, and inline entity-card chips open it
(see [`InstanceInlineRef.vue`](#instanceinlinerefvue)); its expand action
steps the record up to its page, so a ref discovered inside a workspace
still lands in the pane.
The dialog header seats the record header itself: `GeneratedScreenHost`
teleports the depth-0 `SurfaceHeader` into the header target, so the
popup title and its action cluster are the record's one identity
surface, with the icon-only expand action and the dialog's close
trailing them (SPEC §22.8). An action the hosted surface runs
that opens another surface — a workspace tab, the chat drawer — closes
the popup: the popup never floats over a
surface it opened. The
composable's `openable(typeId)` is the guard: a type with a
directory profile, a bound editor surface, a compiled/synthesizable detail
screen, or a served type record opens; a type absent from the served view
has no record surface anywhere (panes stay silent for it too), so `open()`
refuses it and callers (chat thread headers, message links, inline refs,
card chips) render an inert surface instead of a link. Types without a
compiled screen render the **record floor** — a synthesized
single-source detail screen over the served type view (`recordFloorScreen`
in [generated surfaces](../generated/README.md)). The
expand step-up renders only where a page exists: a bound editor page
(graph documents open the unified graph editor), a compiled or
list-synthesized detail screen, or the directory surface for
`user`/`organization` (the active organization's real page
is the org overview system screen, `/organization`); a record-floor
record opens this dialog as
the bounded terminal surface (the item-popup header pattern — the
dialog's own close affordance dismisses; there is no footer). Identity
opens from the generator swap the popup subject in place: any type the
popup itself can host resolves — the emitter's compiled screen key, the
synthesizable detail, or the record floor. Mounted once by
the app layout so floating chrome (chat thread headers) can inspect a
record from any route; the composable state is the single
`open`/`close` channel.

### `SupportMessageContent.vue`
Renders support-chat message bodies as text only. `{{instance:type:id}}`
tokens strip from display — instance refs render attached to the
message through
[`MessageAttachments.vue`](#messageattachmentsvue), beside files and media,
never inline in the bubble (a chip cannot inherit a contrast bubble's
surface). With the `markdown` prop (agent answers), text parts render
through the shared sanitized markdown pipeline
([shared/markdown.js](../../shared/markdown.js)) — plain
text on SSR, formatting on hydration. Markdown mode also lays the root out as
a full-width block column in the prose reading voice (`text-prose` — an agent
answer is a room document; human chat text keeps the UI voice), with the
HTML host wearing `MARKDOWN_ELEMENT_CLASSES` — `ck-markdown-body`, the
pipeline's one element-styles recipe in
[assets/css/main.css](../../assets/css/main.css): the markdown editor's
reading typography (serif document headings at the editor's scale,
paragraph rhythm, code, quotes, rules, table borders). File payload
previews wear the same recipe, so
markdown reads identically wherever the pipeline's HTML mounts. Text
parts wrap with
`overflow-wrap: anywhere` and the `min-w-0`/`max-w-full` chain keeps unbroken
strings (urls, serials) inside the chat bounds instead of overflowing it.
Messages carrying `attachment.kind === 'audio'` render a leading voice-message
chip, which is the inbox preview for attachment-only voice messages. The
`singleLine` prop is the inbox preview mode: the chip row never wraps and
crops to one line, with text spans carrying the ellipsis, and URLs stay
plain text — the preview row is the click target that opens the
conversation, so anchors would steal clicks. Text
parts parse http(s) URLs into safe anchors (`noopener`, inherit-colored so
both bubble sides stay readable); trailing punctuation peels off the link and
stays text.

### `MessageAttachments.vue`
Renders everything attached to a support message — `attachments[]` and
`instanceRefs[]` — as one stacked family under the message body (the
contract lives in the
[support feature](../../server/features/support/README.md) — Message
Attachments). Media flows as one masonry in send order; instance refs
with media render `InstanceInlineRef`'s stacked compact card, preview-less
refs render chips; every ref opens the shared record popup on click. One
image renders at natural
aspect inside fixed bounds (`max-h`); clicking any image opens it centered
in a full-size `StandardDialog` (the standard modal surface; no component
-local lightbox chrome). The dialog previews the message's whole openable
set in send order — side arrows, arrow keys, and a position counter walk
it with wrap-around. Videos render native `<video controls>` players
(bounded width and height); audio keeps the native audio player. Audio and
video players claim the app's now-playing channel on `play` (one media
element plays at a time across surfaces); a source surface unmounting
while its media still plays hands the descriptor and position to the
app-level dock, which resumes playback there
(see [components/media](../media/README.md)). Every
other file renders the shared `FileChip` (the app's one file chip:
mime-aware icon, cropped name, size in the title); a click opens the
in-app viewer when one exists —
PDF through the browser's engine, markdown through the shared formatted
pipeline, other text kinds preformatted; matching is mime-exact, so
office containers download — with the download action beside the
preview's title, which carries the file's mime type and size as
supporting meta. The message menu offers one download entry per
attachment (labels cropped).
The root hugs its content so sender-side message columns can right-align
the block, and every name crops through the `min-w-0`/`truncate` chain.
All media streams the shared `/api/files/download/:id` route honoring
the descriptor's `bucket` when present. The component is pure
presentation over the descriptor list — uploading, materialization, and
transcription stay in the host composer.

---

## Navigation & Links (`components/shared/links/`)

- **`TraceChain.vue`**: The one lineage-chain surface: the record's declared
  containment ancestry as a compact crumb strip, rendered by record
  headers, entity cards, chat, collection identities, and the plugin
  component pack. Always use `:entity="entity"` and an explicit canonical
  entity type—never pass raw ancestry arrays or infer types from lineage
  key spelling. Titles resolve async through the instances store's
  readable-reference seam and the one title resolver (`titleFor`) over
  the §3 wire identifier row; an ancestor whose name never resolves (a
  deleted or unreadable parent) renders its entity type label, and raw
  lineage ids never render. Its `exclude` refs remove explicit ancestry,
  and the active organization's reference is always omitted. In process
  mode the chain follows the effective compiled lineage bindings only;
  non-process routes may use canonical domain containment. Every mount
  renders the full visible path; a chain longer than three crumbs hides
  its middle behind an ellipsis that reveals it.
  Crumbs open the shared record popup (`useEntityPopup`) — the one
  interactive-reference law — and render as plain text when the ancestor's
  type resolves no record surface. `includeCurrent` appends the record
  itself as the final crumb; `currentLabel`/`currentIcon` supply that
  crumb's display (the record peek's identity line).
  Entity card bodies must not duplicate these supported lineage parents as
  `InstanceInlineRef` rows or generated `entityRef` fields; keep body relation
  rows for non-lineage provenance and relations that TraceChain does not own.

---

## Layout Containers (`components/shared/`)

- **`ActionToolbar.vue`**: Responsive title/subtitle/actions row for pages, sections, and tab panels. It owns the semantic display/title/body typography roles. Use it instead of ad hoc heading chrome.
- **`MetricPanel.vue`**: Route-level summary panel for aggregate collection or
  workflow facts. Pages pass translated metric descriptors
  `{ key, label, value }` and may use the default slot for route actions. Use it
  beside reusable entity cards, hub tabs, or workflow tables; do not use it as a
  replacement for entity-specific fact rows or
  `InstanceSurfaceContent`. Vertical metric panels collapse to a two-column
  compact grid below the normal desktop breakpoint and become a stacked rail at
  `lg` and wider. It delegates container chrome to PrimeVue `Panel`; callers own only metric data and layout orientation.
- **`ResponsiveGrid.vue`**: Token-backed responsive grid for cards and
  repeated item surfaces. Variants: `cards` (default), `dense`, `wide`,
  `bounded`. Grid
  children align to the start of each row so cards and panels keep natural
  height instead of stretching to the tallest item.
- **`WorkspaceDock.vue`**: Dockview wrapper shared by the home workspace
  and designer shells — one dock language: bordered pane boxes with chip
  tabs and 6px gutters. Panels use one content slot (`#content` with the
  panel's key) and one tab component; the host supplies item labels,
  icons, close rules, and optional add/split/close group actions. The
  center panel named by `canvas-key` refuses center joins so it stays
  whole. The exposed API covers
  panel open/replace/remove, group add/split/remove, layout
  snapshot/apply, panel presence, and content-based sizing. Panel labels
  update from the host's item list. The dock renders client-side after
  mount; `mounted` gates dockview so SSR emits an empty host. Tab/group
  state persistence belongs to the host (home workspace state and
  designer workspace state, both pruned through
  `utils/workspace-dock-layout.js`, which drops floating groups from
  stored layouts). Theme variables resolve from the app token
  contract in `assets/css/main.css`.
- **`DesignerFilePanel.vue`**: The file panel body — the edited
  document's identity row rendered from the editor-page chrome api: the
  name with in-place rename, the divergence refresh, the
  dirty-marked save, and the optional explicit Apply action. Mounted by `DesignerWorkspace` as the `file` dock
  panel above the canvas and as the compact strip row.
- **`InstanceActionsPopover.vue`**: Shared ellipsis trigger and compact action
  popover for entity-local commands. Disclosure is opt-in: full
  `InstanceCard` footers render their actions inline by default, and only a
  caller with a dense action set selects `menu`.
  Inline-card popovers never nest a second ellipsis: generated actions and
  the detail-route control render directly in the popover's action row.
  `InstanceCard footer-display="inline"` remains available for a
  caller-owned primary navigation choice, such as opening or switching the
  organization represented by a profile card.
- **`ScrollablePanel.vue`**: PrimeVue `Panel` wrapper for bounded workspace
  sections whose header remains fixed while the panel content scrolls. It
  supports an `actions` slot for header controls and `:scroll-content="false"`
  for content-height panels. `density="compact"` reduces header and content
  padding for IDE-style navigation and inspector lanes without changing the
  global PrimeVue panel density.
- **`StateBlock.vue`**: Standard loading/empty/error layout with icon, semantic body/caption roles, optional description, and action slot. It does not recreate bordered container chrome. The root `error.vue` surface uses this primitive for failures and recovery actions.
- **`TableFrame.vue`**: Reusable overflow boundary around PrimeVue `DataTable` surfaces. DataTable chrome remains preset-owned.
- **`StandardDialog.vue`**: Dialog wrapper with standardized footer and
  responsiveness. The `full` size is edge-to-edge on mobile with margins
  from `md` up; the `fill` prop bounds the dialog root to the viewport and
  turns the content area into a non-scrolling flex column (media viewers,
  call surfaces — content owns the layout instead of the dialog scrolling).
  The `title`/`subtitle` props with the `#header-actions` slot render the
  popup header row for dynamic titles: a truncating title, an optional
  muted subtitle (file mime/size, record meta), and trailing icon actions
  before the dialog's close button (EntityPopup's expand, the attachment
  preview's download). Static-label dialogs keep PrimeVue's own `header`
  attr; hand-rolled `#header` rows are defects. The default footer's
  cancel/save labels resolve through i18n (`common.cancel`, `common.save`);
  `cancelLabel`/`saveLabel` override them for domain-specific verbs.
- **Default confirmation host**: the app layout (`layouts/app.vue`) mounts the
  single default-group PrimeVue `ConfirmDialog`; feature surfaces call
  `useConfirm()` without a group and never mount their own host — a second
  default-group host anywhere in the tree renders every require twice
  (chat mounts on several surfaces at once, so the host cannot live in a
  feature component).
- **`StandardPage.vue`**: Route-level page shell for title, subtitle,
  breadcrumbs, and page actions. The authenticated `app` layout owns outer
  route padding; `StandardPage` owns max width and header spacing only, so
  pages do not accumulate nested padding. `workspace` turns off the normal
  max-width and vertical gap and establishes a bounded `h-full/min-h-0`
  propagation chain for registered full-screen workspaces. The optional
  `back` prop renders the routed-surface back control beside the title
  (the shared `usePageBack` shape); pane-hosted surfaces never pass it.
- **`BackControl.vue`**: The routed-surface back control — the one
  materialization of the `usePageBack` shape
  (`{ icon, label, command }`), mounted by `StandardPage` beside the
  title and by the ui-mapping record header ahead of the identity.
- **`TypedSettingsForm.vue`**: Contract-driven form for simple typed field
  descriptors (`string`, `number`, `boolean`, `enum`, `instanceId`,
  `typeId`, `workflowState`, `array`, `object`). Used by admin operation
  parameters and lifecycle hook settings so those surfaces do not fall back to
  raw JSON editors. Entity type helper text is shown only for `instanceId`
  selectors, not workflow-state selectors.
- **`UserAccountMenu.vue`**: The single shared account control: a PrimeVue
  popover whose account group carries the profile settings trigger, the
  theme toggle, and logout; the organizations group opens every
  membership's in-home pane (the directory surface — the account-control
  contract is owned by
  [layouts/README.md](../../layouts/README.md); nothing else routes away).
  The trigger is customizable through the scoped `#trigger` slot (default
  is the round avatar button), and callers inject leading actions through
  the scoped `#items` slot (receives the popover's `hide`, so an injected
  action can close the menu before opening another surface — the mobile
  app shell uses this for its Add screen shortcut entry). Chats live in
  the dedicated chats surfaces, not in this menu. The desktop navbar and
  the mobile bottom panel render it for the avatar/profile buttons, and
  the generated home workspace sidebar renders the panel-style trigger.
- **`ProfileSettingsDialog.vue`**: The profile settings popup — the single
  app-level host mounted by the app layout and opened through the shared
  `useProfileDialog` state by every `UserAccountMenu` instance and by
  record surfaces (the directory's self-profile action). It hosts the
  personal surface as PrimeVue-owned sections: identity block (avatar,
  name, active organization, trailing avatar-action icon Buttons), then
  `Panel`s — Preferences (label + component rows: language,
  notifications), Targeted Invitations, and My Organizations, whose
  entries are a nested `Menu` (building icon, active organization marked
  by the success check, create entry after a separator): each organization
  row opens its in-home pane, switches to it, or leaves it with
  confirmation. Leaving the active organization selects another active
  membership or the orgless workspace; the last active member or owner is
  refused by the server. Organization creation lives only here, outside the
  popover.
  It only flips the `theme-mode` cookie; the app layout applies the theme
  class.
- **`CommunicationMenu.vue`**: The Calls flyout: a popup PrimeVue
  `TieredMenu` listing every direct/group conversation that can be rung,
  toggled by the sidebar PanelMenu's always-present Calls row and anchored
  at it (the workspace owns the row). Ongoing rooms are not flyout entries
  — they render as persistent rows in the same communication panel, and
  brand-new invites float through `components/calls/IncomingCalls.vue`.
  Conversations come from the support store; the ring action is delegated
  through the `start-call` event.
- **`InstanceRefInput.vue`**: Typed entity reference selector used by
  `TypedSettingsForm` for `instanceId` fields. It prefers workbench/scenario
  entity options and falls back to a manual id input only when no typed options
  are available. Its typed picker delegates to `InstanceSelect`.
- **`InstanceSelect.vue` / `InstanceMultiSelect.vue`**: The entity
  dropdown wrappers; the option-row and chip contract lives in the
  wrappers' own section above. App components import them under local
  `Select` / `MultiSelect` names for entity pickers; plain enum selects
  are the allowance `instance-select.spec.js` pins.
- **`StandardPage.vue`**: Page layout with header and breadcrumbs.
- **`InstanceCard.vue`**: Shared entity card structure built directly on PrimeVue `Card` slots (`header` / `title` / `subtitle` / `content` / `footer`) while the preset owns its border, radius, shadow, spacing, and interaction states. Supports `showStatus` / `showTrace` toggles for entities that intentionally omit status or lineage chrome, and reserves `stateActions` for workflow-transition previews that carry `to`/`intent`. Default card surfaces hide lineage breadcrumbs unless a caller opts in with `showTrace`. Entity cards should use `before-identity` and `subtitle` instead of overriding the `title` slot; `before-identity` renders inline with the identity text in compact and card variants, and the default card title/status row keeps identity and status on one wrapped line rather than stacking the status under the title.
  Full-card footer actions render inline by default (`footer-display`);
  the ellipsis menu stays available for deliberately dense footers.
  Slot support is a per-variant contract; a supplied slot outside its
  variant warns in development:

  | Slot | `inline` | `compact` | `card` |
  |---|---|---|---|
  | `title` | — | identity-row override | title-block override |
  | `before-identity` | — | identity-row prefix | identity-row prefix |
  | `subtitle` | — | row under identity | Card subtitle |
  | `header` | — | above the content block | Card header |
  | default body | — | — | Card content |
  | `compact-content` | — | extra row in the content | — |
  | `inline-extra` | suffix in the chip row | — | — |
  | `footer` | — | — | footer actions |
- **`NameEditPopover.vue`**: Compact single-field rename control for entity names and other one-field edits. Use it near identity or action clusters instead of opening a full dialog when the only editable field is a name.
- **`FilterBuilder.vue`**: The filter builder panel — the user-facing surface for boolean composition over the canonical instance-filter tree ([shared/instance-filters](../../shared/instance-filters/README.md)), hosted inside a host-owned popover (the collection header's view control carries the condition count as its badge through `countPredicates`). Set conditions render as two content-driven zones — a header line where the field takes the leftover width and truncates (full label on hover) beside the intrinsic-size operator and remove, and a full-width value line where enum chips wrap; an `Add condition` button toggles an inline field list (inside the hosting popover — a nested overlay would trip its outside-click handling) whose buttons append rows, and the same list swaps a row's field. Every control is inline by construction — segmented operator/boolean buttons, text/number/native-date inputs, enum value chips — because a popover dismisses on document clicks outside its subtree (body-appended child overlays closed it mid-edit) while appending those overlays into the positioned panel displaced them (PrimeVue positions overlays document-absolute). One combinator (match all / match any) applies once more than one row exists; each row picks a field, an operator — including the negated twins (`is not`, `doesn't contain`, `is none of`) that compose `not` — and a value control by field kind (text, enum select/multi-select, boolean, number, date). Hosts supply the field list (`{ name, label, kind, values? }` — traversal names are plain names) and own the model plus its persistence; the builder owns no matching logic — every edit composes through `filterFromBuilderRows` and the host evaluates with the one matcher. Trees the builder did not compose (nested groups) decompose to nothing rather than corrupt, and incomplete rows live only in local state until complete.

`InstanceState` action objects support `display: 'inline' | 'menu' | 'hidden'`. Workflow transitions default to inline actions, self-loop metadata transitions are hidden, and only lifecycle transitions should be passed into the status surface. Inline/card status surfaces use the badge itself as the popover trigger and do not render a second ellipsis button beside the badge; expanded/full status surfaces show up to two inline actions by default and put overflow actions, current location, metadata, and compact status history in the popover. Entity card title/status rows and status menus are allowed to wrap, and inline status rails are deliberately bounded so compact containers do not let status text or action buttons displace identity content.

`TraceChain` omits the active organization's lineage reference: it is always
part of the authenticated app context, so it is not repeated on generated
cards, entity pages, or inline popovers.

`InstanceCard` owns inline and compact expansion. Inline and compact variants open
the shared entity popup on click/keyboard activation (the record's compiled
detail surface in the standard dialog; a type with no record surface
renders an inert chip). Entity-specific card components render one
`InstanceCard :variant="variant"` and gate their slots to the variant:
identity chrome (`before-identity`) renders in compact and card, the fact
body renders through `compact-content` in compact and the default slot in
card, footers render in card, and `inline-extra` is the inline suffix.
Generated card surfaces that override `#title` must not reintroduce
`TraceChain` or a stacked identity/status column. Keep those overrides limited
to clickable identity wrappers while preserving the shared one-row
identity/status layout.
Entity-specific bodies own their own internal separators.
The entity popup shows status as the normal inline status control only;
expanded/full status history and actions remain owned by clicking the status
control itself.
Nested interactive children such as `InstanceState`, `TraceChain`,
`GeometryPreview`, buttons, and nested inline entity cards
mark themselves as card-interactive targets. Parent card click handlers must use
`utils/interactive-target.js` before emitting view/select actions. Cards whose
primary action is a custom preview can pass
`expandable="false"` to `InstanceCard` and own the click action themselves.

Direct `primevue/card` and `primevue/dialog` imports belong only in these shared wrappers. Used pages and feature components consume `InstanceCard`, entity-specific card components, `StandardDialog`, `ActionToolbar`, `ResponsiveGrid`, `StateBlock`, `TableFrame`, and `Panel` for non-entity sections.

Shared wrappers own semantic structure and reusable layout constraints, while PrimeVue/Aura owns their generic visual chrome. New application tokens are limited to semantic typography, layout, domain signals, visualization, and motion; wrappers must not add radius, shadow, border, or interaction-state values.

## Demo Contract

The design-system demo is contract-driven:
- entity UI policy and expected card prop names live in the declared types (render groups); `utils/design-system-contract.js` validates them.
- `utils/design-system-cards.js` binds contract keys to the card components; `utils/design-system.js` composes that binding with the DTO factories into the registry (`DESIGN_SYSTEM_ENTITIES`).
- `test-data/factories.js` provides DTO-shaped examples with v24 blocks preserved.

Shared primitives should be demoed through this manifest so component coverage and contract drift are visible in `/test/ui-lab`.
