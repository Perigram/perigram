# TODO: Project Workbench UX Hierarchy

Status: READY

Audit date: 2026-08-12

Scope: generated Project workspace, pane/file chrome, generated Queue workspace,
queue entries, Cassette Designer v2, and the shared Vue design system.

This backlog translates the Project-page critique into the current CutKit
architecture. It is intentionally separate from `TODO.md`; completing an item
here still requires the normal task-specific Agent Notes and documentation sync
in the implementation session.

Canonical contracts:

- [generated Project workspace](./components/generated/README.md#project-workspace)
- [component and Cassette Designer contracts](./components/README.md)
- [shared workspace primitives](./components/shared/README.md)
- [design-system tokens and policy](./docs/DESIGN_SYSTEM.md)
- [Queue UI contract](./components/entities/Queue/README.md)
- [OCCS specification](<./docs/specs/Cassette spec/SPEC.md>)

## Architecture translation

| Review concept | Current CutKit owner | Architectural meaning |
|---|---|---|
| Project-level workbench | `GeneratedProjectWorkspace.vue` | Process-generated Project `entityDetail` overload; owns the fixed action strip, Explorer shell, active pane, and device-local workspace state. |
| Project navigator | Project Explorer in `GeneratedProjectWorkspace.vue` | Source-only PrimeVue tree projected from generated regions, compiled Lineage containment, and explicit Project relations. |
| Project actions | `GeneratedProjectActionPalette.vue` | Process-compiled Project actions and direct-Project child creates; not navigation and not a global command registry. |
| Pane | `WorkspaceSplitNode.vue` + `GeneratedWorkspacePane.vue` | Recursive PrimeVue split leaf with a pane-local ordered file list and selected file. |
| Entity tab/view | `GeneratedWorkspaceTabs.vue` + `GeneratedEntityFile.vue` | A file tab projected from an entity reference; the body loads the same generated detail contract used by the standalone route. |
| Designer tab/view | `GeneratedWorkspacePage.vue` + `workspace-pages.js` | An app-registered workspace page. Process data may select its id but never an arbitrary Vue component. |
| `Tex` cassette list in the reviewed screen | `GeneratedQueueDetail.vue` -> `QueueEditor.vue` | The open entity is a Queue. `QueueEditor` is its operational overload, and the repeated objects are queue entries. |
| Cassette card in a Queue | `QueueEntryCard.vue` | Queue-local association data: a typed `cassette_design` reference plus quantity. It is not itself a cassette entity. |
| Cassette Designer | `CassetteDesignerV2.vue` | Editor for a persisted `cassette` template whose canonical definition is OCCS under `data.definition`. |
| Workpiece list | Cassette Designer assembly rail | A projection of OCCS workpiece definitions/occurrences and cassette joints. It is a DAG, because a workpiece can have more than one parent attachment. |
| 2D viewport | `DrawingCanvas.vue` | Shared layer-aware canvas. It already owns fit/reset, button and wheel zoom, Shift+drag pan, geometry hover/selection, and designer handles. |
| 3D viewport | `CassetteFoldedPreview.vue` | Folded assembly preview with orbit, fit/reset, workpiece raycast selection, and isolation. |

## Baseline already implemented

Do not reopen these as greenfield structural tasks:

- [x] Project navigation and Project actions have separate owners: the Explorer
  contains sources only, while the fixed action strip contains process-compiled
  actions only.
- [x] Explorer nesting uses compiled Lineage containment; ordinary Project
  relations stay in **Linked entities** rather than becoming a second hierarchy.
- [x] Project panes split right or down recursively, close independently, retain
  pane-local tab order/selection, and persist split proportions plus Explorer
  state by user, organization, and Project in versioned browser storage.
- [x] Entity files and registered workspace pages share the same pane/tab shell.
  Entity tabs already carry entity-type icons and DTO-backed lifecycle status.
- [x] Embedded entity files load the canonical generated detail screen. Their
  full `EntityPage` header is deliberately suppressed because the active file tab
  owns identity in a pane; do not add a duplicate entity header above every pane
  body.
- [x] Cassette Designer v2 already uses `DesignerSurface` and
  `DesignerWorkspace` with a persistent 2D viewport, document/settings rail,
  assembly rail, and folded 3D preview. It is not the legacy long form shown in
  older screenshots.
- [x] The assembly rail and 2D/3D viewports already share workpiece selection.
  Face selection, attachment editing, workpiece isolation, and relation
  diagnostics are implemented.
- [x] Queue entries already use a bounded responsive grid, a fixed cassette
  thumbnail, PrimeVue `InputNumber`, queue-local quantity, and immutable design
  replacement through the process Link action.

## Decisions and invariants

- The visual hierarchy is **Project workspace -> pane -> file -> local
  selection**. “File” covers both entity files and registered workspace pages.
- A Project pane must not invent another entity DTO, action source, hierarchy,
  or route. It renders generated contracts and stable entity/page references.
- A queue entry is not an entity and must not appear in the Project Explorer.
  The useful context chain is **Project -> Queue file -> queue entry -> immutable
  cassette design -> source cassette template**.
- Editing a source cassette template must not silently change an existing
  `cassette_design` or Queue entry. Queue parameter edits bake/choose a new design
  and replace the typed relation through the authorized process action.
- Do not replace the OCCS workpiece DAG with a tree that loses multi-parent
  joints. A tree may be used only for the selected sheet workpiece's internal
  face/fold topology.
- Use **OCCS**, not “OCSS.” `cassette` means reusable template;
  `cassette_design` means exact materialized design; `cassette_instance` means a
  produced physical cassette.
- Workspace layout is currently device-local. Named cross-device layouts require
  an explicit preference-service contract and are not a localStorage-only UI
  shortcut.
- Signal orange may continue to represent intent, selection, and keyboard focus
  under the current design-system contract. It must not also become the modified
  marker or lifecycle-warning channel.

## P0 — make context and document state unambiguous

### 1. Add a typed workspace-file state contract

- [ ] Define one UI-only file presentation record for entity files and registered
  pages: stable key, kind, icon/type, label, active state, optional lifecycle
  state, and optional modified state. Keep entity DTOs out of persisted workspace
  state.
- [ ] Keep these states visually distinct: active pane, selected file, entity
  lifecycle status, designer modified state, validation warning/error, and
  primary action.
- [x] Have `CassetteDesignerV2` emit modified/saved state through
  `GeneratedCassetteDesignerWorkspacePage` and `GeneratedWorkspacePage`; clear
  modified only after a successful save or an explicit reset/load decision.
- [x] Render lifecycle status through `EntityStatus` only. Render the modified
  marker as a separate shape/token with an accessible label; never reinterpret a
  lifecycle glyph as a dirty dot.
- [ ] Keep Explorer selection synchronized with the active entity/page reference.
  An entity-bound registered page remains nested under its source entity and must
  not cause the source entity and page to appear simultaneously selected.

Acceptance:

- Opening `Library -> Cassette -> Cassette Designer`, editing the OCCS draft,
  switching panes, saving, and closing the page always exposes which pane/file is
  active, which entity owns the page, whether the draft is modified, and the
  cassette entity's independent lifecycle state.
- Reload restores stable file/page references but never claims an unsaved draft
  is saved. Existing session-draft recovery remains authoritative for recoverable
  local content.

Primary scope: `components/generated/GeneratedProjectWorkspace.vue`,
`GeneratedWorkspaceTabs.vue`, `GeneratedWorkspacePage.vue`,
`GeneratedCassetteDesignerWorkspacePage.vue`, `components/CassetteDesignerV2.vue`,
and `utils/project-workspace-state.js` only if the serialized schema changes.

### 2. Move Cassette Designer document commands into its shared toolbar

- [x] Use the existing `DesignerWorkspace#toolbar` slot for a compact document
  header containing the current cassette template identity/name, OCCS document
  profile and units, modified/saved state, template load, Save, Save as, Reset,
  and low-frequency overflow actions.
- [x] Treat template load as a command/picker, not as a second selected-name field.
  Keep the current entity-bound page identity visible while the picker is closed.
- [ ] Keep global parameters, layer visibility, and OCCS JSON in the settings rail;
  keep workpiece topology and folded preview in the assembly rail.
- [ ] Preserve the current explicit-save boundary, 50-step undo/redo history,
  session-draft recovery, and parent-provided save/load handlers.
- [x] Confirm destructive/reset actions when they would discard a modified draft.

Acceptance:

- At every supported container width, the viewport remains mounted and the
  operator can identify the open cassette, OCCS profile/units, and save state
  without scrolling a side rail.
- Saving the same template and Save as remain different operations and continue
  to emit the existing canonical OCCS payload plus `extensions.cutkit.graphTree`.

Primary scope: `components/CassetteDesignerV2.vue`,
`components/shared/DesignerWorkspace.vue`, both locale files, and the component
README contract.

### 3. Make Queue-entry context explicit without violating immutability

- [x] Add local selection to `QueueEditor`/`QueueEntryCard`; selection identifies
  the active queue entry association, not a new entity or Explorer node.
- [ ] Show the selected entry's typed source chain with actions appropriate to
  what is actually readable: inspect the referenced `cassette_design`, open its
  source `cassette` template in the registered designer page, or replace the
  design through the existing compiled Link/creator action.
- [x] Route entity/page opens back through the generated workspace events. Do not
  add static `/cassettes/...` navigation or a Queue-local workspace-page registry.
- [ ] If source provenance is missing or unreadable, retain the current typed-id
  fallback and do not imply that the design is editable.
- [x] Keep quantity as Queue association data. Keep parameter configuration as
  immutable design replacement; never patch a shared `cassette_design` in place.

Acceptance:

- Selecting a Queue entry visibly binds its thumbnail, quantity, parameters, and
  context actions. Opening the design or its source template creates/selects the
  correct file in the active pane and preserves the Queue file for return.
- Changing the source template does not change the Queue entry until an
  authorized replacement design is created and linked.

Primary scope: `components/QueueEditor.vue`,
`components/entities/Queue/QueueEntryCard.vue`, `GeneratedQueueDetail.vue`,
`GeneratedEntityFile.vue`, and the generated workspace event path.

### 4. Turn the assembly rail into a scalable OCCS navigator and inspector

- [x] Keep the top-level workpiece occurrence/joint projection DAG-safe. Show
  workpiece type (`sheet`, `profile`, `solid`, `hardware`), role, selected state,
  isolation/visibility state, and unresolved/impossible joint diagnostics.
- [ ] Move selected workpiece/hardware properties and joint editing out of every
  repeated row into one selection-driven inspector surface. Rows should retain
  identity, concise metadata, and an overflow action menu.
- [ ] For a selected sheet workpiece, add a subordinate face/fold outline derived
  from its graph tree. Faces and folds may nest because that topology is a tree;
  joints between workpieces remain relation edges and must not be faked as
  containment.
- [ ] Synchronize navigator, 2D face selection, attachment mode, folded 3D
  selection/isolation, and inspector content in both directions.
- [ ] Keep profile and hardware creation declarative through current OCCS helpers;
  do not introduce feature-local constructive-solid history.

Acceptance:

- A cassette with multiple sheet workpieces, a profile, hardware, and a
  multi-parent attachment can be navigated without duplicate property forms or
  lost joint edges. Selection is identical in the navigator, 2D canvas, 3D
  preview, and inspector.

Primary scope: `components/CassetteDesignerV2.vue`,
`components/CassetteFoldedPreview.vue`, `components/shared/DrawingCanvas.vue`,
and pure helpers under `utils/occs/` / `utils/cassetteV2Renderer.js` only when a
new projection is required.

## P1 — strengthen the workbench visual grammar

### 5. Formalize workbench surface roles and remove redundant rectangles

- [ ] Audit the current token-backed stack (`page`, `chrome`, `content`, `subtle`,
  `raised`, form field) in dark and light mode before adding tokens. Assign each
  role to workspace background, pane/file body, section, interactive row, form
  control, and overlay.
- [ ] Promote any missing durable roles through `assets/tokens/index.js`, the
  PrimeVue preset/runtime bridge, and Tailwind aliases. Do not add page-local raw
  palette colors.
- [ ] Remove borders that repeat a boundary already owned by a pane, Panel,
  ScrollablePanel, card, or form control. Use spacing, a single separator, and
  surface contrast inside that owner.
- [ ] Reserve elevation for overlays. Structural queue cards, designer rails,
  pane bodies, and nested sections remain non-elevated.
- [ ] Verify usable contrast in both themes; do not optimize only the reviewed
  dark screenshot.

Acceptance:

- Project shell, active pane, file body, Queue section, queue entry, designer
  rail, viewport, and input can be identified without counting nested outlines.
- `shared/design-system.spec.js` continues to reject raw route-active palette
  utilities and every declared runtime token remains projected.

Primary scope: `assets/tokens/index.js`, `assets/presets/re_l.js`,
`assets/css/main.css`, `tailwind.config.js`, shared layout primitives, and the
four task surfaces only.

### 6. Define compact typography, spacing, and control roles

- [ ] Extend the existing monospace design contract with named roles for pane/file
  label, operational heading, section heading, field label, value, and secondary
  metadata. Prefer shared primitives/classes over local font-size patches.
- [ ] Define one compact spacing rhythm for pane headers, Explorer rows, queue
  entries, designer rails, section toolbars, and form rows. Preserve larger page
  spacing outside the bounded workbench.
- [ ] Standardize the relevant controls as primary operation, secondary button,
  toolbar icon button, segmented/tab navigation, inline row action, overflow
  action, destructive action, input, and entity picker.
- [ ] Maintain a consistent minimum hit target, visible keyboard focus, disabled
  state, hover state, pressed state, and tooltip policy. Every non-obvious
  icon-only action needs localized accessible text and a tooltip.
- [ ] Put destructive and low-frequency row commands in hover/focus-revealed
  chrome or an overflow menu; they must remain keyboard discoverable.

Acceptance:

- The same role has the same emphasis and interaction states in Explorer, tabs,
  Queue entries, and Cassette Designer. Disabled text is not confused with muted
  metadata, and keyboard-only users can reach actions hidden visually until row
  focus.

### 7. Improve file tabs and pane management

- [ ] Calm inactive tabs: show close persistently only for the active tab, on tab
  hover, or within keyboard focus. Keep lifecycle status and modified state
  visible according to their own semantics.
- [ ] Preserve the standalone add-file picker and pane ellipsis as separate pane
  controls; do not render either as a fake file tab.
- [x] Add tab reordering and move-to-pane using the existing recursive leaf ids.
  Show explicit valid drop targets for tab insert, split right, and split down.
- [x] Add pane maximize/restore without destroying the recursive split tree, plus
  a recoverable recently-closed file list. Closing the last pane remains
  impossible; closing a file does not delete its entity.
- [ ] Add keyboard quick-open over `workspaceItems` and keyboard commands for
  file close, next/previous file, split, and maximize. Commands must invoke the
  same state operations as pointer UI.
- [x] Version and normalize persisted workspace state when tab order, maximized
  pane, or recently-closed references enter the schema.

Acceptance:

- A file can be reordered, moved between existing panes, or dropped to create a
  split with clear pointer/keyboard feedback. Reload preserves the resulting
  stable references and layout; malformed old storage still normalizes safely.

Primary scope: `GeneratedWorkspaceTabs.vue`,
`GeneratedWorkspacePaneMenu.vue`, `GeneratedProjectWorkspace.vue`,
`WorkspaceSplitNode.vue`, `utils/workspace-splits.js`, and
`utils/project-workspace-state.js`.

### 8. Clarify the Project action strip

- [x] Keep the strip action-only, but make each visible command distinguish its
  actual generated kind: create child, link relation, update, transition, send,
  or run command. Use `generatedActionLabel()` and manifest metadata; do not
  hardcode Library/Queue/Facade/Artifact branches.
- [x] Keep direct-Project child creates deduplicated by visible operation and keep
  relation labels scoped to their target entity.
- [x] Add localized tooltips where the compact visible label is necessarily a
  noun. The tooltip should state the operation without exposing action ids or
  storage fields.
- [x] When actions overflow, keep them in an action-strip overflow surface rather
  than allowing horizontal action chrome to compete with the Explorer toggle.

Acceptance:

- From the rendered strip alone, a user can distinguish “create Queue,” “link
  Library,” and “run Project command,” while the available set remains exactly
  the current user's compiled and lifecycle-applicable action set.

### 9. Refine Queue-entry density and parameter controls

- [x] Treat grid/table controls as one PrimeVue view-mode selector with pressed
  state and a single accessible label.
- [ ] Keep `QueueEntryCard` bounded and container-responsive, but validate its
  preview/content ratio against the narrow pane widths produced by recursive
  splits. Do not remove production/dimension layers just to make the card smaller.
- [ ] Keep template provenance, quantity, and parameters visually grouped.
  Clarify typed-id fallback and whether parameters are configurable or locked.
- [ ] Use OCCS document units at group/viewport level. Add per-field suffix,
  step, minimum, maximum, or description only when supplied by a real parameter
  contract; do not infer semantics from names such as `A`, `B`, `R`, or `T`.
- [x] Move remove to quiet row chrome/overflow and preserve confirmation at the
  owning Queue workflow boundary.
- [ ] Retain parameter-expression strings in templates and numeric values in
  materialized designs. Queue controls edit exact design inputs, not template
  expressions.

Acceptance:

- Queue entries remain legible in a half-width Project pane, expose quantity and
  configurable exact values without oversized empty space, and never mislabel an
  arbitrary OCCS parameter or mutate a shared design.

### 10. Use real settings tabs and coherent section toolbars in the designer

- [x] Replace the `Parameters / Layers / OCCS draft` button row with a controlled
  PrimeVue tab/segmented navigation component that exposes one active settings
  mode and survives responsive relocation.
- [ ] Keep section expansion separate from add/create actions. A chevron controls
  disclosure; plus creates an item; neither substitutes for the other.
- [ ] Replace icon clusters in global parameters, layers, workpieces, profiles,
  hardware, and attachments with a shared section-toolbar pattern: concise title,
  optional state/count, primary local action, overflow actions.
- [ ] Use labels for domain-specific low-frequency operations when rail width
  permits; otherwise require localized tooltips and accessible names.
- [ ] Keep OCCS draft read-only unless a separate validated raw-document editing
  workflow is explicitly designed.

Acceptance:

- Parameters, layers, OCCS JSON, assembly navigation, and selected-object
  properties have stable, distinguishable navigation and action semantics at
  wide, medium, and stacked container widths.

## P2 — advanced viewport and workspace capabilities

### 11. Add a truthful 2D viewport HUD

- [ ] Consolidate existing zoom out, fit/reset, and zoom in commands into a
  compact viewport control surface and expose the Shift+drag pan gesture through
  tooltip/shortcut metadata.
- [ ] Add grid visibility and document-unit display. Keep the current grid purely
  visual until a real direct-manipulation operation supports snapping.
- [ ] Show current editing context (assembly/workpiece/attachment, selected
  workpiece, selected face/fold) without duplicating the full document header.
- [ ] Differentiate production layers, dimension annotations, designer section
  planes, attachment markers, selected geometry, and hover hit targets through
  their existing semantic layer/overlay contracts.
- [ ] Add cursor coordinates or snap readout only when they drive an implemented
  operation. Do not ship inert CAD controls.

Acceptance:

- A first-time operator can discover fit, zoom, pan, grid, units, and current
  selection. Toggling UI state does not change OCCS geometry or production layer
  output.

### 12. Add named layout presets only after pane-state operations stabilize

- [ ] Define whether presets are device-local convenience or user/organization
  preferences. Use the existing preference boundary for cross-device state; do
  not silently expand localStorage into a product contract.
- [ ] Save only versioned workspace UI references and split/layout preferences,
  never entity DTOs or unsaved OCCS documents.
- [ ] Provide Save layout, Apply layout, Rename, Delete, and Reset to default with
  clear scope (user, organization, Project).
- [ ] Resolve missing/inaccessible entity references defensively when applying a
  preset and preserve the rest of the layout.

Acceptance:

- Applying a preset cannot grant access, restore stale DTOs, discard a recoverable
  designer draft, or corrupt the current recursive split tree.

## Validation required for implementation slices

- [ ] Update the canonical README for every changed contract; do not copy the
  contract into this backlog as completion notes.
- [ ] Run `node scripts/check-docs.js` for every documentation slice.
- [ ] Run `npx vitest run shared/design-system.spec.js` for token/shared-primitive
  changes.
- [ ] Run focused workspace state, split, Explorer hierarchy, Queue entry,
  DrawingCanvas, OCCS renderer, and folded-preview suites for the changed concern.
- [ ] Extend `e2e/project-workspace.spec.js` with user-visible behavior for file
  state, move/drop, restore, queue-entry context opens, and designer ownership as
  those features land.
- [ ] Run `npm run framework:validate` when a shared/framework manifest contract
  changes. Do not run `npm run build` or start a dev server from an agent task
  unless explicitly requested.
