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

Dock commands are the designer's action surface: document-level actions
(open/load, rename, undo/redo, reset, save) render as `MotionDock` items in
the `dock` slot, with popovers anchored to their dock item through hover,
focus, and click handlers that keep, pin, and delayed-close per panel (see
the process designer's dock popover helpers). Designers must not keep
document actions in a top toolbar ribbon.

`layout="lanes"` is for editors with persistent side panels, such as cassette
and facade design. The canvas is the workspace background, edge to edge —
never a boxed panel beside the rails: palette and inspector render as
floating rails docked over the canvas's left and right edges in explicit
capped tracks (17rem/19rem that shrink on narrow hosts), owning their own
scroll and chrome, so the workspace never collapses into one stacked column.
The row floor keeps the layout visible even when a host breaks the
bounded-height chain. Document identity (name, template) belongs in the
`toolbar` slot above the canvas, while canvas-level commands (undo/redo,
reset, raw document, save) render through the shared `MotionDock` in the
`dock` slot, matching the process designer's dock; rail content composes as
plain labeled sections — one-line parameter rows (name, expression, remove)
and one-line layer rows (visibility, layer chip, standard and pen inline
chips) — without collapse controls, aggregate show/hide commands, or count
badges. `layout="canvas"` is for graph editors whose palette and
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
