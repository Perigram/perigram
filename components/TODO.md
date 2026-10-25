# TODO

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
- [ ] components/artifacts/ArtifactViewer.vue:55-91 (`artifact`/`revision`
  props, artifact-entity branch) + utils/artifact-viewer.js artifact path +
  artifact-viewer.spec.js: sole consumer of the branch is the spec; both
  live mounts pass `:source=` only. Deletion lands with the
  artifact-family cutover (root TODO.md; decided 2026-10-25).
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

### Owner decisions wanted

- [x] ArtifactViewer artifact/revision branch: delete now, or hold until the
  TODO-tracked artifact-family retirement ("payload-trait flip") lands?
  decided 2026-10-25: with the artifact-family cutover (root TODO.md), not before.
- [x] artifact_template UI: with pages/assets deleted the card is inline-ref-only;
  keep as revision-provenance surface or retire the family with Phase 7?
  decided 2026-10-25: retires with the artifact-family cutover (root TODO.md).
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
