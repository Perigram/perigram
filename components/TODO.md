# TODO

## Design-system consistency plan ([SPEC](./SPEC.md), owner direction 2026-11-19)

- [ ] WAITING — owner verification: Phase 1 (P0) — every `InstanceCard`
  slot has an explicit per-variant contract with development warnings on
  supplied-but-unsupported slots, and the five registry cards pass slots
  gated to the variant; fact values carry semantic typography roles
  resolved from the field/display contract; shared primitives expose no
  hardcoded user-facing English and locale-sensitive dates follow the
  active i18n locale.
- [ ] Phase 2 (P1) — Establish one component contract model: audit the
  design-system vocabularies, document each one's owner, make the
  variant/surface/display-mode mapping explicit, make preview policy real
  or remove it (SPEC Phase 2).
- [ ] Phase 3 (P1) — Formalize composition recipes from repeated real
  structures through existing primitives and slots (SPEC Phase 3).
- [ ] Phase 4 (P1) — Extend enforcement from visual to behavioral
  contracts: props/slot/variant matrix tests, rendered variant matrices
  for registered cards, accessibility and theme coverage, UI lab
  generated from the contract vocabulary (SPEC Phase 4).
- [ ] Phase 5 (P2) — Repository-wide consistency audit against the
  finalized contracts (SPEC Phase 5).

### Agent Notes (2026-11-19, Phase 1)

Session `agent/design-consistency-p1-20261119` (worktree
`.agent-worktrees/design-consistency-p1-20261119`). Landed:

- `InstanceCard` declares slot support per variant (`inline`:
  `inline-extra`; `compact`: header/title/before-identity/subtitle/
  compact-content; `card`: header/title/before-identity/subtitle/default/
  footer); a supplied slot outside its variant logs a development warning
  (conditional template slots compile to conditional slot registration, so
  guards double as declarations). All five registry cards migrated:
  identity chrome gated to compact+card, fact bodies through
  `compact-content` (compact) and the default slot (card), footers and
  the UserCard avatar dead inline branch cleaned.
- `FactRows` renders row roles: `factRoleFor` in `utils/fact-rows.js`
  resolves `technical` for number/quantity/instant bases and
  `display: 'code'`, `body` otherwise — the measured-value mono face law
  `FieldControl` already carried, now derived once for read-only facts.
  EntityRevisionCard's hand rows carry explicit roles.
- `formatDataValue` renders instants as locale dates (raw ISO strings
  previously passed through) and quantity objects through the shared
  `formatQuantity` (`{value, unit}` rows previously dropped); boolean
  labels are required localized inputs (no English fallback).
- Untranslated defaults removed: `StandardDialog` cancel/save resolve
  through `common.cancel`/`common.save`; date formatting threads the
  active i18n locale through `formatValue`/`formatQuantity`,
  FieldControl, StatGrid, TimelineCollection, StateHistory,
  PayloadRevisionPicker, TargetedInvitations, OrganizationCard, and the
  `instanceFactRows` translator (`{ t, te, locale }`).
- Tests: `components/shared/instance-card-slots.spec.js` (rendered
  variant×slot matrix + warnings), `fact-rows.spec.js` (role typography),
  `standard-dialog.spec.js` (i18n footer labels), fact-display-vocabulary
  role/locale cases; the design-system guard pins the role split and the
  compact-gated subtitle law.
- READMEs updated: shared (InstanceCard slot table, popup expansion law,
  FactRows row contract, StandardDialog labels), entities (card law),
  utils (fact-rows derivation), shared/ui-mapping (formatValue locale).
- Validation: instance-card-slots 5/5, fact-rows 2/2, standard-dialog
  2/2, fact-display-vocabulary 10/10, design-system 34/34, localization,
  SSR smoke 29/29, shared+components sweep 448 with the icon-fonts
  worktree-node_modules artifact resolved by symlink; check-arch and
  docs:validate green.

## components/ deslop delta (2026-10-24 audit)

### README

- [x] components/README.md REWRITE (1132 → ~150 lines): keep style guide (as
  table), UI inventory policy, top-level loose-SFC inventory (AuthProgress,
  ChatSupport, Footer, LanguageSwitcher, PermissionEditor,
  PermissionRuleBuilder, ThemeSwitcher, UserForm — review-2: parent rewrite
  must keep that inventory), localization, sizing, child links. Every
  contract section moves to its owning child; deleted-family sections leave
  outright. Target shape per audit open question confirmed by review-2.
- [x] Same rewrite — relocate L156-474 generated-screen contract to
  components/generated/README.md (5-line pointer);
  L843-1107 chat prose to components/shared/README.md (surfaces) with a
  semantics link to server/features/support/README.md;
  L123-155 process-designer/workflow-override prose to
  components/process-designer/README.md; L492-585 tokens/surface ladder to
  assets/tokens/README.md (both describe the same canvas:
  components README `--ck-page-background`, tokens README `--p-surface-100`,
  aliased 1:1 in assets/tokens/index.js:150).
- [x] Same rewrite — fix composer contradiction: L1099-1101 claims the
  composer input is a PrimeVue `InputGroup`; components/ChatSupport.vue:1091-1092
  renders it as a plain `rounded-ui bg-subtle` div with Textarea + Buttons
  (L1001 passage matches code — keep L1001, delete L1099-1101).
- [x] Same rewrite — delete orphaned fragments: L119-122 (section begins
  mid-sentence "workbench and organization workflow overrides page. It
  normalizes flat legacy workflows…" — process-designer contract);
  L367 "nesting another entity card inside the queue item panel.";
  L371 "safe visual graph document." (sentence tails from deleted neighbors).
- [x] Same rewrite — delete stale L119-155 designer claims, contradicted by
  child README + code (review-2 confirmed all three): "node accent colors
  identify those groups" vs child L170-171 "Canvas nodes carry no category
  accent" (ProcessNode.vue carries no accent/signal class);
  "executable nodes keep Manual/Automatic execution visible on the node" vs
  ProcessNode.vue:135-137 wired-or-manual reads wire presence;
  "Role access remains secondary inspector configuration" vs child L459-467
  (lane drop writes grants; inspector keeps LEVELS).
- [x] Same rewrite — restate L480-481: `utils/design-system-contract.js` is
  the primary vocabulary source (field groups, entity contracts, primitives)
  that design-system.js binds, per the source/binding split.
- [x] Same rewrite — L95 pattern table credits `dtoToScreenInstance` to
  `shared/ui-mapping`; it lives in utils/instance-shape.js:51 (only
  `titleFor` is shared/ui-mapping/index.js:451).
- [x] Same rewrite — fold duplicated rows to canonical homes: L5-9 avatar
  `:label` rule → shared/README.md:499-503; L546-560 row-surface recipe →
  components/ui-mapping/README.md:284-288; L608-612 composables rule →
  shared/README.md:7-14; L261-301 mobile home tabs → composables/README.md:401.
- [x] Same rewrite — delete history/negspace prose: L4 layer-regime
  backstory clause, L550 "row stripes are gone, the row IS the card", L394
  "cassettes are file types since the cleanup"; rewrite "must not select
  arbitrary Vue component names", "never merge onto ChatSupport's own
  h-full root" and kin as positive statements; split the ~420-word L4 Style
  Guide paragraph into the table.
- [x] Same rewrite — register process-designer and calls in the Related
  inventory (L1126-1132 currently omit them).
- [x] components/shared/README.md REWRITE (936 lines): compress L358-393
  (DrawingCanvas), L408-481 (InstanceInlineRef), L892 (FilterBuilder ~40-line
  paragraph) to props/contract + invariants; keep the layer-color resolution
  order and the fetch/entityContext rules.
- [x] Same rewrite — one canonical InstanceCard section (contract told twice
  in-file L882-884 + L900-923, plus entities/README.md:16-25 and
  components/README.md:463-474 → all link here).
- [x] Same rewrite — chat sections (InstanceCard chat entry L584-614,
  SupportMessageContent, MessageAttachments, ChatAttachmentPicker) become
  the single frontend chat-surfaces home; message semantics link
  server/features/support/README.md.
- [x] Same rewrite — scope L877-878 "direct PrimeVue imports are owned only
  by the wrappers" to entity option lists: three live direct-import sites —
  components/shared/ChatBotPanel.vue:114, components/ChatSupport.vue:1467,
  pages/organization/models.vue:204 (`primevue/select` for scalar selects).
- [x] Same rewrite — delete slop: L881 one-line StandardPage.vue stub
  (duplicates full entry L808-819); "the former SpecsBlock content" L31/L53;
  MotionDock retirement sentence L211-213; L293-294 negspace triple → the
  positive flat-state contract sentence.
- [x] components/entities/README.md: fold the seven child READMEs into one
  surface table (surface key → DTO contract → live consumers) keeping each
  card's 3-5 real invariants (verified: ArtifactCard.vue:65
  `:show-status="false" :expandable="false"`; User/Organization popup →
  DirectoryDetailSurface; EntityRevision read-only; LayerStandard/PenTemplate
  master-data hiding); drop the Card Contract restatement L16-25, link
  shared/README.md; restate L39-41 as the ENTITY_CONTRACT_BY_TYPE dual-key
  lookup (design-system-contract.js:200-204 — wire `typeId` + surface `key`,
  both live vocabularies).
- [x] components/entities/ArtifactTemplate/README.md rewrite on fold: L9-13
  names `pages/assets/templates.vue` (pages/assets/ does not exist — pages/
  holds auth, chats.vue, index.vue, invitation, organization, screens,
  terms-and-conditions.vue, test) and `components/ArtifactLayoutEditor.vue`
  (zero refs repo-wide); the card is registry/inline-ref active only
  (utils/design-system.js:25, InstanceInlineRef.vue:26,
  design-system-contract.js field groups) — rewrite as inline-ref surface
  with server feature link.
- [x] components/generated/README.md TRIM: drop dates from headings L190
  ("owner decision 2026-10-11") and L489 ("SPEC §Generative UI, 2026-10-23");
  delete L59-63 future-migration narration; dedupe mobile home tab contract
  L329-347 to composables/README.md:401 (one sentence + link); compress
  L348-418 PanelMenu internals to the observable contract (selection follows
  active tab, header/chevron click split, labels crop); trim repetitive
  negspace L452-460, L491-493.
- [x] components/directory/README.md TRIM: delete L8-10 global-search clause
  (zero refs to any global-search component repo-wide); rewrite negspace
  L27-31, L44-46, L57-59 positive ("open through the workspace-open seam",
  "flat hosted column").
- [x] components/artifacts/README.md TRIM: delete ArtifactDetail references
  L9-13 + L43-44 (zero refs repo-wide; both live mounts —
  components/shared/InstancePreviewMedia.vue:2-5,
  components/ui-mapping/PreviewBox.vue:12-15 — pass explicit `:source=`,
  none passes `:artifact=`); replace with the single CTS payload mount;
  state current kind registry contents, delete retirement tracking L10-13,
  L46-53.
- [x] components/ui-mapping/README.md TRIM: fix garbled splice L27-34
  (create-dialog sentence interleaved with the type-labels seam sentence)
  and L156-160 ("render one require multiple times"); dedupe to
  shared/ui-mapping/README.md — create dialog L33-50 (canonical L87-110,
  keep only dialog host, `onLoadType` lazy-load, link-action picker),
  arrangement ladder/budgets L184-197 (canonical L403-428/450-458, same
  constants `SIDE_MAX_WEIGHT`, 12-track grid, 60rem split,
  `REGION_COLUMN_EARNED_REM`, `minmax(0,Nfr)`, inert empties), editor
  presentation list L488-495 (canonical L111-119), `titleFor`/
  `formatQuantity` L11-14 (canonical L69-81), `resolveListLayout` L161-166
  (canonical L121-148); merge SortControl prose L104-137 + L139-146; delete
  "the dissolved CollectionToolbar" L104; add StatGrid.vue entry (live:
  RegionCollections.vue:75,115; shared/design-system.spec.js:477); add
  parent link.
- [x] components/calls/README.md TRIM: delete L87-88 parenthetical ("the old
  per-surface ring banners kept ringing after an accept elsewhere"); state
  the idempotent-attach invariant, drop the flicker autopsy L158-159; trim
  L7 negspace opener to the positive half ("built from shared primitives,
  semantic tokens, and lazily-imported livekit-client"); L72 minor; tighten
  L92-106 room-lifecycle snapshot semantics to ~half (verified:
  stores/calls.js debounce L73, keep-last L68, stream-reopen refetch L275).
- [x] components/media/README.md: add parent link (registered at
  components/README.md:1129; Related list omits the parent).

### Code deslop

- [x] Collapse the dual entity-card maps: components/shared/InstanceInlineRef.vue:21-27
  `CARD_COMPONENTS` (5 keys; penTemplate/layerStandard absent — DrawingCanvas
  imports those cards directly at DrawingCanvas.vue:19-20) into the
  design-system registry (utils/design-system.js:16-26 binds `component`);
  InstanceInlineRef resolves through the registry. Fold confirmed by
  review-2 (registry-proof reachability: design-system.js L1-7 imports,
  L16-24 map).
  Landed 2026-10-25: card binding extracted to `utils/design-system-cards.js`
  (`DESIGN_SYSTEM_CARD_COMPONENTS`, the one key→card map); design-system.js
  composes it into `DESIGN_SYSTEM_ENTITIES`; InstanceInlineRef's
  `CARD_COMPONENTS` deleted (binding lookup inside the `cardComponent`
  computed); DrawingCanvas's two direct card imports repointed through the
  binding. Lean binding module chosen over importing design-system.js
  directly: that pulls `test-data/factories.js` (and its undeclared `bson`
  import) into the app-wide shared chunk.
- [x] Delete `DESIGN_SYSTEM_STATUS` (utils/design-system-contract.js:115-151,
  33 hardcoded legacy status labels): `grep -rn DESIGN_SYSTEM_STATUS` over
  repo returns only the definition; framework.manifest.json carries no
  status vocabulary (0 hits). Review-2 confirmed 0 refs incl. workers/.
- [x] utils/design-system-contract.js:1-22, 42-47: replace the dated
  audit-narration comments ("Live-type audit (2026-09)", "misabeled 'cnc'
  inside the deleted legacy domain package", "Phase 7 cuts it later", "those
  rows died with the legacy fact channel") with one line (residual fact
  vocabulary for `artifact_template` only; declare new types instead); home
  the rule in components/entities/README.md.
  Landed 2026-10-25: header and audit-narration comments deleted;
  `DESIGN_SYSTEM_FIELD_GROUPS` carries one line (artifact_template residual
  only, new types declare field descriptors), the surface tables carry one
  pointer line to `utils/instance-display-contract.js`; the rule is homed
  in entities/README.md (Registry section).
- [x] Room-name grammar single home: utils/call-rooms.js:9-36 re-derives
  (`call:direct:<sorted ids>`, `call:group:`, `call:org:`) by prefix surgery
  while server/features/livekit/service.js:42-46 builds the same grammar
  via `directCallRoom`/`orgCallRoom`/`groupCallRoom`; both files' comments
  admit the mirror. Canonical: `shared/call-rooms.js` (pattern:
  shared/ui-mapping crosses the boundary); client and server import it.
  Server-side consumer change belongs to the livekit feature's delta.
  Landed 2026-10-25: `shared/call-rooms.js` created (builders +
  room↔conversation mapping, pure, no imports); utils/call-rooms.js keeps
  the display helpers and imports the grammar; server service.js and spec
  and the client consumers (stores/calls, ChatSupport, CallPanel,
  GeneratedHomeWorkspace, utils spec) repointed via `#shared/`; livekit,
  calls, and stores READMEs name the single home; shared/README.md carries
  the grammar row.
- [x] Type-label chain single seam: components/ui-mapping/type-labels.js:11-20
  and utils/generated-labels.js:11-29 both resolve `labelKeyForType` locale
  key → authored-name fallback from different data sources (prop type vs
  registry store). One seam taking a type-record-or-id, in
  shared/ui-mapping (decided 2026-10-25).
  Landed: `typeLabelFor` in shared/ui-mapping/index.js (pure chain),
  `generatedEntityLabel` in utils/generated-labels.js as the app binding
  (entities-key table + registry record, Pinia-guarded), type-labels.js
  deleted, engine components and pickers repointed (InstanceMultiPicker's
  use of the seam was an unresolved reference — Nuxt never auto-imported
  it — fixed by the repoint).
- [x] Comment trims: components/ui-mapping/type-labels.js:5-10 header homes
  the label-precedence contract (and says "legacy renderer") → one pointer
  line; GeneratedMappingScreen.vue:90-95 (Toast host) and
  BoardCollection.vue:95-100,278-284 (board machine authority) → one-fact
  comments, READMEs own the prose; components/calls/CallPanel.vue:337-338
  flicker autopsy → the mutate-tiles-in-place invariant;
  components/shared/InstanceCard.vue:187-188 keeps "Render-policy icons
  are the single icon source", drops the legacy-`instanceUiFor` death
  notice.
  Landed 2026-10-25: GeneratedMappingScreen Toast-host comment → one line
  (ui-mapping/README.md already owns the Toast/ConfirmDialog prose);
  BoardCollection script header → machine-authority one-liner, drag block
  → drop-intent one-liner (README entry owns the full board contract);
  CallPanel → tiles-in-place invariant (calls README owns the prose). The
  type-labels.js sub-item is void — the file was deleted by the
  type-label seam task; the InstanceCard line landed 2026-10-25 (prior
  session).

### Deletions

- [x] Parent README stale-family sections, reachability verbatim: CassetteDesignerV2
  block L692-835 — grep `CassetteDesignerV2`: only
  workers/facade/surfaces/cassette-designer.mjs + the README; `CassetteDesigner.vue`:
  zero refs repo-wide; designer contract already lives in
  workers/facade/README.md + occs/README.md — delete, link the plugin.
  CassetteEditorDialog L836-841 — zero refs repo-wide. RemnantCard/RemnantDetail +
  GeometryCaptureCard/GeometryCaptureDetail L667-674 — all four zero refs
  repo-wide (review-2: README-only mentions).
  Landed 2026-10-25: verified in the rewritten components/README.md — the
  CassetteDesignerV2 block, CassetteEditorDialog, and the Remnant/
  GeometryCapture family sections are gone; plugin-owned designer surfaces
  link workers/facade.
- [x] components/artifacts/ArtifactViewer.vue:55-91 (`artifact`/`revision`
  props, artifact-entity branch) + utils/artifact-viewer.js artifact path +
  artifact-viewer.spec.js: sole consumer of the branch is the spec; both
  live mounts pass `:source=` only. Deletion lands with the
  artifact-family cutover (root TODO.md; decided 2026-10-25).
  Landed 2026-10-25 (artifact-family cutover): the artifact-entity
  branch, `utils/artifact-viewer.js`, and the spec deleted; the
  surviving `source`-prop viewer lives on as
  `components/shared/FilePayloadViewer.vue` (`InstancePreviewMedia` and
  `PreviewBox` repointed); `components/artifacts/` and its README are
  gone.
- [x] Delete entities/{Artifact,ArtifactTemplate,EntityRevision,LayerStandard,Organization,PenTemplate,User}/README.md
  after the fold into entities/README.md.
  Landed 2026-10-25: verified — all seven entity dirs hold only their card
  .vue files; the folded surface table lives in entities/README.md.

### Additions

- [ ] components/type-designer/ (DescriptorEditor/FieldNode/StateNode/TypeNode.vue —
  live, referenced from pages/organization/process.vue and
  process-designer/inspector/DeclarationInspector.vue) has no README and
  appears in no area scope (review-2 coverage gap). Write its README or
  fold its contract into components/process-designer/README.md per owner
  decision below.

### Instance pickers render procedural list items (SPEC §22.13)

- [ ] WAITING — owner verification: every instance-selection control
  renders its options through the one-line instance option row and builds
  options through one shared derivation:
  `InstancePicker`/`InstanceMultiPicker` (generated ref editors),
  `SpotPartsRow` (per-spot part picks — currently a direct
  `primevue/select` import the guard rejects), the chat create-prompt
  selects, `TypedValueControl` (process designer ref inputs), and the
  plugin editors' instance selects (sheet-design design pick,
  cassette-designer profile-library pick). Root defect: entity
  recognition in `utils/instance-select.js` accepts only
  `identity`-block DTOs, so §3 wire records and screen instances render
  plain names.

#### Agent Notes (2026-10-28)

Session `agent/instance-pickers-20261028` (worktree
`.agent-worktrees/instance-pickers-20261028`). Landed: recognition in
`utils/instance-select.js` extended to the §3 wire record and the screen
instance dialects; `instancePickerOptions`/`instanceOptionLabel` added as
the one option derivation (identifier-field label via `titleFor`,
type-prefixed for multi-type pickers per the SPEC §22.8 mixed-type law);
`InstancePicker` renders the option row in the AutoComplete and TreeSelect
option slots; `InstanceMultiPicker`/`SpotPartsRow`/`TypedValueControl`
build entity-bearing options through the derivation (SpotPartsRow moves
onto the shared wrapper — the failing direct-import guard now passes);
chat create-prompt options carry `entity`+`typeId` at the support-row
seam; sheet-design design options stamp the type id and drop the raw-id
label fallback; the cassette profile-dialog library pick rides the host
pack `InstanceSelect` (dead `entitySelectValue` helper removed). Person
pickers (chat members, calls, directory) stay on the UserChip law.

#### Agent Notes (2026-10-28, picker row)

Session `agent/picker-row-20261028` (worktree
`.agent-worktrees/picker-row-20261028`), owner feedback: the compact
micro card is the wrong item for picker lists (76px rows, ragged heights
between card-worthy and chip fallbacks, a full card inside the select
trigger, the multi's outside-cards grid beside a `!w-10` pencil sliver).
Landed: `InstanceInlineRef` gains `variant="option"` — the one-line
picker row (36px preview thumb with the type glyph fallback, truncating
identifier title, trailing state tag, type-label meta for mixed lists
via `showTypeLabel`); the thumb-forcing CSS is shared behind
`instance-preview-slot`; both wrappers, both `InstancePicker` slots, and
the tree nodes render it; `InstanceMultiSelect` selected values render
as glyph chips inside the control (PrimeVue chip display + the
chip-surface recipe) and the outside-cards grid retires with its spec
assertions. SPEC §22.13 restated on the row.

#### Agent Notes (2026-10-28, closed control)

Session `agent/sheet-sane-chrome-20261028` (worktree
`.agent-worktrees/sheet-sane-chrome`), owner review of the sheet editor
chrome: the option row rode the closed control's trigger and the
editor pickers hand-rolled labels (`row.name`), so constructed sheets
(whose name lands in `fields.name`) read "Unnamed" in the trigger and
matched nothing in the filter. `InstanceSelect` entity mode now derives
the label through `instanceRecordTitle` over the served type view (the
option's label stands in until the view loads) and the trigger renders
that label — PrimeVue's own one-line control rhythm. SPEC §22.13 gains
the closed-control sentence.

#### Agent Notes (2026-10-29, identity chip)

Owner feedback: the label-only trigger hid the instance (nameless
records rendered empty). The closed control now renders the identity
chip (chip-surface recipe + type glyph) and the label chain is total:
identifier title → wire name → option label → unnamed fallback.
`dtoToScreenInstance`'s wire-name absorption fires on null identifier
rows too. SPEC §22.13 restated on the chip.

### Chip faces and tree rows (owner direction 2026-11-09)

- [ ] WAITING — owner verification: default chips keep the preset chip
  geometry in tables, cards, chats, and pickers; the inline-code face
  belongs to page text blocks and their read composition; instance tree
  pickers render tree rows with the type glyph and identifier. SPEC §22.8
  carries the prose-face sentence for owner reconciliation.

#### Agent Notes (2026-11-09, agent/chips-fix-20261109)

- `chip-surface.js` carries two faces: the default bordered chip over
  Aura geometry (`FILE_CHIP_CLASS`, `INSTANCE_CHIP_CLASS`) and the prose
  face (`FILE_PROSE_CHIP_CLASS`, `INSTANCE_PROSE_CHIP_CLASS`) for the
  page editor nodes and `MarkdownBlocks`. `InstanceInlineRef` and
  `FileChip` expose `prose`; the preset owns default chip geometry and
  `.ck-chip` owns the prose layout. `InstanceTree` renders entity rows as
  type glyph plus identifier.
- Focused: design-system, instance-select, ui-mapping, generated, SSR
  suite; guards.

### Region reload strips take no flow slot (SPEC §22.8)

- [ ] WAITING — owner verification: the indeterminate reload bar takes no
  flow slot (SPEC §22.8): `LAYOUT.reloadBar` overlays the collection
  surface's top edge in `RegionCollections` (tables, grids, boards) and
  the nested detail card in `RegionBlock`; `LAYOUT.reloadBarUnder`
  underlines the record header on depth-0 detail pages (anchored under
  the `SurfaceHeader` wrapper), so appearing/vanishing shifts nothing
  below it and the header's avatar stays clear.

#### Agent Notes (2026-10-28, reload strip)

Session `agent/reload-strip-20261028` (worktree
`.agent-worktrees/reload-strip-20261028`). Landed: one
`LAYOUT.reloadBar` entry in `shared/ui-mapping/tables.js`; the three
`ProgressBar` sites swap `h-1` flow slots for the overlay classes; the
detail region root and the list branch's collection wrapper carry
`relative` anchors. SPEC §22.8 gains the loading-strip law; the
ui-mapping README's data-state bullet restates the bar as overlay.

#### Agent Notes (2026-10-28, reload strip placement)

Session `agent/reload-strip-placement-20261028` (worktree
`.agent-worktrees/reload-strip-2-20261028`), owner feedback: the
top-edge overlay cuts through the depth-0 record header's avatar.
Landed: `LAYOUT.reloadBarUnder` — the depth-0 detail bar moves under
the `SurfaceHeader` wrapper (`bottom-0` underline, riding the gap above
the body); collections and nested cards keep the surface-top overlay.
SPEC §22.8 restated on both placements.

### Owner decisions wanted

- [x] ArtifactViewer artifact/revision branch: delete now, or hold until the
  TODO-tracked artifact-family retirement ("payload-trait flip") lands?
  decided 2026-10-25: with the artifact-family cutover (root TODO.md), not before.
- [x] artifact_template UI: with pages/assets deleted the card is inline-ref-only;
  keep as revision-provenance surface or retire the family with Phase 7?
  decided 2026-10-25: retires with the artifact-family cutover (root TODO.md).
  Landed 2026-10-25: `ArtifactTemplateCard.vue`, the design-system
  contract row, the residual `DESIGN_SYSTEM_FIELD_GROUPS` map (now
  empty), and the factories deleted with the cutover.
- type-designer/: own README, or fold its contract into
  components/process-designer/README.md (its consumer)?
- [x] Type-label seam home: shared/ or utils/?
  decided 2026-10-25: shared/ui-mapping.

- [ ] WAITING — owner verification: read components/README.md (1132→137,
  inventory owner) + entities/README.md; 7 entity READMEs folded (files
  deleted, links repointed), CassetteDesignerV2 section dead,
  process-designer/calls/type-designer rows added.

### Agent Notes (2026-10-24)

Session `agent/doc-deslop-exec-20261024` (worktree
`.agent-worktrees/doc-deslop-exec-20261024`). Parent README rewritten as
inventory owner (1132→137): style-guide table, loose-SFC inventory, child
links; CassetteDesignerV2 section dead, 4 deleted families gone, orphan
fragments repaired, process-designer/calls/type-designer rows added. 7
entity READMEs folded into entities/README.md (files deleted, links
repointed); shared/generated/directory/artifacts/ui-mapping/calls/media
trims landed. OPEN: DESIGN_SYSTEM_STATUS + dual-map + code items,
ArtifactViewer/artifact_template/type-designer decisions, type-designer
README creation (row exists, file pending).

### Agent Notes (2026-10-25)

Session `agent/deslop-execute-20261025`. DESIGN_SYSTEM_STATUS deleted;
type-label seam unified (see code item — type-labels.js gone, one chain in
shared/ui-mapping, InstanceCard legacy-death comment cut, DataBlock
contract comment reduced to a README pointer). OPEN: dual entity-card map,
room-name grammar, remaining comment trims, ArtifactViewer/type-designer
README (cutover-owned items untouched).

### Agent Notes (2026-10-25, comp-deslop wave 2)

Session `agent/comp-deslop2-20261025-1521` (worktree `.agent-worktrees/comp`).
Landed: dual entity-card map collapsed into `utils/design-system-cards.js`
(one binding composed by the registry; InstanceInlineRef and DrawingCanvas
repointed — the lean module keeps test-data/bson out of the shared client
chunk); design-system-contract audit comments replaced with one-liners and
the residual-vocabulary rule homed in entities/README.md; room-name grammar
single-homed in `shared/call-rooms.js` (server livekit service + spec and
client consumers import it; display helpers stay in utils/call-rooms.js);
comment trims (GeneratedMappingScreen, BoardCollection, CallPanel).
Bookkeeping verified: parent-README stale families, entities child READMEs,
process-designer parent link. OPEN: type-designer README home (owner
decision), ArtifactViewer/artifact_template (cutover-owned).

### Agent Notes (2026-10-25, artifact cutover)

Session `agent/artifact-cutover-20261025-1655`. Cutover-owned boxes
closed: ArtifactViewer artifact/revision branch + artifact-viewer.js +
spec deleted (survivor: `components/shared/FilePayloadViewer.vue`,
`i18n` key `file.previewUnavailable`); artifact_template family deleted
(card, contract row, factories, residual field-group map emptied).
Parent README inventory row for `artifacts/` dropped; `components/SPEC.md`
still links the folder — filed in the root TODO for the owner.

### Record header look (owner direction 2026-10-29)

- [ ] WAITING — owner verification: the record title renders
  container-stepped (1.5rem, 1.75rem from the header's 34rem width
  step — the viewport-clamped page-title stays on real pages); the
  header action cluster groups by control kind (record utilities /
  generated actions / machine transitions) over hairline dividers; the
  depth-0 reload strip rides a permanent 4px lane under the header
  (SPEC §22.9 amended).

#### Agent Notes (2026-11-13)

Session `agent/record-surface-fix-20261113195620` (worktree
`.agent-worktrees/record-surface-fix-20261113195620`), live-audit fixes
over the demo org (DOM-geometry probes): the cluster's leading hairline
rendered with an empty left side everywhere — RegionBlock registers the
`cluster` slot with a dead `v-if` inside, so the old
`$slots.cluster` check always passed; the divider law now counts a
group only when it renders a node (`Comment`-aware slot check), the
overflow ellipsis joined the generated-actions group (it rode the row's
gap-2 alone before), and the step-up group gained its divider (the peek
cluster read `💬 ⤢` with a stray leading hairline and no separator
before the step-up). The in-place rename input carried PrimeVue's
padding and border on top of the record-title role (50px box over the
32px title line — the header jumped on rename); its pt zeroes them so
the input occupies the title's own line box.

Session `agent/header-look-20261029` (worktree `.agent-wt-look-20261029`),
on top of the recipe rehoming (`agent/header-system-20261029`). New
typography role `record-title`; `.ck-record-header` steps it at its
existing width step; `TYPE_BY_LEVEL[0]` names it. `LAYOUT` gains
`actionGroup`/`actionDivider`/`reloadLane`; `reloadBarUnder` dies —
RegionBlock's depth-0 branch renders the lane with the strip inside.
Design-system spec's role manifest and the ui-mapping header contract
test updated. ui-mapping + design-system 143/143 and 166/166 with
neighbors; SSR smoke 23/23.

### Record peeks and popup rhythm (owner direction 2026-10-29)

- [ ] WAITING — owner verification: instance and file chips raise a
  compact data-aware peek on hover (preview band, identity + state,
  compact facts; a file chip's payload preview and name facts) and open
  the full record popup / file viewer on click; the record popup rides
  the compact rhythm and arrangement sees its measured width (SPEC
  §22.14).

#### Agent Notes (2026-11-13)

Session `agent/record-surface-fix-20261113195620` (worktree
`.agent-worktrees/record-surface-fix-20261113195620`): the popup host
guards in `RegionBlock` were dead — `resolveContainerTraits` never
returned `hostKind`, so every `hostContainer.value?.hostKind ===
'popup'` check fell through and the popup rendered the routed-page
presentations: an editable rename title (measured input in the popup
header), the editor page branch for editor-bound types, and the record
overlay session. The traits record now carries its `hostKind`
(SPEC/README/spec pins updated); the popup title stays read-only, the
popup renders the compact document with the bounded editor band
mounting read-only (`RecordEditorBody` floors the mode; editing opens
through the step-up), and the overlay stays off. The popup header's
step-up button sat flush against the dialog close (0px gap — the
flex-1 row stretches to the dialog edge); one ladder step of trailing
padding separates them. The DXF editor page rendered a second toolbar
under the unified header with the record name again plus its own Save
(SPEC §4 violation); the surface binds `pageChrome` and the row is
gone.

Session `agent/chippeek-20261029` (worktree
`.agent-wt-chippeek-20261029`). New shared `HoverPeek.vue` (delayed
hover popover, grace dismissal, hover-capable pointers only);
`InstanceInlineRef`'s identity chip and `FileChip` carry it.
`resolveAttachmentPeek` in `components/generated/file-preview-contract.js`
sniffs bare-descriptor peek modes. `HOST_PROFILES.popup` density 1 →
0.75; `EntityPopup` measures the dialog body through
`provideContainerTraits({ hostKind: 'popup', elRef })` —
`useMeasuredWidthRem` now attaches when a late-mounting dialog box
appears. ui-mapping SPEC/README density lines follow the new law.
Validation: ui-mapping 109/109, design-system 34/34, SSR smoke 23/23,
check-arch clean, docs guard unchanged (one pre-existing broken link in
workers/nesting at HEAD); live probe `e2e/zz-chippeek-probe.spec.js`
against the dev stack: instance chip peek + record popup and file chip
peek + viewer all pass, artifacts under `test-results/chip-peek-*`.
Pre-existing at HEAD: `framework.manifest.json` stale (framework spec
red at clean HEAD too).

Session `agent/chippeek2-20261029` (worktree `.agent-wt-chippeek2-20261029`),
owner review round 2: the peek now rides the popover's own preset padding
(the `p-0` content override is gone), media bands frame themselves as the
framed media region (`rounded-ui` + hairline + subtle ground) with the new
`fill` passthrough (InstancePreview → InstancePreviewMedia →
GeometryPreview → DrawingCanvas fill) so exactly one surface frames the
preview, and the instance peek speaks the detail surface — the record's
full fact vocabulary capped at eight rows — beside identity, state, and
the preview band.

#### Agent Notes (2026-10-30)

Session `agent/popup-fixes-20261030` (worktree
`.agent-worktrees/popup-fixes-20261030`), live-audit round over the demo
org (agent-browser + isolated Playwright probes, report
`/tmp/opencode/popup-audit-report.json`): the record popup stayed open
over surfaces its actions opened — the editor action navigated home and
opened the editor pane behind the modal, the conversation action stacked
the chat drawer under it. `EntityPopup` now closes on the
workspace-entity/workspace-page open events and on the support dialog
opening. The compact ref's preview band killed its own card's open (the
band carried the interactive-child marker and `GeometryPreview` claimed
the click): refs/tiles/peeks mount previews with the new
`InstancePreview :interactive="false"` passthrough and the compact band
marker is gone — the whole card opens the record. The peek body click
now opens the record (`HoverPeek` `open` event), and a peek that would
carry nothing beyond identity stays away (the FileChip `enabled` law).
The popup dialog header carried a dead empty title span; SPEC §22.8
outlaws a dialog title repeating the record name, so the header keeps
only the expand action — the shared-README EntityPopup paragraph now
states that law. Validation: design-system 34/34, SSR smoke 23/23,
check-arch clean, docs guard clean. Known open finding: an authored
record with neither payload nor fields renders its compiled detail as a
header-only body inside the xl popup (empty modal canvas — data-side,
not the popup host).

#### Agent Notes (2026-10-30, round 2)

Session `agent/popup-swap-20261030` (worktree
`.agent-worktrees/popup-swap-20261030`). Owner follow-up: clicking an
instance inside the record popup did nothing — the generator's identity
opens emit `open-instance` without a screen key, and `EntityPopup`'s
swap handler accepted only manifest screen keys, so types with no
compiled detail screen (nested `cassette-template` inside a library
floor) died silently. The swap now resolves the same chain the popup
host uses: the emitter's screen key, the synthesizable detail, the
record floor. Validation: design-system 34/34, SSR smoke 23/23,
check-arch clean; live probe: the library popup's cassette chip swaps
the popup subject to the cassette record floor.

#### Agent Notes (2026-10-31)

Session `agent/datablock-cut-20261031` (worktree
`.agent-worktrees/datablock-cut-20261031`), owner direction: DataBlock is
entity-era and dies. New `utils/fact-rows.js` (`instanceFactRows`) — the
one fact-row derivation for read-only surfaces over the generated field
vocabulary (`resolveFieldGroups`: every declared field, sections as
grouping) with the field-access gate, generated-key labels, and
`decorateDataValue`; rows carry `group`, `cap`/`skip` serve surface
budgets. New `components/shared/FactRows.vue` renders the resolved rows
(DataBlock's markup, variants, and container query). Consumers migrated:
InstanceInlineRef (peek/tile/compact), InstanceSurfaceContent, User/
Organization/PenTemplate/EntityRevision cards, DirectoryDetailSurface,
GeneratedOrganizationOverview, ui-lab. `instance-display-contract.js`
shrinks to surface chrome; `DataBlock.vue` deleted;
`data-display.js` gains `formatFileSize`/`payloadFactLine`. The instance
peek now also renders the payload block's name facts (SPEC §22.14 file
peek law) — the content the facade file types actually carry (their
declared scalars are the identifier plus geometry blobs). Specs:
fact-display-vocabulary rewritten over the new derivation (widget gains
mass/code scalars), design-system manifest + framework manifest
regenerated. Validation: design-system 34/34, fact-vocabulary 9/9,
localization + framework-packages 52/52 total, SSR smoke 23/23,
check-arch clean, docs guard clean (the workers/nesting broken link is
pre-existing at HEAD).

Session `agent/peekchip-20261031` (worktree
`.agent-wt-peekchip-20261031`): the generated card tile's identity chip
(§22.16 handful collections render records — the primary hoverable chip
on preview-dominant cards) is now a peek trigger. New shared
`InstancePeek.vue` — the one record peek body (band, identity + state,
capped fact rows, payload name facts) — consumed by both the card chip
and `InstanceInlineRef`'s chip; `instancePeekHasContent`
(utils/fact-rows.js) is the pure trigger gate. Validation:
design-system 34/34, fact-vocabulary 10/10, localization clean, SSR
smoke 24/24, check-arch clean.

Session `agent/peekfix-20261031` (worktree `.agent-wt-peekfix-20261031`),
owner direction: the record peek hosts the procedural data contract —
the same compiled record surface the instance popup hosts. New
`scopedDetailScreen` (detail-screen-actions.js) is the one scoped-screen
resolution (screen key → synthesized pair → record floor, instance bound
into scope); `EntityPopup` consumes it (its inline chain and swap guard
dedupe onto it) and `InstancePeek.vue` renders `GeneratedScreenHost`
over it with the measured `popup` container profile (peek popover 24rem,
32rem height cap). Peek triggers gate on openability (a record surface
exists), the hand-composed peek content (band/identity/rows/payload
line) and `instancePeekHasContent` die, and the invented payload
mime·size line is gone (owner rejection — `payloadFactLine` deleted).
Validation: design-system 34/34, fact-vocabulary 9/9, localization
clean, SSR smoke 24/24, check-arch clean, docs guard clean
(workers/nesting link pre-exists).

### Record peek compact presentation (owner direction 2026-10-31)

- [ ] WAITING — owner verification: instance hover peeks render the
  compiled record surface in the peek presentation — record preview,
  compact identity line with state, the record's action cluster and
  step-up expand — inside the 20rem peek panel, open the full record on
  click, and page the record through expand.

#### Agent Notes (2026-10-31)

Session `agent/peekcompact-20261031` (worktree
`.agent-worktrees/peekcompact-20261031`). `GeneratedScreenHost` and
`GeneratedMappingScreen` carry `presentation` into the depth-0 detail
region; `RegionBlock` renders the compact identity/state line for `peek`
in place of `SurfaceHeader`. `InstancePeek` passes `peek`; `HoverPeek` is
a 20rem column with a 22rem height cap. Validation: ui-mapping 110/110,
framework packages 5/5, SSR smoke 23/23, check-arch clean. Pre-existing
at HEAD: design-system three `GeneratedScreenHost.vue` findings (raw
`Dialog`, `text-color-secondary`, raw typography); docs guard broken
`workers/nesting/README.md` link.

#### Agent Notes (2026-10-31, round 2)

Session `agent/peekcompact2-20261031` (worktree
`.agent-worktrees/peekcompact2-20261031`), owner direction: the peek
keeps the record's buttons and gains a step-up. `SurfaceHeader` carries
`compact` (identity line, state surface, action cluster) and
`expandable` (step-up button, `expand` event); `RegionBlock` renders it
for `peek` over the body. `expandable`/`expand` thread through
`GeneratedMappingScreen` and `GeneratedScreenHost`; `InstancePeek` turns
`expand` into `openInstanceInWorkspace`, and `HoverPeek` dismisses on the
workspace instance/page open events. Owner follow-up: the construct
re-derive seats in the record-utilities group beside payload revisions
and replacement.

#### Agent Notes (2026-11-13)

Session `agent/record-followup-20261113211548` (worktree
`.agent-worktrees/record-followup-20261113211548`), owner direction: peek
previews and the panel itself stay bounded. `LAYOUT.previewEmbedBand`
was a dead reference (the recipe key died with the handful-records
revert; the CSS class survived), so the peek's preview band rendered
with no class at all — payloads painted at natural size inside the
20rem popover. The recipe is restored (`ck-preview-embed-band`, 9rem
narrow step) and `HoverPeek` caps the panel at
`min(30rem, 100dvh-2rem)`. Same session: empty child sections render
their title with the create set beneath (SPEC §22.8 amended), the
framed preview band on record pages carries a reader-resize grip
(§22.8), the version stamp renders as quiet supporting-size text
button, the trailing line is an always-on placeholder that mounts the
engine on first activation (§26 amended), and `CrepeEditor` guards its
async mount against an unmounted host.

### Record version surface and state-step history (owner direction 2026-10-31)

- [ ] WAITING — owner verification: the version trigger rides the payload
  preview corner showing `vN`; the revisions popover carries the replace
  affordance for authored payloads; state history steps by state with
  field and revision events inside; event actors render by name with the
  chat affordance.

#### Agent Notes (2026-10-31)

Session `agent/version-surface-20261031` (worktree
`.agent-worktrees/version-surface-20261031`). `PayloadRevisionPicker`
renders the `vN` version stamp on the payload preview corner (full record
bodies, `SurfaceDetailBody`), loads the revision list at mount, and
carries `ReplacePayloadAction` in its popover; `SurfaceHeader` keeps
chat, editor, and the construct re-derive. `StateHistory` steps by state:
field and revision events render inside the state step they occurred in,
actor rows carry the persisted name and the chat action, and a missing
user renders the unknown-user label. Validation: ui-mapping + module
imports 130/130, design-system 161/164 with the three pre-existing
`GeneratedScreenHost.vue` findings, check-arch clean.

### One state surface (owner direction 2026-10-31)

- [ ] WAITING — owner verification: the state tag opens the state
  popover carrying legal transitions and history; the header carries no
  clock trigger and no transition buttons; the version stamp sits
  legible on the preview's top corner.

#### Agent Notes (2026-10-31)

Session `agent/state-noise-20261031` (worktree
`.agent-worktrees/state-noise-20261031`). `StateTag` gains `actionable`
(caret, button role, `select` event); `SurfaceHeader` renders it as the
state popover trigger with the runtime transitions on top and
`StateHistory` below, and drops the clock trigger and the transition
buttons. `PayloadRevisionPicker` uses the default primary button (ink
contrast in both schemes) and rides the preview hero's top corner outside
the band's clip. `StateHistory` actor rows render the name alone with the
chat action.
