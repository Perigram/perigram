# COMPONENT: Shared UI Components

This directory contains reusable, standardized UI components and blocks that MUST be used across the application.

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

## Atomic Blocks (`components/shared/blocks/`)

### `DataBlock.vue`
The one fact-row control. Dimensional facts (width × length spans, thickness,
area) are declared descriptor rows with units — the former `SpecsBlock`
content — not a separate block. One-off local facts may still define a small
field array inline in the component's `<script setup>`; every reusable fact
vocabulary lives on type declarations (see below).

**Usage:**
```vue
const FIELDS = [
    { path: 'data.diameter', i18n: 'toolProfile.diameter', suffix: ' mm' },
]
<DataBlock type-id="toolProfile" :entity="tool" :fields="FIELDS" />
```

Props: `type-id` (required), `:entity` (required), `:access-entity` (optional parent entity for scoped permission checks), `:fields` (required — inline array of field descriptors), `variant` (`default` definition grid or `compact` inline facts).

**Field schema:** `{ path, label?, display?, unit?, suffix?, prefix?, priority?, fallbackPaths? }` —
`path` is dot-notation into the entity object. `label` is authored render
data: a value that is a translatable key localizes, anything else renders as
the authored string. `unit` renders the declared unit symbol as a value suffix
(`mm`, `m`, `m2` → `m²`, `percent`, `min`, `deg`); explicit `suffix`/`prefix`
strings remain the escape hatch for non-unit decoration. `display:
'dimensions'` renders a width × length span from the resolved specs object
(the former `SpecsBlock` shape) with the declared unit. Rows with
null/undefined values are hidden automatically.
Values are formatted through `utils/data-display.js`: scalar arrays render as comma-separated text, arrays of objects render as counts, objects render only when they expose a stable identifier (`name`, `label`, `code`, `serial`, `reference`, `uid`, or `_id`), and non-displayable nested objects are hidden. Fields with `display: 'parameterMap'` render scalar object entries as exact named parameters such as `A=1200, B=400`; use this for materialized cassette design values, not symbolic template parameter lists.
Default layout renders a semantic `<dl>` grid for card bodies; compact layout renders inline facts for popovers, relation rows, and tight embedded surfaces.
The default `DataBlock` layout uses its own inline-size container, so columns
follow the width assigned by a page or split pane rather than the browser
viewport.
Inline entity popovers mark their body with `instance-card-popup-content`, and
`DataBlock` collapses default grid rows to compact inline facts inside that
scope. Do not add entity-local popup data layouts just to make popovers denser;
use the shared popup scope or pass `variant="compact"` for explicit compact
surfaces.
The reusable descriptor vocabulary is the compiled type view: fact groups are
authored `render.groups` on type declarations, normalized into the served CTS
client bundle by `@perigram/cts` `renderPolicyFor`, and resolved by
`utils/instance-display-contract.js` (see below) — component-local constants
are only for genuinely one-off facts. Bundle descriptors carry `fallbackPaths`
and `priority`; `DataBlock` uses the first non-empty allowed path and hides
rows that resolve to empty values.
Rows are filtered through `shared/instance-field-access.js`. A descriptor path
must match an access policy for `type-id` — the legacy domain field policy, or
the declaration-derived policy the registry store registers from the served
bundle (feature = the class-collection grant the server's own instance reads
check) — and the current auth grant must satisfy that policy level. When the
active organization process provides field policies, `DataBlock` applies those
process policies before the domain defaults. Do not render sensitive or
entity-specific facts beside `DataBlock` unless the API DTO has already been
redacted for that same field policy.

### `InstanceSurfaceContent.vue`, `InstancePreview.vue`, `InstanceRelationsBlock.vue`
Contract-driven body primitives for app constructors. `InstanceSurfaceContent`
resolves an entity type plus `surface` through `utils/instance-display-contract.js`
— fact-row descriptors from the served org type view (`useFileTypeView` cache,
the compiled CTS client bundle), surface chrome from the design-system surface
contracts — and renders preview, data facts, and relation rows with the shared
primitives.
On the `detail` surface with a visible preview it composes a real page body:
media and the fact column sit side by side from 48rem of the surface's own
width and stack above it on narrower containers; card surfaces keep the
simple preview-first stack. With `dataDisplay: 'sectioned'` the fact column
chunks by field group (identity, overview, specs, stock, production) under
small localized `entityGroups.*` headings, so detail pages read as separate
concerns instead of one flat grid. `DataBlock` renders
`display: 'swatch'` fields as a color dot beside the value for declared
hex-color facts. `InstancePreview` resolves the unified payload preview
first: a file instance with a stored payload renders through the type's
declared preview policy (`file-preview-contract.js` → `ArtifactViewer`, the same
contract generated detail bodies use); legacy DTOs without payload bytes
fall through to `CassetteThumbnail` or `GeometryPreview`, and ordinary DTO
thumbnails render from `data.thumbnailUrl` or thumbnail attachment
metadata for non-cassette entities. `InstanceRelationsBlock` renders relation descriptors through
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

### `InstanceWorkspace.vue`
Canonical entity-detail workspace layout for operational editors embedded
inside `InstancePage`. Use it when an entity detail needs a primary working
region plus a supporting/status/results region, such as queue composition with
nesting runs. The layout is a CSS query container: it uses one column while its
own allocated width is narrow and a stable 8/4 main/support split when the
container is wide enough. Callers whose support slot is conditional must pass a
full-width `mainSpan` while that slot is absent; an invisible support region
must not reserve four columns. This is intentionally independent from viewport
breakpoints so entity workspaces remain usable inside recursively split file
panes. `ResponsiveGrid` accepts `responsive-context="container"` for repeated
content inside this layout. Its `wide` variant introduces a second column only
at a 48rem container width, preserving useful card width inside split panes.
The `bounded` variant uses token-defined minimum and maximum track widths with
`auto-fill`: cards retain a finite readable width and extra container space
creates additional tracks instead of enlarging existing cards without limit.
Route-level production pages that need navigation, center work area, and right
rail still use `WorkspaceLanes`.

### `DesignerNodeCard.vue` and `DesignerSocketHandle.vue`

The shared designer-canvas card vocabulary. `DesignerNodeCard` is the one
node-card frame every canvas card composes — size ladder (`sm` declaration
leaves, `md` type/class cards, `lg` operation cards), selection border,
uniform padding. The card body is deliberately colorless chrome.
`DesignerSocketHandle` is the one typed
socket handle: shape encodes what the socket deals in (data circle,
declaration diamond, event rounded square, status rounded square) and color the
payload family, both from the port spec through
[`utils/processDesignerSocketTone.js`](../../utils/README.md), with the
standard 12px handle geometry and the
process-plane id minted by `mintProcessSocketHandle` (the declaration
plane's persisted `input:`/`output:` spellings pass `handleId`).
Operation cards (process designer) and declaration cards (type designer
family, on both the process and the type canvas) all consume them, so a
transported type keeps one semantic look on every card it appears on; a
spec-less handle degrades to the neutral data tone (the type canvas
renders read-only and supplies no specs). The channel→meaning contract
these primitives enforce (what color, shape, pattern, and size
each encode, and the card arrangement) is canonical in the
[process designer README](../../components/process-designer/README.md)
("Node UI contract").

### `DesignerWorkspace.vue`

Shared full-height shell for operational designers. It owns responsive lane
layout and overflow; feature designers supply `toolbar`, `palette`, default
canvas, `inspector`, `support`, and `dock` slots. Use `layout="lanes"` for
persistent editor panels and `layout="canvas"` for a full canvas with overlay
palette and inspector. Do not recreate designer breakpoint grids or viewport
height calculations in a feature component.

### `DesignerSurface.vue` and `DesignerDialog.vue`

`DesignerSurface` is the shared full-height flex boundary for every operational
designer before it mounts `DesignerWorkspace`; it works consistently in routes,
generated workspace panes, and dialog content. `DesignerDialog` is the only
dialog host for standalone designer launches. It fills the viewport and mounts
its content through `DesignerSurface`, so a cassette designer opened from an
entity action uses the same sizing contract as route and pane designers.
The host keeps the preset's dialog-content padding; its scoped PrimeVue integration
owns only the flex sizing needed for the designer surface.

### `ThreeViewport.vue`

Shared Three.js host for designer previews. It owns renderer/camera/control
lifecycle, resize, selection raycasting, and disposal. Feature code supplies a
scene group and stores selectable metadata in `object.userData.designerItem`;
it must not create another renderer or global pointer listener.

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
([shared/ui-mapping](../../../shared/ui-mapping/README.md) — the canonical
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
from the status component itself. `InstanceCard` and `InstancePage` forward
both as `refresh` on their shells, so instance-specific cards and pages can
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
Events render as a vertical PrimeVue Stepper trail so the component fits
cards, popovers, sidebars, and other narrow surfaces: each event is one
`StepItem`, ordered oldest → newest, whose `Step` header contains the
status badge, actor display name, and timestamp in a wrapping row (the
stepper's number bubble stays hidden — the badge is the marker); the
newest event's `StepPanel` opens by default and clicking a step header
expands that event's evidence (note, attachments, snapshots) — one panel
open at a time, the stepper's own accordion. Timestamps must not be
rendered in a separate fixed-width side column.
Step badges resolve through the flat state contract: the type's policy map
(`statePolicyByType` over the hydration payload's compiled producer
workflows) drives each historical value's label, severity, and icon through
`stateDisplayFor`, with the raw `toStatePrimary` remaining the state
identifier, not the display contract.
Persisted events may include response-only `actor` data from the status API.
`StateHistory` prefers the event's first-class stamp actor — the persisted
`label`/`name` for display and `id`/`userId` for the user ref — and falls
back to `status.userId`-derived display only when the event predates the
stamp. Service/system principals render the localized system actor label
and get no user chat action.
User actors render through `InstanceInlineRef type="user"` and include an
icon-only chat action that opens the support chat in direct user conversation
mode for that actor.
Structured v2 events prefer `toStatePrimary` for the visible badge and keep
`region` available for grouped status surfaces.
History panels render lifecycle proof attachment refs as download links and
snapshot entries as compact count chips from the persisted event snapshot.

### `DrawingCanvas.vue`
Shared SVG canvas for layer-aware drawing surfaces. It accepts normalized geometry previews, baked cassette `layerData` / `polygonParts`, DXF text/URLs, SVG URLs, legacy parametric cassette graphs, and OCCS cassette definitions with Perigram graph-tree extensions; owns layer visibility by default, viewer pan/zoom, cassette designer edge actions, shared viewer grid/stroke presentation, and layer-to-pen resolution through `utils/drawingPreview.js`. Viewport navigation is pointer-class aware: mouse wheel zooms at the cursor and drag pans (Shift in designer mode), while touch input pans with one finger in viewer modes and pinch-zoomes/pans with two fingers in every viewer/designer mode; designer mode reserves single-finger taps for face/edge interaction. The canvas root declares `touch-action: none` in viewer modes so the browser never claims a canvas gesture for page scrolling or zooming.

All drawing sources normalize to the same layer contract before rendering: `{ viewBox, layers: [{ name, standardCode?, paths }] }`. DXF layers keep their source layer names and optional mapping. Parametric cassette previews render through the same layer list and may provide caller-owned `layers.face` / `layers.boundary` metadata; if no layer metadata exists, they render as a neutral `geometry` layer instead of guessing production standards. Layer paths may be SVG paths, images, raw SVG snippets, or text primitives; text primitives are used for CAD-style dimension labels on semantic annotation layers such as `dimension.cassette`; labels with `designerControl` metadata stay in the layer output, and selected/hovered designer faces get compact chip overlays at those label coordinates that emit `designer-point-edit`. Designer overlay chip text uses PrimeVue `--p-content-background` against `currentColor` chip fills so labels keep contrast in both light and dark color schemes. Designer edge, fold-edge, face-select, face-action, point-edit, and section-edit hit overlays are overlays, not drawing layers. Free edge handles use invisible edge hit lines only for hover and show a `+` chip on hover; only the visible chip emits `designer-action` with the edge's source `edgeIndex`. Fold edge handles emit `designer-fold-select`; the fold angle chip is shown only when hovered or when that fold's child face is selected, then emits `designer-fold-angle-edit`. Designer face overlays emit `designer-face-select`, show hover feedback, highlight `selectedDesignerFaceId`, emit `designer-face-command` from the selected-face menu chip, and emit `designer-point-edit` from caller-provided offset controls. Designer assembly context can render non-interactive transparent workpiece outlines and source/target attachment markers while limiting face hit targets to caller-provided selectable workpiece ids, so background workpieces do not steal active face clicks. Designer section graphics belong to the caller-provided `code.cassette_mark` layer, so layer visibility toggles them; the section overlay only emits `designer-section-edit` from invisible draggable section-plane hit targets while that layer is visible and releases document-wide on mouseup.
Cassette Designer v2 hardware placements are expanded by the OCCS renderer into
`code.cassette_mark` schematic paths, `cut.inner` hook polygons, `cut.hole`
fastener circles, boolean-shaped face paths with `fillRule: evenodd`, and
designer markers before they reach `DrawingCanvas`. The shared canvas renders
those layers but does not own hardware family, production-mode, curve-boolean,
or edge-array placement math.

Layer colors resolve in this order: explicit source layer mapping, caller-provided `standardCode`, standard-code fallback from the layer name, source layer styling, then the default pen. Geometry previews that provide `standardCode`, `code`, or an OCCS dot-code layer name load layer standards and pen templates before normalization; concurrent canvases share one in-flight load and reuse the completed catalogues within the active user and organization scope. When a standard exists but its configured pen is missing, the source layer `color`/`weight` is preserved. Standard and pen data are read from canonical v24 DTO fields (`standard.data.code`, `standard.data.defaultPenId`, `standard.data.orgPenId`, `pen.data.stroke`) with flat fallbacks only for migration compatibility. Card and thumbnail canvases choose a portrait or landscape aspect from the resolved viewBox so sheet-layout previews are not forced into a wide frame, and they own that aspect-ratio height instead of requiring parent cards to provide a fixed height. Canvases embedded in a fixed-height card preview band instead opt into `fill`: they paint no own border, rounding, or background (the host card owns the chrome), fill the band bounds exactly, and scale the SVG to cover (sketch scenes, uniform scale, cropped) or contain (dxf/svg/occs vector drawings). Bounded operational cards may opt into `CassetteThumbnail`'s `fixedFrame`; that mode uses the caller's fixed square width and height and fits the complete SVG inside without cropping or suppressing layers. Preview-mode `dimension.cassette` text is intentionally enlarged so cassette thumbnails keep dimension labels readable, and geometry-normalized layer-data previews include dimension text points in the viewBox bounds so those labels are not clipped. The unified OCCS preview keeps the enlargement in card bands but opts out in the interactive pane viewer so it matches that canvas pixel-for-pixel. Generic baked `geometry.type === 'dimension'` entries render as extension lines plus an offset dimension line with the text placed off that line, instead of a raw midpoint label on the measured segment. Geometry-first cassette-design thumbnails prefer baked `layerData` over stored `geometry.preview.layers` so stale preview-layer snapshots do not override the persisted design geometry contract. In thumbnail/card mode, `DrawingCanvas` sizes `dimension.cassette` text from the rendered SVG viewport instead of raw geometry extents, so labels stay visually stable across cassette and cassette-design previews, and the displayed viewBox gets its breathing room from the canvas inset rather than wrapper padding. `CassetteThumbnail` prefers baked geometry-preview / layer-data sources over DXF when that data is available and narrows production previews to `cut.outer`, `fold.route`, `cut.inner`, `cut.hole`, and `dimension.cassette` when those layers exist. Use this component for artifact previews, cassette thumbnails, mapping previews, and designer canvases instead of duplicating SVG render logic in feature components.
Layer-standard pen references may point to either the pen Mongo `_id` or its
canonical `identity.uid`; both resolve to the same pen DTO.

The optional viewer layer panel is part of the shared canvas surface but must
render Perigram concepts through existing Perigram system components. Source DXF
layer names render through the identity policy helper; mapped layer standards use `LayerStandardCard`;
resolved pens/colors use `PenTemplateCard`. Inline color dots, hand-rolled
layer rows, or custom key/value renderers are not allowed for these entity
concepts. PrimeVue controls are limited to non-entity interaction chrome such as
visibility checkboxes, show/hide buttons, scroll containment, and count tags.
Surfaces that need their own panel, such as `CassetteDesignerV2`, pass
`visibleLayerNames` and handle `layer-toggle`; in that controlled mode
`DrawingCanvas` renders only the selected layer names and does not reset
visibility during drawing refresh.

Current drawing display owners:

| Surface | Source type |
|---|---|
| `GeometryPreview.vue` | `geometry-preview` |
| `CassetteThumbnail.vue` | `dxf-url`, `parametric-cassette`, or `occs-cassette` |
| `CassetteEditorDialog.vue` | `dxf-text` |
| `ArtifactsTable.vue` | `dxf-url` / `svg-url` |
| `CassetteDesigner.vue` | `parametric-cassette` with designer overlays |
| `/test/ui-lab` | `geometry-preview` demo |

New drawing previews should add a source normalizer for `DrawingCanvas`, not a feature-local `<svg>`.

### `GeometryPreview.vue`
Entity-card wrapper around `DrawingCanvas` for design and remnant geometry.
Reads `entity.data.geometry.preview` first and falls back to
`entity.data.geometry.data`, `entity.data.geometry.points`, or polygon data such
as `entity.data.geometry.data.polygon`. It marks the preview as an interactive
card child so parent card click handlers do not steal pan/preview clicks.

Use this for DXF-derived layer previews and polygon remnants instead of displaying file ids, queue ids, or static filename fields in entity cards.
When callers pass `hideDimensionLayer`, geometry previews keep production
layers such as sheet/stock, cut, fold, and bend layers in compact cards while
suppressing dimension annotation layers so in-card sheet-design previews stay
readable.

### `InstanceInlineRef.vue`
Compact embedded entity reference for relation rows inside cards and details.
When only an id is provided, it resolves the DTO through the entity store's
access-filtered optional-reference lookup, resolves the matching design-system
entity card, and renders that card with
`variant="inline"`. The referenced entity card owns the click/keyboard popover
and reuses its canonical body inside that popover; `interactive: false`
renders the inline card non-expandable for non-interactive rows such as
explorer entries and static summaries. In generated surfaces,
the popover action row is access-aware: `InstanceInlineRef` resolves the
referenced entity's generated detail-screen actions, forwards them to
`InstanceCard`, and invokes the surrounding generated screen's action executor
instead of running process actions from shared UI code. Route, preview, and
popup-action providers share the same normalized generated entity type so
aliases such as `sheetDesign` / `sheet_design` stay consistent. Use this for entity relation
context where an always-expanded nested card would overload the surface; do not
render extra lifecycle badges next to these relation chips because status
belongs on the actual entity card/detail.
Inline chips now carry a restrained semantic tone in addition to the icon. The
hue comes from the tokenized entity family roles (`project/queue`, cassette
family, sheet/run family, stock/material family, admin/meta family), while the surface treatment
comes from the entity role: containers render as the strongest filled chips,
templates/designs/revisions render as mid-strength definition chips, and
concrete items/instances render as lighter outlined chips. This keeps inline
refs visually legible in both light and dark themes without changing the
popover card body. The collapsed inline ref remains a real text-inline chip: it
stays on one line inside prose, truncates with ellipsis, and keeps the same
semantic color treatment without inflating surrounding line height.
`InstanceInlineRef` maps entity families to `--ck-entity-tone-*` values only; it
must not introduce PrimeVue primitive color assignments of its own.
`variant="compact"` renders a horizontal micro card instead of a chip. That
compact ref uses the compact surface contract directly: a real preview on the
left when the entity has one, the same semantic inline chip for identity on the
right, a read-only status badge beside identity, compact facts below, and the
same expanded popover for trace/type/detail context. Icons stay with the
identity chip and are not used as fake preview images. Generated card relation
galleries use a bounded responsive grid instead of in-card horizontal
scrolling; compact galleries show two refs and then an in-grid overflow tile so
cropping remains visible inside the card.
Use canonical design-system surface keys for new references, for example
`materialPile`, `nestingRun`, `cassetteDesign`, `cassetteTemplate`, and
`entityRevision`. Backend snake-case aliases continue to resolve through the
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
When the active generated screen manifest exposes a detail route for the
reference type, `InstanceInlineRef` provides that route to the expanded inline
entity-card popover. The popover footer renders an icon-only open action that
navigates through generated `/screens/:screenKey` detail routing, not legacy
feature routes. Cassette, cassette-design, and sheet-design compact refs
suppress dimension annotation layers in their micro preview so annotation text
does not overpower the gallery thumbnail. Inline-ref popovers also force the shared `TraceChain` even
when the base card surface normally hides trace in compact contexts, and show a
small localized type-id label above the identity row so the operator can
see both lineage context and exact entity kind without adding extra chrome to
the collapsed chip or compact micro card itself. Their expanded body uses the
card surface contract with compact data display, suppressed child counts, and
compact relation galleries, so nested outputs such as nesting-run sheet designs
or library cassette previews render the same way as in generated cards.
Nesting-run inline refs may receive partial preview DTOs from queue cards; the
popover hydrates the full run through `useEntity('nestingRun')` when output refs
are missing, then loads access-filtered `sheetDesign` rows with `runId` so the
sheet-design compact gallery is based on the canonical child lineage endpoint
rather than queue-card-local child state.
On mobile, detail-route buttons and lineage links inside inline-ref popovers
dispatch the shared mobile transient-surface close event before navigation.
`InstanceCard`/`InstanceInlineRef` hide their popovers and the app shell closes the
chat drawer, so the destination screen is not covered by stale overlays. Chat
open actions also dispatch that close event before opening the drawer, which
keeps inline popovers mutually exclusive with chat.
Revision/provenance rows should use this component with `type="entityRevision"`
so the shared entity popover shows the immutable revision summary and source
relationship.

### `ChatAttachmentPicker.vue`
The chat composer's attachment surface: a Popover hosting PrimeVue `Tree`,
both unmodified Aura. No `pt`, padding, border, or background overrides.
Home-screen sections are the roots; their children list the
section's generated create entries right beside the entity entries — and
every entity entry repeats the pattern through its type's detail-screen
child creates, so creation lives inside the hierarchy at every level (never
behind a second popup). Entities expand through pure lineage nesting
(`linkedExplorerChildSources` list fetches; relation links are deliberately
skipped so the tree stays a hierarchy); lazy loading is node-driven
(`@node-expand` carries the section/entity payload directly, so loads are
never routed by key-prefix parsing). Rows select; chevrons only expand.
Tapping an entity selects it and closes the picker; tapping a create entry
runs the generated flow in the host and attaches the created entity. Each
open resets the tree (sections re-expand and their option lists reload),
because option lists are recipient-scoped per conversation. The host owns
the draft `entityRefs` and the create-action flows; the picker only emits
`select`/`create-action`.

### `InstanceCard.vue` (chat entry)
Every card variant carries the composed instance-chat entry: full cards render
it in the footer row (before parent footer actions), and inline/compact
variants render it in the expansion popover action row. The entry routes
through `utils/instance-chat.js`, so the surface the card lives on decides how
the thread opens (desktop drawer, mobile `/chats` target).

### `InstanceChatPanel.vue` (detail-page conversation rail)
The instance detail page's own conversation — the one place a thread renders
in place instead of opening the shared popup. It occupies `InstancePage`'s
**sidebar slot**, so it is a sticky rail beside the body from the two-track
breakpoint up (visible, bounded, in the page's own reading order) and stacks
below the body as a full-width section under that breakpoint. It is not a
section appended to the main column: that buried the thread under the whole
body, made it undiscoverable, and put it last in reading order.

A PrimeVue text Button (Aura owns its focus/hover/press states; the icon is
stable across states and `aria-expanded` carries the state) toggles a bounded
`ChatSupport` in `embedded thread-only` mode pinned to `entity:<type>:<id>`, so
the page gets the composed conversation without the inbox or back navigation.
It starts collapsed so detail pages stay quiet until the operator opens the
thread; the expanded host is bounded by the `h-support-chat` dimension token
(`supportChatHeight`), never a page-local height, and paints no container
chrome — the thread's own surface is the surface.

`GeneratedInstanceDetail` mounts it in the `v-else-if` (abstract) branch only.
Bounded hosts must NOT mount it: their `flush` frame is `h-full` and
non-scrolling, so an in-flow rail has no track and collapses to nothing. Those
hosts expose the same thread through the shared chat popup
(`utils/instance-chat.js`) from their own chrome — the bounded file pane's
action strip and `GeneratedProjectWorkspace`'s actions strip both do this,
matching `InstanceCard` and `InstanceInlineRef`.

### `SupportMessageContent.vue`
Renders support-chat message bodies. Plain text remains text, while
`{{entity:type:id}}` tokens render as inline `InstanceInlineRef` chips. The
component also renders structured `message.entityRefs[]` entries that were not
embedded as tokens, so structured attachments remain visible without polluting
the text body. Text parts wrap with `overflow-wrap: anywhere` and the whole
inline-flex chain keeps `min-w-0`/`max-w-full`, so unbroken strings (urls,
serials) wrap inside the bubble instead of overflowing the chat bounds.
Messages carrying `attachment.kind === 'audio'` render a leading voice-message
chip, which is the inbox preview for attachment-only voice messages. The
`singleLine` prop is the inbox preview mode: the chip row never wraps and
crops to one line, with text spans carrying the ellipsis. Text
parts parse http(s) URLs into safe anchors (`noopener`, inherit-colored so
both bubble sides stay readable); trailing punctuation peels off the link and
stays text. Chat
composers must source supported ref types from the support
type-ids endpoint, which derives choices from readable generated screen
sources, and concrete refs from the support instance-options endpoint instead of
manual ids. Chat message refs may also carry compact entity snapshots plus
chat-only recipient metadata; `SupportMessageContent` passes those snapshots
into `InstanceInlineRef` so popovers stay usable inside chat even when the
recipient lacks ordinary entity read access, while generated detail-route
buttons stay hidden for that chat-only recipient view. When an older
chat-only ref still lacks an embedded snapshot, the message renderer disables
inline fetches for that recipient view instead of probing the protected entity
endpoint and throwing a visible `403` in the browser console.
For non-restricted cassette refs, the renderer may still hydrate an embedded
snapshot through the normal entity API when that snapshot predates the richer
chat snapshot contract and lacks the fields needed for `CassetteThumbnail`.

---

## Navigation & Links (`components/shared/links/`)

- **`TraceLink.vue`**: Atomic, icon-aware navigation link for lineage/status
  location rows where direct route navigation is intended. Do not use it for
  entity relation summaries inside cards/details; use `InstanceInlineRef` so the
  relation resolves through `useEntity` and the registered entity card.
- **`TraceChain.vue`**: Standardized lineage breadcrumb chain. Always use `:entity="entity"` and an explicit canonical entity type—never pass raw ancestry arrays or infer types from lineage key spelling. Resolves names async via `useEntityStore`; cached per session. Its `exclude` refs remove explicit ancestry, and it omits every entity in the propagated displayed-context stack, including the project already represented by a project workspace and the nearest enclosing `InstancePage`. Generated detail routes also exclude an ancestor only when the route carries that compiled Lineage key with the same entity id, preventing the app breadcrumb and entity trace from repeating the same context. In process mode the chain follows the effective compiled Lineage bindings only.
  Card title chrome uses compact trace mode: it shows the nearest parent
  lineage item and an ellipsis expander when more ancestry exists. Expanded
  popovers and detail pages render the full lineage breadcrumb chain. Supported
  lineage parents are whatever exact keys the effective compiled bindings
  declare; non-process routes may use canonical domain containment.
  Trace labels must resolve to entity display names from context or the entity
  store; raw lineage ids are link targets only and must not be shown as labels.
  Trace links must route through the represented entity surface. In active
  process mode they resolve through the user's effective generated screen
  manifest and use the same `/screens/:screenKey?instanceId=...` detail contract
  as generated collection rows; if the user has no matching detail screen, the
  breadcrumb renders as non-clickable text. Static routes are used only outside
  process mode and only for entities with real static surfaces.
  Entity card bodies must not duplicate these supported lineage parents as
  `InstanceInlineRef` rows or generated `entityRef` fields; keep body relation
  rows for non-lineage provenance and relations that TraceChain does not own.
  Development surfaces can provide `entityContext`; `TraceChain` prefers those
  in-memory entities for labels before calling authenticated APIs, so fixture
  lineage does not create protected API errors.

---

## Layout Containers (`components/shared/`)

- **`ActionToolbar.vue`**: Responsive title/subtitle/actions row for pages, sections, and tab panels. It owns the semantic display/title/body typography roles. Use it instead of ad hoc heading chrome.
- **`MetricPanel.vue`**: Route-level summary panel for aggregate collection or
  workflow facts. Pages pass translated metric descriptors
  `{ key, label, value }` and may use the default slot for route actions. Use it
  beside reusable entity cards, hub tabs, or workflow tables; do not use it as a
  replacement for entity-specific `DataBlock`, or
  `InstanceSurfaceContent`. Vertical metric panels collapse to a two-column
  compact grid below the normal desktop breakpoint and become a stacked rail at
  `lg` and wider. It delegates container chrome to PrimeVue `Panel`; callers own only metric data and layout orientation.
- **`ResponsiveGrid.vue`**: Token-backed responsive grid for cards and
  repeated item surfaces. Variants: `cards` (default), `dense`, `wide`,
  `bounded`. Grid
  children align to the start of each row so cards and panels keep natural
  height instead of stretching to the tallest item.
- **`WorkspaceLanes.vue`**: Three-lane production workspace shell. The parent
  route provides the viewport-sized frame; this component owns the left,
  center, and right lane grid from the normal desktop breakpoint. Below that,
  callers should provide their own compact selector/control surface because the
  left lane is hidden. By default the center lane scrolls as a lane; pass
  `:center-scroll="false"` when bounded child surfaces such as `ScrollablePanel`
  own their own body scrolling.
- **`WorkspaceSplitNode.vue`**: Recursive PrimeVue splitter renderer for
  IDE-style file workspaces. Split nodes select horizontal or vertical layout;
  leaf nodes expose one scoped file slot inside a PrimeVue `Panel` riding the
  zero canvas (transparent background, content padding zeroed through pt,
  and every Panel content layer min-width-zeroed — the default
  min-width:auto sized the grid wrapper to the hosted tab strip and blew the
  panel past its split cell, killing the tablist's overflow scrolling) and
  an active-pane marker. The pane Panel draws the default Panel hairline
  border as the visible pane box: the preset strips panel borders globally
  for the zero canvas, so the pane pt re-points `--p-panel-border-color`
  at the preset content border. Split cells carry no padding — the 6px
  gutters are the only inter-pane gap, the hosting surface owns the
  workspace-edge inset, and nested splits therefore never compound
  spacing; gutters are invisible but draggable — the division works
  without being drawn. Split-tree mutation remains pure state owned by
  the caller.
- **`InstanceActionsPopover.vue`**: Shared ellipsis trigger and compact action
  popover for entity-local commands. Disclosure is opt-in, not the default:
  `InstancePage` action slots and full `InstanceCard` footers render their
  actions inline by default (`actionsDisplay` / `footerDisplay` default to
  `inline`), and only a caller with a dense action set selects `menu`.
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
- **`StandardDialog.vue`**: Dialog wrapper with standardized footer and responsiveness.
- **`StandardPage.vue`**: Route-level page shell for title, subtitle,
  breadcrumbs, and page actions. The authenticated `app` layout owns outer
  route padding; `StandardPage` owns max width and header spacing only, so
  pages do not accumulate nested padding. `workspace` turns off the normal
  max-width and vertical gap and establishes a bounded `h-full/min-h-0`
  propagation chain for registered full-screen workspaces.
- **`TypedSettingsForm.vue`**: Contract-driven form for simple typed field
  descriptors (`string`, `number`, `boolean`, `enum`, `instanceId`,
  `typeId`, `workflowState`, `array`, `object`). Used by admin operation
  parameters and lifecycle hook settings so those surfaces do not fall back to
  raw JSON editors. Entity type helper text is shown only for `instanceId`
  selectors, not workflow-state selectors.
- **`UserAccountMenu.vue`**: The single shared account control: a PrimeVue
  popover with organization switching, theme toggle, profile, and
  logout, plus a customizable trigger through the `#trigger` slot (default is
  the round avatar button) and caller-injected leading actions through the
  scoped `#items` slot (receives the popover's `hide`, so an injected action
  can close the menu before opening another surface — the mobile app shell
  uses this for its Add screen shortcut entry). Chats live in the dedicated
  chats surfaces, not in this menu. The desktop navbar and the mobile bottom
  panel
  render it for the avatar/profile buttons, and the generated home workspace
  sidebar renders the panel-style trigger. It only flips the `theme-mode`
  cookie; the app layout applies the theme class.
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
- **`InstanceSelect.vue` / `InstanceMultiSelect.vue`**: Application-wide wrappers
  around PrimeVue Select/MultiSelect. Ordinary scalar, enum, role, and process
  record options preserve PrimeVue rendering and caller slots unchanged. When
  options contain either canonical entity DTOs or
  `{ label, value, entity }` records and an explicit `type-id`, option rows
  render through `InstanceInlineRef variant="compact"`. Once a value is selected,
  the selected entity card or card list renders outside the PrimeVue
  value/chip area and the PrimeVue control becomes a compact change trigger.
  That keeps the selected preview, identity, status, and access-filtered facts
  visible without embedding cards or empty value slots inside an input surface.
  Multi-select values render as a compact-card list rather than chips.
  App components import these wrappers under their local `Select` /
  `MultiSelect` names; direct PrimeVue imports are owned only by the wrappers.
  Entity type comes from the picker prop or option record and is never inferred
  from `data.type` or lifecycle state.
- **`StandardPage.vue`**: Page layout with header and breadcrumbs.
- **`InstancePage.vue`**: Root layout for all entity detail views. The header
  composes a small-caps localized type-id label, the identity, the inline
  status beside it, an `info` slot for summary data below, and an `actions`
  slot that renders inline by default (`actionsDisplay: 'menu'` collapses it
  into the ellipsis popover for dense action sets). The header block closes
  with a structural bottom border instead of a PrimeVue divider. Trace
  breadcrumbs are hidden by default and appear only when a caller opts in
  with `showTrace`; callers can pass exact `traceExclusions` derived from
  the current compiled context. Generated entity-detail screens also
  suppress the outer `StandardPage` title so the entity header is the only
  title surface. Pane adapters pass `:show-header="false"` so their own
  tabs/status/actions remain the sole chrome while the canonical body and
  sidebar layout are retained. The wrapper is an inline-size query
  container: the header splits at 32rem and the sidebar receives its second
  track at 48rem of actual parent width. It appends its entity to the
  displayed-context stack so nested traces do not repeat any represented
  ancestor. Operational overloads compose their workspace primitives inside
  this canonical shell instead of adding overload-specific layout modes to
  `InstancePage`.
- **`InstanceCard.vue`**: Shared entity card structure built directly on PrimeVue `Card` slots (`header` / `title` / `subtitle` / `content` / `footer`) while the preset owns its border, radius, shadow, spacing, and interaction states. Supports `showStatus` / `showTrace` toggles for entities that intentionally omit status or lineage chrome, and reserves `stateActions` for workflow-transition previews that carry `to`/`intent`. Default card surfaces hide lineage breadcrumbs unless a caller opts in with `showTrace`. Entity cards should use `before-identity` and `subtitle` instead of overriding the `title` slot; `before-identity` renders inline with the identity text in compact and card variants, and the default card title/status row keeps identity and status on one wrapped line rather than stacking the status under the title.
  Full-card footer actions render inline by default (`footer-display`);
  the ellipsis menu stays available for deliberately dense footers.
  Inline and compact variants share one expansion surface defined once in
  `InstanceCard`: a header row with the localized type-id label and the
  inline status, the identity, lineage context when forced, the same
  canonical body the full card uses, and a trailing inline action row
  (generated commands, the cassette-designer action, and a labeled
  open-detail control) — never a nested ellipsis inside the popover.
- **`NameEditPopover.vue`**: Compact single-field rename control for entity names and other one-field edits. Use it near identity or action clusters instead of opening a full dialog when the only editable field is a name.
- **`FilterBuilder.vue`**: The filter builder popover — the user-facing surface for boolean composition over the canonical instance-filter tree ([shared/instance-filters](../../shared/instance-filters/README.md)), triggered by its own funnel button (badge carries the active condition count). Set conditions render as two content-driven zones — a header line where the field takes the leftover width and truncates (full label on hover) beside the intrinsic-size operator and remove, and a full-width value line where enum chips wrap; an `Add condition` button toggles an inline field list (inside the popover — a nested overlay would trip the popover's outside-click handling) whose buttons append rows, and the same list swaps a row's field. Every control inside the popover is inline by construction — segmented operator/boolean buttons, text/number/native-date inputs, enum value chips — because a popover dismisses on document clicks outside its subtree (body-appended child overlays closed it mid-edit) while appending those overlays into the positioned panel displaced them (PrimeVue positions overlays document-absolute). One combinator (match all / match any) applies once more than one row exists; each row picks a field, an operator — including the negated twins (`is not`, `doesn't contain`, `is none of`) that compose `not` — and a value control by field kind (text, enum select/multi-select, boolean, number, date). Hosts supply the field list (`{ name, label, kind, values? }` — traversal names are plain names) and own the model plus its persistence; the builder owns no matching logic — every edit composes through `filterFromBuilderRows` and the host evaluates with the one matcher. Trees the builder did not compose (nested groups) decompose to nothing rather than corrupt, and incomplete rows live only in local state until complete.

`InstanceState` action objects support `display: 'inline' | 'menu' | 'hidden'`. Workflow transitions default to inline actions, self-loop metadata transitions are hidden, and only lifecycle transitions should be passed into the status surface. Inline/card status surfaces use the badge itself as the popover trigger and do not render a second ellipsis button beside the badge; expanded/full status surfaces show up to two inline actions by default and put overflow actions, current location, metadata, and compact status history in the popover. Entity card title/status rows and status menus are allowed to wrap, and inline status rails are deliberately bounded so compact containers do not let status text or action buttons displace identity content.

`TraceChain` omits ancestry already represented by the surrounding entity
context. The active organization is always part of the authenticated app
context, so its lineage reference is not repeated on generated cards, entity
pages, or inline popovers; other project and production ancestors remain
visible unless their exact entity is also displayed by an enclosing context.

`InstanceCard` owns inline and compact expansion. Inline and compact variants open
the shared entity popover on click/keyboard activation. Entity-specific card
components should render one `InstanceCard :variant="variant"` and pass their
canonical body once through the default slot. `InstanceCard` reuses that same
body for full card content and for inline/compact expansion; do not duplicate
card-only bodies into per-variant `expanded` slots.
Generated card surfaces that override `#title` must not reintroduce
`TraceChain` or a stacked identity/status column. Keep those overrides limited
to clickable identity wrappers while preserving the shared one-row
identity/status layout.
Entity-specific bodies own their own internal separators; inline/compact
popovers do not inject an extra divider before the reused body.
The entity popover shows status as the normal inline status control only;
expanded/full status history and actions remain owned by clicking the status
control itself.
Do not hide all meaningful body content behind `variant === 'card'`; relation
popovers depend on the same default slot body being available in inline and
compact cards.
Nested interactive children such as `InstanceState`, `TraceLink`,
`GeometryPreview`, `CassetteThumbnail`, buttons, and nested inline entity cards
mark themselves as card-interactive targets. Parent card click handlers must use
`utils/interactive-target.js` before emitting view/select actions. Cards whose
primary action is a custom preview, such as `ArtifactCard`, can pass
`expandable="false"` to `InstanceCard` and own the click action themselves.

Direct `primevue/card` and `primevue/dialog` imports belong only in these shared wrappers. Used pages and feature components consume `InstanceCard`, entity-specific card components, `StandardDialog`, `ActionToolbar`, `ResponsiveGrid`, `WorkspaceLanes`, `StateBlock`, `TableFrame`, and `Panel` for non-entity sections.

Shared wrappers own semantic structure and reusable layout constraints, while PrimeVue/Aura owns their generic visual chrome. New application tokens are limited to semantic typography, layout, domain signals, visualization, and motion; wrappers must not add radius, shadow, border, or interaction-state values.

## Demo Contract

The design-system demo is contract-driven:
- `@perigram/facade` contains entity UI policy and expected card prop names; `utils/design-system-contract.js` re-exports it for compatibility.
- `utils/design-system.js` binds the contract to actual Vue components and DTO factories.
- `test-data/factories.js` provides DTO-shaped examples with v24 blocks preserved.

Shared primitives should be demoed through this manifest so component coverage and contract drift are visible in `/test/ui-lab`.
