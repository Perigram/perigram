# TODO: Project Workbench UX

Status: READY

Each task preserves the source review item immediately above its CutKit task.
No row implies acceptance, completion, or additional scope.

Terms: Project workbench = `GeneratedProjectWorkspace`; pane =
`WorkspaceSplitNode` + `GeneratedWorkspacePane`; file =
`GeneratedEntityFile` or registered workspace page; Queue cassette card =
`QueueEntryCard` association; cassette editor = `CassetteDesignerV2` over an
OCCS `cassette` template.

## P0 — structural UX

> Define the workspace hierarchy explicitly: **Project → Pane → View/Entity → Object/Selection**.

- [ ] Document and enforce this hierarchy in generated workspace owners. Queue-entry and OCCS object selection remain local, not Explorer entities.

> Separate project navigation from project creation/open actions.

- [ ] Keep Explorer navigation in `GeneratedProjectWorkspace` and compiled operations in `GeneratedProjectActionPalette`.

> Make pane management first-class: split, move, close, maximize, reopen, save/reset layout.

- [ ] Extend only `WorkspaceSplitNode`, workspace pane/tabs/menu, and versioned `project-workspace-state`; persist refs, never DTOs.

> Establish synchronized selection/context between project tree, entity view, cassette card, designer object, and inspector.

- [ ] Synchronize Explorer/file refs, Queue-entry selection, and OCCS workpiece/face/attachment selection across `QueueEditor`, `CassetteDesignerV2`, `DrawingCanvas`, and `CassetteFoldedPreview`.

> Give every entity view a proper entity header with type + identity + contextual actions.

- [ ] Define identity ownership per generated surface: embedded pane files reuse file/pane identity; standalone `GeneratedEntityDetail` owns its header. Do not duplicate `EntityPage` chrome.

> Redesign the cassette designer around **viewport + navigator/inspector**, rather than viewport followed by a long vertical form.

- [ ] Use `DesignerWorkspace` for persistent 2D viewport, settings, assembly navigator/inspector, and folded preview; remove only layouts that push geometry off-screen.

> Convert Workpieces into a scalable object navigator/tree suitable for future faces/folds/features/hardware.

- [ ] Project OCCS workpieces/joints as a DAG-safe assembly navigator. Use a tree only for a selected sheet's face/fold topology.

## P1 — design system

> Define 4–5 semantic surface levels and remove redundant nested borders.

- [ ] Audit `assets/tokens/index.js`, `assets/css/main.css`, and `docs/DESIGN_SYSTEM.md` for workspace, pane, section, control, and overlay roles before changing classes.

> Define one spacing scale and enforce it across tree, cards, toolbars, forms, and inspector.

- [ ] Define token-backed compact spacing and apply it only to the touched workspace, Queue, and designer owners.

> Define typography roles: app, pane, view heading, section, field label, metadata.

- [ ] Add named design-system typography roles and consume them through shared primitives.

> Define semantic colors separately for active, modified, warning, error, destructive, and primary action.

- [ ] Define token/state ownership for pane/file selection, draft modification, validation/lifecycle severity, destructive controls, and process actions.

> Stop using the orange accent simultaneously for selection, dirty state, and primary action.

- [ ] Apply those separate token roles in affected workspace/designer surfaces.

> Standardize controls into button/icon-button/tab/input/dropdown/row-action variants.

- [ ] Document and use shared PrimeVue/control variants in workbench, Queue, and designer components.

> Standardize icon sizing, hit areas, hover, active, disabled, focus states.

- [ ] Add these requirements to the shared contract and audit the affected controls.

> Add tooltips for every non-obvious icon-only action.

- [ ] Audit workspace menu/tabs, Queue rows, designer, and canvas actions; provide localized tooltip and aria label pairs.

> Reduce permanently visible chrome, especially tab close buttons and low-frequency row actions.

- [ ] Put low-frequency Queue/designer commands in hover/focus or overflow without losing keyboard access; calm inactive tab close affordances.

## P1 — project/panes

> Rework the `Библиотека / + Очередь / + Фасад / + Артефакт` strip so nouns and create actions aren't mixed ambiguously.

- [ ] Make `GeneratedProjectActionPalette` render compiled operation labels/kinds; do not hardcode entity-noun buttons.

> Make tree item type visually explicit with consistent icons and optional secondary metadata.

- [ ] Use `useCutkitDomainUi` and `IdentityBlock`; display only DTO-backed metadata.

> Ensure tree indentation represents actual containment only.

- [ ] Keep `projectExplorerHierarchy` on compiled Lineage containment. Relations are linked roots; Queue entries and previews are not hierarchy.

> Visually separate tab strip from pane controls (`+`, menu).

- [ ] Lay out `GeneratedWorkspaceTabs` and `GeneratedWorkspacePaneMenu` so add-file and pane controls do not resemble tabs.

> Distinguish entity tabs, collection tabs, and tool/designer tabs.

- [ ] Use stable workspace item kind and domain icon in tab presentation; do not infer type from labels.

> Add hover/drag/drop feedback for moving tabs between panes.

- [ ] Add feedback to existing tab drag/drop using stable leaf ids and file keys.

> Add a visible pane drop target when dragging tabs.

- [ ] Render a target in the relevant workspace pane/tab strip while an existing drag is active.

> Support named workspace layouts/presets if multiple workflows are a core product feature.

- [ ] Decide and document persistence authority first; then use versioned UI state or an explicit preference service, never hidden DTO/localStorage state.

## P1 — entity UX

> Add entity header above `Кассеты`.

- [ ] Make Queue identity/type/context legible before its cassette relation region through generated-detail ownership, without a duplicate pane header.

> Make the selected cassette state obvious.

- [ ] Make selected `QueueEntryCard` state explicit as a Queue association, not a mutable cassette entity.

> Make opening/binding a cassette to the designer an explicit interaction.

- [ ] Route readable cassette/design opens through workspace events and the registered `cassette-designer` page; keep binding/replacement in the compiled Queue action.

> Replace the oversized cassette card with a denser entity-field/list component.

- [ ] Rework `QueueEntryCard` as compact preview, canonical source identity, Queue quantity, and configured values within the existing bounded grid/list.

> Add units/validation/steppers to numeric parameters where appropriate.

- [ ] Consume OCCS parameter metadata when available; do not invent A/B/R/T constraints beforehand.

> Add hover explanations for domain shorthand such as A/B/R/T.

- [ ] Add localized help only where OCCS metadata or a documented domain glossary defines it.

> Make destructive actions quieter by default and prominent only on hover/selection.

- [ ] Keep Queue removal confirmation in `QueueEditor`; use hover/focus-revealed row chrome with keyboard access.

> Clarify the meaning/state of the cassette badge currently showing `1`.

- [ ] Trace it to canonical quantity/index/source data, then label it correctly or remove it; do not add another counter.

> Make grid/list controls visually read as view-mode toggles rather than unrelated icons.

- [ ] Implement one pressed-state view-mode control backed by `QueueEditor` local view mode.

## P1 — designer shell

> Add a proper designer header: object name, template, save state, primary actions.

- [ ] Use `DesignerWorkspace` toolbar for open cassette identity, template load, save state, Save, Save as, Reset, and low-frequency overflow.

> Identify or remove the unexplained large `1` input.

- [ ] Trace the control to its persisted OCCS field; label it canonically or remove it.

> Consolidate template/load/save/copy/reset controls into the designer header.

- [ ] Move document commands to the toolbar; retain geometry/object commands at their editing owner.

> Render `Параметры / Слои / Черновик OCSS` as real inspector tabs.

- [ ] Use controlled shared PrimeVue tabs in the Cassette Designer settings rail.

> Separate “expand/collapse section” from “add item” actions.

- [ ] Give each designer section a disclosure control and a distinct labeled creation command.

> Replace cryptic `1/0`, sliders, lightning, plus, chain clusters with a coherent section-toolbar pattern.

- [ ] Map each relevant designer command to a named OCCS operation, with labels or tooltips and overflow for low-frequency actions.

> Keep viewport available while inspecting/editing parameters; avoid requiring vertical scrolling between geometry and controls.

- [ ] Keep viewport mounted as its own `DesignerWorkspace` area while settings and inspector scroll independently.

> Give `Кассета 3D` a deliberate layout role instead of making it another section at the bottom of the same scroll stack.

- [ ] Keep `CassetteFoldedPreview` as a bounded assembly-preview owner with its own selection contract.

## P2 — viewport/CAD interaction

> Add fit-to-view.

- [ ] Surface the existing `DrawingCanvas` fit/reset camera command without duplicating camera state.

> Add explicit zoom/pan affordances or discoverable shortcuts.

- [ ] Document and expose existing canvas zoom/pan controls; any new affordance calls the same operations.

> Add snap/grid controls.

- [ ] Add grid/snap controls only for implemented canvas behavior; visibility alone must not claim snapping.

> Show units in viewport.

- [ ] Read units from the open OCCS document in the viewport status/control area.

> Clarify construction/reference lines using differentiated visual treatment.

- [ ] Classify `DrawingCanvas` layer roles and style construction/reference geometry apart from production and dimensions.

> Clarify corner-handle values such as `0`.

- [ ] Bind each handle label to the exact OCCS offset/parameter it edits and expose accessible help.

> Add hover/selected states for geometry.

- [ ] Use existing canvas hit testing and selected OCCS node/workpiece state, mirrored in the navigator.

> Synchronize canvas selection with Workpiece/feature navigator.

- [ ] Synchronize selected graph node/workpiece/attachment across Cassette Designer, canvas, and assembly navigator.

> Make direct manipulation update inspector fields live and vice versa.

- [ ] Route both editing directions through the same OCCS graph helpers, undo/redo, and validation.

> Add status/readout area for cursor/object dimensions when useful.

- [ ] Define the actual editing use case and canonical measurement source before adding a readout.

## P2 — consistency and polish

> Normalize Russian/English naming (`Workpiece 1` beside Russian UI is conspicuous unless intentional).

- [ ] Audit Russian locale and OCCS generated naming; localize or document the intentional domain-language exception.

> Establish naming rules for generated objects (`Кассета 1`, `Заготовка 1`, etc.).

- [ ] Define defaults in cassette/OCCS construction and locale owners, then reuse them in Queue, designer, and generated surfaces.

> Add empty states that explain what can be created rather than leaving blank dark areas.

- [ ] Derive Explorer, pane, and Queue empty states only from compiled readable actions and registered pages.

> Make disabled state much more distinct from passive/secondary text.

- [ ] Define disabled tokens/states in the design system and apply them to touched shared controls.

> Audit minimum click targets; several icons are visually tiny.

- [ ] Audit workbench, Queue, designer, and viewport icon actions against shared minimum targets.

> Reduce the amount of empty dead space in entity panes while preserving breathing room around actual hierarchy.

- [ ] Adjust semantic pane/body spacing only after hierarchy ownership is clear; do not fill gaps with extra chrome.

> Establish one scrollbar style and minimize nested independent vertical scrolling.

- [ ] Define shared scrollbar policy; scrolling belongs only to workspace, pane, collection, settings, and inspector owners.

## Implementation protocol

- [ ] For every implementation, add an Agent Notes child entry under the exact
  task above with changed files, validation, and deliberate omissions.
- [ ] Update canonical READMEs, run `node scripts/check-docs.js`, and run
  focused tests plus `npm run framework:validate` when its contracts change.
