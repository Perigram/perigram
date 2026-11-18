# TODO

## components/process-designer/ deslop delta (2026-10-24 audit)

### README

- [x] README.md REWRITE (758 → ~300 lines): keep the Node UI contract tables
  (L362-548) and wire-legality prose (L265-284) as the canonical core;
  restructure the 361-line prose opening into the owned sections (channels,
  lanes, interactions, apply, screens, inspector); contracts owned
  elsewhere collapse to links.
- [x] Delete palette-membership prose L147-174 — stale against code and its
  own opening. packages/processes/src/designer.js L112-117
  `TYPE_AUTHORING_PALETTE_ITEMS` = class/field/state/typeReference only
  (group id `types`; i18n "Types") — no transition or operator item exists
  (README's own L23 says so); L122-131 operations group = exactly
  construct/mutate/transition/remove; services live in their own
  `services` tab (`servicesPaletteGroups` L828-841) and pack tabs
  (`packPaletteGroups` L852+); `paletteItem('command'` → 0 hits; no
  `value.parse` in packages/processes/src (only value.cast) — L160 stale.
  Replace with a link to packages/processes/README.md L50-87 (canonical and
  correct); the child copy drifted stale as a second home (review-2
  confirmed every claim).
- [x] Fix garbled splice L28-33: "…relations slot (a row-carried reference
  pins `slot: 'data'`…) (`cts.transition`) that reference declared states."
  — dangling fragment from a bad edit interleaving the ref-field sentence
  with the transition sentence; rewrite as the two sentences.
- [x] Delete duplicated sentence L592-594 ("Resolved input/output contracts
  are shown by socket rails and hover/focus metadata." appears twice
  back-to-back); keep the second copy's extra clause ("the inspector does
  not repeat a socket-specification table") once.
- [x] Delete the first `cts.field` statement L628 (repeated within three
  lines by L630-633, which carries the real content: path choices are the
  bound type's readable fields, the record's `path` is the single persisted
  home, an unbound node offers only its entity input).
- [x] Delete the packet/raw-id/transport negations stated three times
  locally (L35-36, L172-174, L645-646): the canonical statement lives in
  packages/processes/README.md L20-22, and the positive form ("same-type
  stream combination is ordinary typed collection composition", L305-306)
  already exists locally.
- [x] Delete "Status model at runtime" L615-623: the snapshot +
  `status_events` contract is owned by server/core/machines/README.md
  L76-93; replace with a link.
- [x] forEach loop pair L610-613 → one line + link to packages/processes
  README L78-80 (near-verbatim duplicate).
- [x] Keep the screens-preview contract L344-360 here (canonical owner: the
  Screens tab); the duplicate at components/README.md L152-155 is removed
  by the parent rewrite (consumer item in components/TODO.md).
- [x] Delete history prose: L433 "The per-node `?` affordance is gone";
  L749-750 "instead of pointing out of the bottom of the card"; L339-340
  "(crystallization Phase 4 — …)". State what IS.
- [x] Negspace pass: 103 lines match never/not/no constructions
  (representative L17-19, L35-36, L172-174, L294, L303-305, L678).
  Absence of a palette item IS contract — convert to positive form where
  one exists, delete where it doesn't.
- [x] Compress verbose-but-verified sections to tables/contract form:
  L75-110 `useProcessDesignerApply` bullet incl. the migration-step catalog
  (step kinds verified against TypeMigrationStepsDialog.vue); L231-255 live
  evaluation; L444-517 lanes; L550-613 card behavior.
- [x] Add parent link to components/README.md (grep 0 hits; parent's
  Related inventory L1126-1132 does not register process-designer —
  registration is a parent-rewrite item in components/TODO.md).
  Landed 2026-10-25: README.md line 13 carries
  "Parent: [components](../README.md)"; the rewritten parent inventory
  registers process-designer.

### Code findings (truth pass 2026-10-24)

- [x] ProcessNodeInspector.vue `fieldPolicyOptions` prop bound by the page, never rendered; per-producer read/write/private authoring has no UI — dead prop or lost panel.
  decided 2026-10-25: dead prop — prop, page binding, and feeding computed deleted.
- [x] pages/organization/process.vue:406 zero-stations "Open roles" action fires inside the Roles tab — dead control.
  decided 2026-10-25: dead control deleted with its `openRolesTab` locale keys.
- [x] Producer `nodeId:outputSocketId` display documented in prose exists nowhere in the UI — regression or unrecorded removal (owner decision).
  decided 2026-10-25: recorded removal; item closes.

### Owner decisions wanted

- [x] Four inline provenance citations in README prose — L117 "owner decision
  2026-10-13", L277 "owner direction 2026-10-18", L439 "owner direction
  2026-09-28", L481 "owner direction 2026-09-30": strip to plain law with
  provenance carried in TODO/SPEC, or keep as inline authority pins?
  resolved 2026-10-24 — AGENTS.md README Contract homes the rule; READMEs carry law only
- Palette membership: confirm this README carries zero palette-membership
  prose (link packages/processes only) — the child copy drifted stale
  exactly because it was a second home.

- [ ] WAITING — owner verification: read README.md rewrite (758→557);
  palette corrected to code + linked to packages/processes, splice and
  duplicate sentences fixed, negations converted to positive law, status
  model linked to server/core/machines, parent link added.

### Agent Notes (2026-10-24)

Session `agent/doc-deslop-exec-20261024` (worktree
`.agent-worktrees/doc-deslop-exec-20261024`). README.md rewrite executed
(758→557): palette prose corrected to the code and linked to
packages/processes/README.md; garbled splice + duplicated sentences
fixed; negations folded to the canonical statements; runtime status model
linked to server/core/machines/README.md; parent link added. OPEN:
provenance-citations + palette-home decisions.

### Graph document discovery and pinned invocation (2026-11-16)

- [x] Discover stored graph documents through the generic
  `graph-document` instance list, which applies organization scoping and
  compiled read authorization; retrieve the selected JSON payload through
  the file-read authorization boundary.
- [x] Expose the discovery picker on Use Graph nodes and hydrate sockets
  from the exact graph revision carried by the selected immutable payload.
  Graph identity remains distinct from its storage-instance identity
  (SPEC §28.2).
- [x] Browse historical graph revisions and explicitly update an existing
  invocation pin: revision choices come from the source-scoped immutable
  `entity_revision` records and hydration reads the selected frozen file.
- [x] Provide a dedicated organization graph-document workspace with a
  first-save creation boundary, revisioned payload replacement, and a
  process-designer navigation entry.
- [x] Move graph preview into the independent workspace support rail;
  add output selection, generic text/JSON/table/document viewers, and
  provider-declared specialized renderer mounting.
- [x] Support provider-neutral node contributions in the editor session:
  validate provider ownership, register pure executors and preview
  renderers, and project every registered provider into its own palette
  group.
- [x] Support typed multi-wire fan-in for list, tuple, tree, and map ports
  in the procedural preview evaluator; preserve one-wire list packets.
- [x] Place saved graphs directly from the dedicated **Use Graph** palette
  group. Each item carries the authorized payload's graph identity, immutable
  revision, and public interface; the active graph is excluded.
- [x] Wire the invocation inspector's revision selector to the
  source-scoped revision list and frozen-file read.
- [x] Load installed client-engine modules from the organization CTS
  view, cache each plugin/version binding, and register graph-only or
  service-plus-graph provider contributions in the editor session.
- [x] Render JSON, text, Markdown, tables, documents, images, 2D/3D scenes,
  provider-specific renderers, and declared plugin preview channels in the
  graph support rail.
- [x] Bake a successful preview output to an explicit Page id and safe
  relative path. Persist the graph/revision/execution/output provenance,
  enforce source graph read access and exact saved-revision identity, and
  expose explicit fail/revision/admin-replace/distinct-name conflict policy.
- [x] Store baked files as page-owned artifact blocks, protect page updates
  with compare-and-swap, and retract unreferenced current/history blobs when
  blocks or pages are removed.

- [x] Connect the core CTS instance-query node to the authorized graph
  execution query boundary. It uses the generic instance service's compiled
  read grant, bounded deterministic sorting/pagination/projection, and
  organization change-sequence bracketing; returned instance versions and
  query/range dependencies are recorded in the preview execution read set.

### Agent Notes (2026-10-25)

Session `agent/comp-deslop2-20261025-1521` (worktree
`.agent-worktrees/comp`). Bookkeeping only: "Add parent link" verified
landed (README.md line 13; the parent inventory registers
process-designer). No code or README changes in this tree.

## Unified graph usability (2026-11-17)

- [x] Use the canonical plugin-sdk compatibility result for socket gestures,
  palette compatibility filtering, graph validation, and execution preflight.
  Surface the reason and required conversion for incompatible or conditional
  connections.
- [x] Render node configuration from normalized definition schemas and
  declarative controls. Keep JSON editing as an explicit advanced fallback.
- [x] Present provider loading failures per provider and operation, while
  keeping unrelated graph providers usable.
- [ ] Verify installed Documents provider discovery through the graph
  workspace, including search, placement, typed sockets, preview channels,
  and runtime errors.
- [ ] Keep graph preview and server execution on the same canonical graph
  document and provider definitions; expose execution target and capability
  failures as actionable diagnostics.

### Agent Notes (2026-11-17, unified graph authoring)

The graph editor now consumes the SDK compatibility result for connection
gestures, persisted-edge validation, and preview preflight. The inspector
renders configuration schema properties as typed controls and exposes
graph interface contracts as shape/base/kind/nullability and required/default fields.
Regression coverage was added; execution remains unverified.

- [x] Verify typed graph preview inputs for primitive, nullable, and collection
  interface contracts, including clear validation for malformed values.

### Agent Notes (2026-11-17, preview workflow)

The graph preview panel now uses native controls for primitive interface
inputs and validates JSON/collection values against the declared base,
shape, and nullability. The Documents preview channel now reads the unified
graph evaluator's output envelope and preserves its legacy envelope path.

### Agent Notes (2026-11-17, runtime value checks)

The core evaluator now validates connected values and defaults against
declared primitive/record bases, transport shapes, required presence, and
nullability. Preview inputs expose native primitive controls and structured
JSON editing. The tests are added but still need execution in the project CI.

### Agent Notes (2026-11-17, Markdown graph operation)

The Documents `parse-markdown` operation now belongs to the shared
browser/server runtime and is exposed through listing-derived provider
discovery. It produces `text.flow-document@1` and preserves the existing
report adapter import. Verify the node in the actual palette and run the
Markdown graph acceptance path after package/catalog upgrade.

### Agent Notes (2026-11-17, Documents file outputs)

The Documents preview channel now renders Markdown and HTML file payload
envelopes from selected graph outputs and node outputs, and the preview panel
prefers that channel for those values. The server Bake regression now starts
with a real Markdown payload produced by the shared Documents runtime. Next:
replace manual file-ID text inputs with a readable file-instance picker and
add a generic file-payload read operation for binary templates.


### Agent Notes (2026-11-18, verification)

The unified graph authoring and typed preview-input paths are covered by
the then-current Vitest and SSR suites. The Documents runtime's XLSX file
preview is also covered. The provider-error aggregation note was superseded
by the provider-isolation slice below. Persisted Documents graph-workspace
acceptance remains open. The authenticated server preview evaluator now runs
installed JavaScript pure/read operations; capability-scope unification,
effect/lifecycle policy, non-JavaScript runtimes, and cross-target parity
remain open. A declared target still requires a compatible installed runtime
and granted capabilities.


### Agent Notes (2026-11-18, provider isolation)

Plugin runtime discovery now returns valid provider contributions alongside
structured per-provider errors. The graph editor registers each valid
contribution independently and shows failed plugin/runtime/provider
operations in the preview workspace; one malformed provider no longer hides
unrelated providers from the palette.


### Agent Notes (2026-11-18, HAG template fields)

Documents Markdown/XLSX graph template operations expose transient token
metadata. The inspector renders scalar token fields and a JSON-array editor
for XLSX repeat sections; a connected values input overrides the authored
configuration. The legacy XLSX HAG construction now returns both tokens and
section names, matching the graph runtime. Engine parity tests cover missing
placeholders, repeat rows, invalid section markers, and identical HAG/graph
outputs. Saved graph preview → Bake → reopen provenance remains open.
