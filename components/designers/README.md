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
(`top-dock-items` prop) carries document operations grouped
view/file/commit-last (open/load, rename, save/save-as, then destructive and
utility items), the **bottom dock** (`dock` slot) carries canvas and content
commands. Every canvas-capable designer exposes the same first-level zoom
cluster in the bottom dock (zoom out, zoom in, reset/fit — plus frame
selection on graph canvases), undo/redo where the editor owns a history,
and content operations (sheet add/upload/rotate/delete with the destructive
item last in its group); DrawingCanvas hides its internal zoom cluster in
designer mode and exposes the commands for the dock instead. The top dock
floats top-anchored
(`MotionDock` `placement="top"`) inside a full-width positioned wrapper, on
the exact top line of the panel rails with the same 12px canvas inset; the
bottom dock anchors near the canvas bottom between the rails. Popups toggle
on click and close on confirm, selection, or outside click — pickers and
rename prompts use `Popover`. Every dock item carries a label that renders
as its hover tooltip, and the dock pill uses one symmetric padding so
pressed-state items keep identical gaps.

Panel visibility lives inside the top dock as its leading items: the
workspace prepends pressed-state toggles (`pi-align-left` palette,
`pi-align-right` inspector) before the designer's document commands,
separated by a dock separator. Wide hosts toggle the rails/overlays
directly; compact hosts (below 48rem of the workspace's own width) hide the
rails and open one bounded tabbed overlay (60% height cap) whose active tab
follows the toggle. Crossing the compact boundary resets to the mode's
defaults — rails up when wide, canvas clear when compact — and the state is
exposed through the workspace ref (`panels`, `toggle`, `setPanel`) for
designer code; slot content compiles in the parent scope, so use the ref
API, not provide/inject. Panels share one surface contract in both layouts:
full-height rounded bordered content-background rails with overlay shadow,
running the same 12px insets top and bottom, sized by the workspace wrappers
(17rem palette, 22rem inspector) — designers must not add their own panel
borders, widths, or positioning.

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
