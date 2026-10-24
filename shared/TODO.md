# TODO

## shared deslop delta (2026-10-24 audit)

### README

- [ ] shared/ui-mapping/README.md → restructure the Fields wall (L63-183, one ~120-line paragraph) and the Budgets/arrangement wall (L397-466) into tables: resolver outcome tables, budget constant list, arrangement ladder; every verified claim survives as a row (resolver inventory verified against code: override splice index.js:110, titleFor index.js:447-475, state helpers index.js:628-775, composeScreen screen.js:140-212, budgets tables.js:100-318).
- [ ] shared/ui-mapping/README.md → fix `resolveListLayout` enum drift: L121-123 omits `carousel`; tables.js:109 `LIST_LAYOUT_VALUES = ['table','card-grid','carousel','timeline','stats','list','board','gantt','calendar']`.
- [ ] shared/ui-mapping/README.md → fix `RENDERABLE_PREVIEW_MODES` drift: L296-301 lists `occs`; tables.js:410-412 carries none.
- [ ] shared/ui-mapping/README.md → compress negative-space phrasing into positive law: L13 "Persisted/process data never selects a component directly" → "component choice is resolver output"; L74-75 "never record ids, never slugs, never heuristics"; L129-130 "no hand-picked type ids… no authored override channel"; L428 "Never measured from the DOM" → weights derive from data.
- [ ] shared/README.md → L26-28 claims instance-field-access.js "consumes the facade plugin's listing declarations field policies"; its imports are access-control.js + field-access-policies.js + public-entities.js (instance-field-access.js:1-10); state the real inputs.
- [ ] shared/README.md → L156-159 "A path must be declared in `cncEntityFieldAccess`" — identifier matches nothing repo-wide; the registry is `fieldAccessPolicies` in shared/field-access-policies.js, read via `getEntityFieldAccessPolicy` (instance-field-access.js:7).
- [ ] shared/README.md → L170 dangling fragment "template drafts and UI action visibility drafts." under Related; delete.
- [ ] shared/instance-filters/README.md → L126-130 consumer entry "Legacy collection toolbar: components/generated/GeneratedInstanceCollection.vue" — the component does not exist (components/generated carries no such file); delete the entry.
- [ ] composables/README.md → L34-44 restates the state-vocabulary derivation (`statePolicyByType` over producer workflows); canonical home is shared/ui-mapping/README.md L29-36 + L221-249 — keep the link, drop the derivation.
- [ ] composables/README.md → L156-181 restates offline outbox semantics (idempotency key, OfflineQueuedError, replay, badge); canonical home is the root README PWA section — link it, keep only composable-side specifics.
- [ ] composables/README.md → L119-127 (useScreenSourceSync) restates instance-event snapshot reconciliation; canonical home is stores/README.md — trim to the mount points.
- [ ] composables/README.md → L1 title drops "Composables & Stores — v24 Standardized" for "COMPONENT: Composables" (stores have their own README); L77-78 MotionDock retirement sentence deleted (grep: neither exists); L238-331 useGeneratedScreen section splits into screen-source concerns and a designer subsection (three concerns interleaved in run-on prose).
- [ ] composables/README.md → L7-15 narrates the useEntity/store deletion while L288 still says useGeneratedScreen "loads entity data through `useEntity()`" (useGeneratedScreen.js:5 imports `useInstancesStore`) — state the current contract (instances store owns reads and mutations, link stores/README.md) and drop both halves.
- [ ] composables/README.md → L139-141 documents the legacy array-shaped effect tolerance as contract; resolves with the instance-events code item below.
- [ ] stores/README.md → L193-195 restates a code defect as contract: "reads the screen type from `typeId` or `typeId`" canonizes stores/navigation.js:66 `screen.typeId || screen.typeId`; the same sentence claims dual detail-template vocabulary — utils/action-visibility.js:8 `DETAIL_TEMPLATES = new Set(['instanceDetail'])`, one vocabulary, projected server-side (packages/processes/src/ui-contract-projection.js:21).
- [ ] stores/README.md → delete the "Legacy seams" paragraph L91-105 (deletion inventory: every named deletion gone and unverifiable); L58-59 `instanceUiFor` (matches nothing repo-wide except a comment at InstanceCard.vue:188); L61-63 attributes case normalization to `utils/generated-screen-source.js` (it lives in stores/instances.js:58,113 `surfaceToSnake`/`canonicalTypeKey`); L219-222 queue-nesting polling sentence (keep the surviving entity-event reconciliation clause); L54-55 negspace restated positively (L207 static-hub clause is a real invariant, stays).
- [ ] layouts/README.md → delete L63-65 `stateWorkflows` claim (grep over layouts/components/composables/stores/pages: 0 hits); document `ui-lab-layout.vue` (mounted by pages/test/ui-lab.vue:227 `layout: 'ui-lab-layout'`; chrome-less shell with theme toggle via useThemeMode); restate L46-49, L100 negspace positively.
- [ ] assets/README.md → L13 "legacy preprocessor support" → name what SCSS still does. assets/tokens/README.md → restate the three prose walls L6-65 (surface contract, passthroughs, preset chrome) as tables (component → deviation from Aura for L46-65); tighten L28-29, L94-95 negspace.
- [ ] i18n/README.md → L12-13 names `status.*` consumers `utils/state-engine.js` and `utils/state-actions.js`; neither file exists — real consumers are components/shared/state/InstanceState.vue, StateHistory.vue, StateTransitionDialog.vue; re-anchor the facade-listing workflow-state instruction the same way; L6-9 two-locale file listing → one line.
- [ ] utils/README.md → L49-60: keep "undeclared types resolve no fact rows"; delete the residual-map narration (L49-51), the former identity-chelper names (L54-55), and the dead project/warehouse entries story (L59-60) — app-instance-surfaces.js exports `{ fieldGroups: {}, surfaces: {} }`.

### Code deslop

- [ ] Delete dead composables: `useNavigationState.js` (module-scoped tabs state, zero references — grep own file only); `useMotion.js` `useStateTransition` (zero non-spec consumers; composables/README L75 documents the dead export instead of deleting it — delete or consume).
- [ ] plugins/global-styles.js:1-7 → comment restates the root README global-stylesheet contract plus history ("Order matches the old css array") → one-line pointer to the root README.
- [ ] utils/instance-events.js:47-53 → `normalizedEffectEntities` dual-reads legacy array-shaped `effects`; migrate remaining producers to the object shape and delete the array branch (composables/README.md L139-141 documents the tolerance today).
- [ ] utils/app-instance-surfaces.js → exports `{ fieldGroups: {}, surfaces: {} }` (zero entries) wired into `resolveInstanceDisplayContract`; utils/README.md calls it "the app's only route-specific patch channel" and pages/README.md L165-167 claims production uses; delete the seam or keep the sanctioned channel with a one-line comment.
- [ ] composables/useEntityPopup.js:8-13 → the popup-openable law (directory types, compiled/synthesizable detail screen, or served type view) lives in a block comment; give it a composables/README.md paragraph, leave a pointer.
- [ ] shared/ui-permissions.js → drop the `UI_PERMISSIONS` costume re-export of `PERMISSION_TEMPLATES` (zero production consumers, only its own spec); `resolveUiPermission` stays (stores/auth.js:3,185).
- [ ] stores/navigation.js:66 → `screen.typeId || screen.typeId` duplicated operand (residue of `entityType || typeId`); collapse to `screen.typeId` (paired with the stores/README sentence item above).

### Owner decisions wanted

- utils/instance-events legacy array-shaped effects: migrate remaining producers and delete the dual read, or is a stored response shape still unpinned?
- utils/app-instance-surfaces.js: delete the empty extension seam, or keep it as the sanctioned route-patch channel?
- shared/field-access-policies.js hardcoded framework-type table: schedule migration onto declared field policies, or accept as framework-plane policy for framework types?
