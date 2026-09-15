# COMPONENT: Designer Workspace Contract

Shared operational chrome for graph and geometry editors. This contract keeps
layout, viewport lifecycle, and editor ownership consistent while each feature
keeps its own domain state and persistence.

## Use the shared workspace

`DesignerWorkspace` owns full-height sizing, responsive lane placement,
scroll containment, and narrow-screen panel overlays. Designers supply only
their controls through named slots:

- `toolbar` for document actions and selection tools;
- `palette` for creation/search controls;
- default for the interactive canvas or viewport;
- `inspector` for the selected item configuration;
- `support` for a secondary preview, tree, or diagnostics;
- `dock` for canvas-level navigation controls.

Do not add page-local breakpoint grids, viewport-height calculations, or
independent lane scrolling to a designer. A designer may position feature-local
handles and popovers inside its default-slot canvas.

Every operational designer uses this contract: Cassette and Facade use the
`lanes` composition, while Process, Facade Pattern, and the sheet-design
editor use the `canvas`/rail composition. Every designer first mounts through
`DesignerSurface`, which owns the full-height flex boundary in route and pane
hosts. `DesignerDialog` uses the same surface for dialog entry points and
occupies the entire viewport. The designer then supplies palette, inspector,
and dock content through named `DesignerWorkspace` slots. A canvas designer
must not recreate its own floating palette, inspector, or dock positioning
outside `DesignerWorkspace`.

Dock commands split by concern into two `MotionDock`s: the **top dock**
(`topDock` slot) carries document operations (open/load, rename, reset,
save), the **bottom dock** (`dock` slot) carries canvas and content commands
(undo/redo, navigation, add/upload/rotate/delete). Popups toggle on click and
close on confirm, selection, or outside click — pure command clusters use the
PrimeVue popup `Menu`, while pickers and rename prompts use `Popover`;
hover-open popups with hand-rolled close timers are not allowed.

Panel visibility is one PrimeVue `SelectButton` (multi-select, icon-only
sidebar options — mirrored for the right-hand inspector) pinned by the
workspace to the top-right edge, beside the top dock. Wide hosts toggle the
rails/overlays directly; compact hosts (below 48rem of the workspace's own
width) hide the rails and open one bounded tabbed overlay (60% height cap)
whose active tab follows the selection. Crossing the compact boundary resets
to the mode's defaults — rails up when wide, canvas clear when compact — and
the state is exposed through the workspace ref (`panels`, `toggle`,
`setPanel`) for designer code; slot content compiles in the parent scope, so
use the ref API, not provide/inject.

`layout="lanes"` is for editors with persistent side panels, such as cassette
and facade design. The canvas is the workspace background, edge to edge —
never a boxed panel beside the rails. The row floor keeps the layout visible
even when a host breaks the bounded-height chain. Document identity (name,
template) belongs in the `toolbar` slot above the canvas, while canvas-level
commands render through the shared `MotionDock` in the `dock` slot; rail
content composes as plain labeled sections — one-line parameter rows (name,
expression, remove) and one-line layer rows (visibility, layer chip,
standard and pen inline chips) — without collapse controls, aggregate
show/hide commands, or count badges. `layout="canvas"` is for graph editors whose palette and
inspector overlay a full canvas, such as process and facade-pattern design.

## Use the Three viewport

`ThreeViewport` owns the renderer, camera, lights, orbit controls, resize
observer, object URL lifetime, selection raycasting, and disposal of attached
Three.js objects. Feature components pass a constructed scene group through
`scene`, receive selected object metadata through `select`, and must not create
their own renderer or global pointer listeners.

The `scene` group is feature-owned. It must carry selectable item metadata in
`object.userData.designerItem`; non-selectable helpers set no such value.
The viewport disposes geometry and materials when its scene changes or it is
unmounted. It never persists geometry or interprets domain-specific metadata.

## Graph designer contract

Use a feature-owned graph document for any designer that needs editable nodes.
The graph document must declare a schema version, nodes, edges, outputs, and
any typed public parameters. The designer validates socket compatibility and
acyclicity before save; the feature owns its evaluator and persistence.

The shared workspace does not prescribe graph node kinds or a graph evaluator.
For example, the process designer owns business-flow nodes and a future
geometry designer may own curve or mesh nodes. Do not reuse a graph evaluator
across domains merely because both editors render nodes with VueFlow.
