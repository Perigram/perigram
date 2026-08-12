# TODO: Project Workbench UX — faithful architecture mapping

Status: READY

This is a task-by-task translation of the Project-page UX review. The left
column preserves the original task verbatim; the right column names the actual
CutKit owner and the smallest architectural task. A row is not complete merely
because a similarly named UI exists. Do not add scope that is not in its source
row.

Terms used below: the Project workbench is
`GeneratedProjectWorkspace`; a pane is `WorkspaceSplitNode` +
`GeneratedWorkspacePane`; an entity file is `GeneratedEntityFile`; the Queue
operational surface is `QueueEditor`; a Queue card is a `QueueEntryCard` for an
association, not a cassette entity; and the cassette editor is
`CassetteDesignerV2` over an OCCS `cassette` template.

## P0 — structural UX

| Original task | CutKit task |
|---|---|
| > Define the workspace hierarchy explicitly: **Project → Pane → View/Entity → Object/Selection**. | Define this hierarchy in `components/generated/README.md` and enforce it in `GeneratedProjectWorkspace`, `GeneratedEntityFile`, `GeneratedWorkspacePage`, `QueueEditor`, and `CassetteDesignerV2`. The page/view level is a generated entity file or registered page; Queue-entry and OCCS-workpiece selection are local state. |
| > Separate project navigation from project creation/open actions. | Keep navigation in the Explorer tree and process-compiled actions in `GeneratedProjectActionPalette`; audit `GeneratedProjectWorkspace` so neither surface renders the other's entries. |
| > Make pane management first-class: split, move, close, maximize, reopen, save/reset layout. | Extend only the existing pane-tree/state owners: `WorkspaceSplitNode`, `GeneratedWorkspacePane`, `GeneratedWorkspaceTabs`, `GeneratedWorkspacePaneMenu`, and `utils/project-workspace-state.js`. Preserve entity/page references rather than DTOs. |
| > Establish synchronized selection/context between project tree, entity view, cassette card, designer object, and inspector. | Propagate stable entity/page refs between Explorer and pane; keep Queue-entry selection in `QueueEditor`; synchronize selected OCCS workpiece/face/attachment between `CassetteDesignerV2`, `DrawingCanvas`, and `CassetteFoldedPreview`. Do not promote Queue entries to Explorer nodes. |
| > Give every entity view a proper entity header with type + identity + contextual actions. | Define where identity belongs per generated surface: file tabs/pane body for embedded files and `GeneratedEntityDetail` for standalone routes. Add a header only where the current owner does not already expose identity; do not duplicate `EntityPage` chrome in embedded panes. |
| > Redesign the cassette designer around **viewport + navigator/inspector**, rather than viewport followed by a long vertical form. | Keep `CassetteDesignerV2` composed through `DesignerWorkspace`: persistent 2D viewport, settings rail, assembly navigator/inspector, and folded preview. Remove only form layouts that force geometry off-screen. |
| > Convert Workpieces into a scalable object navigator/tree suitable for future faces/folds/features/hardware. | Build the assembly navigator from OCCS workpieces and joints. Keep cross-workpiece joints as graph edges/DAG data; use a tree only for a selected sheet workpiece's face/fold topology. |

## P1 — design system

| Original task | CutKit task |
|---|---|
| > Define 4–5 semantic surface levels and remove redundant nested borders. | Audit token roles in `assets/tokens/index.js`, `assets/css/main.css`, and `docs/DESIGN_SYSTEM.md`; map workspace, pane, section, control, and overlay surfaces before changing component classes. |
| > Define one spacing scale and enforce it across tree, cards, toolbars, forms, and inspector. | Add or document token-backed compact spacing roles, then apply them only to `GeneratedProjectWorkspace`, shared workspace primitives, Queue entry cards, and Cassette Designer rails. |
| > Define typography roles: app, pane, view heading, section, field label, metadata. | Add named typography roles to the design-system contract and apply them through shared primitives rather than arbitrary one-off Tailwind text classes. |
| > Define semantic colors separately for active, modified, warning, error, destructive, and primary action. | Define token/state ownership in the design system: pane/file selection, unsaved draft, validation/lifecycle severity, destructive controls, and primary process action must use distinct semantic roles. |
| > Stop using the orange accent simultaneously for selection, dirty state, and primary action. | Change affected workspace/designer components to use the distinct semantic tokens above; keep orange only where the revised token contract assigns it. |
| > Standardize controls into button/icon-button/tab/input/dropdown/row-action variants. | Document and apply PrimeVue/shared control variants in `components/shared`; replace ad-hoc variants in the touched workbench, Queue, and designer surfaces only. |
| > Standardize icon sizing, hit areas, hover, active, disabled, focus states. | Define these states in the shared design-system contract and validate the specific workspace, Queue, and designer controls against it. |
| > Add tooltips for every non-obvious icon-only action. | Audit icon-only controls in `GeneratedWorkspacePaneMenu`, workspace tabs, Queue entry actions, `CassetteDesignerV2`, and `DrawingCanvas`; use localized tooltip/aria-label pairs for non-universal commands. |
| > Reduce permanently visible chrome, especially tab close buttons and low-frequency row actions. | Move low-frequency Queue/designer row actions to hover/focus or overflow while keeping keyboard access; revise `GeneratedWorkspaceTabs` close visibility without removing the close operation. |

## P1 — project/panes

| Original task | CutKit task |
|---|---|
| > Rework the `Библиотека / + Очередь / + Фасад / + Артефакт` strip so nouns and create actions aren't mixed ambiguously. | Map this strip to `GeneratedProjectActionPalette`: use process action kind/label contracts to distinguish open/link/create operations; do not hardcode entity-noun buttons. |
| > Make tree item type visually explicit with consistent icons and optional secondary metadata. | Use `useCutkitDomainUi()` icon/type presentation in Explorer nodes and `IdentityBlock`; add only metadata available in the entity DTO/shared display contract. |
| > Ensure tree indentation represents actual containment only. | Keep `projectExplorerHierarchy` based on compiled Lineage containment. Project relations remain linked roots; Queue entries and summary previews never become containment children. |
| > Visually separate tab strip from pane controls (`+`, menu). | Change `GeneratedWorkspaceTabs` and `GeneratedWorkspacePaneMenu` layout so add-file and pane commands are not tab-looking items. |
| > Distinguish entity tabs, collection tabs, and tool/designer tabs. | Extend `workspaceFilePresentation`/tab presentation using stable item kind (`entity` or registered page) and domain icon; do not infer type from tab labels. |
| > Add hover/drag/drop feedback for moving tabs between panes. | Add feedback to the existing drag/drop flow in `GeneratedWorkspaceTabs` and pane leaves; use their stable pane ids and reference keys. |
| > Add a visible pane drop target when dragging tabs. | Render a drop target in `GeneratedWorkspacePane`/tab-strip scope during the existing tab drag operation. |
| > Support named workspace layouts/presets if multiple workflows are a core product feature. | First decide and document storage authority. If accepted, implement through versioned `project-workspace-state` as device-local UI state or through an explicit preference service—never a hidden DTO/localStorage hybrid. |

## P1 — entity UX

| Original task | CutKit task |
|---|---|
| > Add entity header above `Кассеты`. | In the Queue generated detail surface, make Queue identity/type/context legible before its cassette relation region. Reuse `GeneratedEntityDetail`/`EntityPage` ownership; do not add a second header inside every pane. |
| > Make the selected cassette state obvious. | Make selected `QueueEntryCard` state explicit in `QueueEditor`; it represents the Queue association, not a mutable cassette entity. |
| > Make opening/binding a cassette to the designer an explicit interaction. | Route readable cassette/design opens through `GeneratedEntityFile` workspace events and the registered `cassette-designer` page. Keep binding/replacement under the compiled Queue relation action. |
| > Replace the oversized cassette card with a denser entity-field/list component. | Rework `QueueEntryCard` as a compact association row/card: preview, canonical source identity, Queue quantity, and configured values. Preserve the bounded grid/list behavior in `QueueEditor`. |
| > Add units/validation/steppers to numeric parameters where appropriate. | Use OCCS parameter metadata when it exists. Until then, retain `InputNumber` and document-level units without inventing A/B/R/T ranges, units, or step semantics. |
| > Add hover explanations for domain shorthand such as A/B/R/T. | Add localized tooltip/help text only where canonical OCCS parameter metadata or a documented domain glossary supplies the meaning. |
| > Make destructive actions quieter by default and prominent only on hover/selection. | Keep Queue-entry removal confirmed by `QueueEditor`; render its trigger as hover/focus-revealed row chrome without hiding it from keyboard users. |
| > Clarify the meaning/state of the cassette badge currently showing `1`. | Trace the rendered badge to its canonical Queue quantity/index/source field. Replace it with the owning label/control or remove it; do not add a decorative counter. |
| > Make grid/list controls visually read as view-mode toggles rather than unrelated icons. | Implement one pressed-state view-mode control in `QueueEditor` backed by its existing local `viewMode` state. |

## P1 — designer shell

| Original task | CutKit task |
|---|---|
| > Add a proper designer header: object name, template, save state, primary actions. | Use `DesignerWorkspace` toolbar for the open cassette identity/name, template load command, modified/saved state, Save, Save as, Reset, and overflow. Preserve the existing persistence boundary. |
| > Identify or remove the unexplained large `1` input. | Trace that control in `CassetteDesignerV2` to its OCCS field. Give it a canonical label or remove it if it has no persisted/operational meaning. |
| > Consolidate template/load/save/copy/reset controls into the designer header. | Place these document-level commands in the designer toolbar; leave geometry/object commands in their relevant rail or viewport. |
| > Render `Параметры / Слои / Черновик OCSS` as real inspector tabs. | Use the shared PrimeVue tabs contract for `CassetteDesignerV2` settings rail, with a controlled active tab and a consistent tab component. |
| > Separate “expand/collapse section” from “add item” actions. | Give each designer section an explicit disclosure control and a separate labeled create action; do not overload one plus/icon button. |
| > Replace cryptic `1/0`, sliders, lightning, plus, chain clusters with a coherent section-toolbar pattern. | Audit the relevant `CassetteDesignerV2` section toolbars; map each command to a named OCCS operation, overflow it if low-frequency, and retain tooltips/aria labels. |
| > Keep viewport available while inspecting/editing parameters; avoid requiring vertical scrolling between geometry and controls. | Preserve the `DesignerWorkspace` viewport as a dedicated pane/area while settings and inspector scroll independently. |
| > Give `Кассета 3D` a deliberate layout role instead of making it another section at the bottom of the same scroll stack. | Keep `CassetteFoldedPreview` as the assembly rail preview with its own bounded layout and selection contract. |

## P2 — viewport/CAD interaction

| Original task | CutKit task |
|---|---|
| > Add fit-to-view. | Expose the existing `DrawingCanvas` fit/reset command in its discoverable viewport control surface; do not duplicate camera state. |
| > Add explicit zoom/pan affordances or discoverable shortcuts. | Document and surface existing canvas zoom/pan controls and shortcuts in `DrawingCanvas`; add only missing controls that call the same camera operations. |
| > Add snap/grid controls. | Add grid/snap controls only when `DrawingCanvas`/OCCS editing supports real snap behavior; grid visibility alone must not claim snapping. |
| > Show units in viewport. | Read units from the open OCCS document and render them in the 2D viewport status/control area. |
| > Clarify construction/reference lines using differentiated visual treatment. | Classify drawing layers/roles in `DrawingCanvas` and style construction/reference geometry separately from production and dimension layers. |
| > Clarify corner-handle values such as `0`. | Bind designer-handle labels to the exact OCCS parameter/offset they edit and expose an accessible label/tooltip. |
| > Add hover/selected states for geometry. | Use the existing `DrawingCanvas` hit testing and selected OCCS node/workpiece state; ensure the same selection is reflected in the designer navigator. |
| > Synchronize canvas selection with Workpiece/feature navigator. | Synchronize `CassetteDesignerV2` selected graph node/workpiece/attachment with `DrawingCanvas` and its assembly navigator. |
| > Make direct manipulation update inspector fields live and vice versa. | Route both canvas manipulation and inspector editing through the same OCCS graph update helpers, preserving undo/redo and validation. |
| > Add status/readout area for cursor/object dimensions when useful. | Define a real editing use case and canonical measurement source before adding a viewport readout; omit it when it has no implemented operation. |

## P2 — consistency and polish

| Original task | CutKit task |
|---|---|
| > Normalize Russian/English naming (`Workpiece 1` beside Russian UI is conspicuous unless intentional). | Audit `i18n/locales/ru.json` and generated OCCS object naming rules; either localize generated labels or document an intentional domain-language exception. |
| > Establish naming rules for generated objects (`Кассета 1`, `Заготовка 1`, etc.). | Define generated identity defaults in the cassette/OCCS construction owner and locale contracts; use the same rule in Queue, designer, and generated entity surfaces. |
| > Add empty states that explain what can be created rather than leaving blank dark areas. | Add empty states to Explorer/panes/Queue relation regions only from their compiled readable actions and registered pages; do not discover global actions. |
| > Make disabled state much more distinct from passive/secondary text. | Define disabled control tokens/states in the design system and apply them to touched PrimeVue/shared controls. |
| > Audit minimum click targets; several icons are visually tiny. | Audit icon controls in the workbench, Queue, designer, and viewport against the shared minimum target contract. |
| > Reduce the amount of empty dead space in entity panes while preserving breathing room around actual hierarchy. | Adjust pane/body spacing through semantic tokens after hierarchy ownership is clear; do not fill space with cards, badges, or explanatory chrome. |
| > Establish one scrollbar style and minimize nested independent vertical scrolling. | Define the shared scrollbar policy and keep scrolling at the workspace, pane, settings rail, inspector rail, and collection owners only. |

## Implementation protocol

- [ ] For each implemented row, add a child **Agent Notes** entry here with the
  date, exact original-task row, files changed, validation, and any deliberate
  non-implementation.
- [ ] Update the canonical README for every changed contract and run
  `node scripts/check-docs.js`.
- [ ] Run focused tests for the touched owner; run `npm run framework:validate`
  for generated-screen, shared component, token, or package-contract changes.
- [ ] Do not mark a row complete based on visual inspection alone. Record the
  user-visible behavior test or manual reproduction that proves it.
