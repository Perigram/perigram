# TODO

## server/core deslop delta (2026-10-24 audit)

### README

- [x] server/README.md TRIM: L60-74 Entity Synchronization restates the event shape and refresh contract → canonical home [features/instance-events/README.md](../features/instance-events/README.md), keep one link; L76-98 Access Context re-derives the lineage/DTO-passing and effectivePermissions rules → collapse to the server-specific facts (list/detail parity, alias imports), link core/access/README.md; L31, L38-39, L54 negspace ("do not call db.collection directly", "must never write task_runs directly") → positive form ("workers reach `task_runs` only through `/api/tasks/*`"); L11 "Compatibility exports for `@perigram/core`" → name it the server import surface for core blocks.
- [x] server/utils/README.md REWRITE (180): delete the `cassetteGraphBuilder.js` section L144-151 (file absent from server/utils; claimed importer `utils/cassetteRenderer.js` exists nowhere — ls/find); delete the extract-data-models section L127-142 (`/api/debug/data-models` route and `/admin/data-model-review` page: zero route/page files; the real consumer of the shape is scripts/framework-inspect.js:17); `requirePermission`/`checkEntityAccess` documented under the `entity-redaction.js` heading L85-91 while living in permissions.js:34,46 (rows die with the Deletions item); `server/utils/blocks.js` "re-exports for legacy tests/callers" row L121-125 dies with the file (Deletions).
- [x] server/scripts/README.md REWRITE (75): delete the four phantom table rows (`migrate-artifact-file-revisions.js`, `migrate-artifact-sources.js`, `migrate-cassette-instances.js`, `migrate-instance-revisions.js` — none on disk, comm of README backticks vs `ls server/scripts/`); add the seven undocumented live scripts (migrate-llm-settings-profiles, migrate-profile-ops-to-sequence, migrate-retire-custom-bots, migrate-sheet-designs-to-instances, migrate-sheet-preview-pens, retire-process-runs, station-documents-types); delete the "Retired" section L61-70 and the L23-27 legacy-seed narration (the table lists what exists); fold the four server/scripts bullets from scripts/README.md L52-68 here (their canonical home).
- [x] core/tasks/README.md L21-25 → notify names are `continueActionFromTask` / `failActionFromTask`; `ingestTaskCompletion` / `failTaskInvocation` exist nowhere (core/tasks/service.js:271,273; process-definitions/service.js:717,742).
- [x] server/runtime/README.md L47-48 → drop `vision.extractGeometry` worker claim: `core/tasks/definitions.js:1-7` declares `frameworkTaskDefinitions = {}`; workers/README.md:7 confirms the deletion.
- [x] server/runtime/README.md L51 → hook handlers register via `registry.registerHookHandler`; `core/machines/hooks.js` does not exist (core/machines dir holds service.js + spec only; machines/README.md:130-133).
- [x] core/machines/README.md L214 → delete Data Flow step 5: `aggregator.js` / `triggerAggregator` have zero references in server/ (grep across server/).
- [x] server/db/README.md → CLI supports `create` and `drop` only (indexes.js:140-146, L20 names `list`); bucket list L11-15 → mongo.js:20-140 defines nestSvg, userDxfFilesSvg, nestDxf, userDxf, userSvg, validDxf, cassettesSvg, artifacts (avatars rides the files service; `cassettes` is a collection, its GridFS bucket is `cassettesSvg`); L22 → real uniques are identity.slug, org+user, identity.email, idempotency key, push endpoint (INDEXES, indexes.js:12-66; `code`/`ownerId` absent); note cassettes collection indexes L14-18 maintained for a collection scripts/README.md declares migrated and abandoned.
- [x] server/middleware/README.md L10, L14-15 → drop the `pb_` bot-token SHA-256 lookup: auth.js:11-60 carries JWT→session→DB→buildAuthContext→resolveProcessAuth only; `tokenHash` appears solely in scripts/migrate-retire-custom-bots.js:49, which strips it; Files list adds `idempotency.js` and `tracking.ts`.
- [x] server/api/README.md L177 → multipart list drops `cassettes/` (no server/api/cassettes directory exists).
- [x] server/api/README.md → structure list adds `plugins/` and `service/` one-liners (routes covered by features/plugins/README.md); L201-209 Example Handler block deleted; L88-90 future-executor prose deleted; L196-199 signup boundary stated positively (public signup creates credentials only).
- [x] core/machines/README.md L186-189 → `migrate-strip-status-provenance.js` is deleted (scripts/README.md:63-70 lists it retired); L84-85 → workflows delegation shipped (service.js imports `~/packages/workflows/src/index.js`), state as fact; L21-83 → split the 60-line machine-resolution bullet into labeled sub-sections (resolution order / guards / deadline edges / processOwned / stateChangedAt / field-change trail).
- [x] core/blocks/README.md → fold: toJSON placement/round-trip L156-190 → link packages/core/README.md L58-80 (canonical, implementation owner; packages/core already points there); App Registry L193-206 → link runtime/README.md; import example L12-16 drops `normalizeInstanceRef` (index.js:12-35 does not re-export it; callers import from `~/packages/core/src/index.js`, e.g. process-definitions/service.js:4, relation-option-resolver.js:1); L20-140 class prop tables shrink to rules and traps.
- [x] core/events/README.md folds into core/effects/README.md: events module is a 4-line identity stub (core/events/service.js:1-4 `return event`); events README L12-13 claims logged-failure semantics that match nothing (a failing effect policy throws inside processEvents and fails the command — effects/service.js:52 → commands/service.js:72); effects README L13-14 drops the "triggers can start automatically" sentence (`publishDomainEvent` stub has no consumer); the pass-through seam stays as one line in the effects README.
- [x] core/commands/README.md L50-54 → Files list: `definitions.js` (framework command/event tables) in, `../effects/README.md` out.

### Code deslop

- [x] `mergeProcessedEffects` triplication → export once from effects/service.js and import: commands/service.js:145-153, tasks/service.js:133-141, effects/service.js:289-295 are identical.
  Landed 2026-10-25: the three differed in semantics (effects mutated its target, commands/tasks returned a new object); unified on the pure return-new form exported from effects/service.js — commands/tasks import it, effects' three internal call sites reassign.
- [x] Delete the empty pack/executor tier: app-registry.js `FRAMEWORK_PACKS = []` and its registration loop deleted with `dispatchRegisteredTaskExecutors` (tasks/service.js) and `server/plugins/task-executors.js` (root SPEC cleanliness law 1).
- [x] Contract-comment trims to single facts: core/tasks/definitions.js:1-7 (queue-era narration) — the app-registry.js retirement narration died with the pack tier.
  Landed 2026-10-25: reduced to one fact ("The framework declares no tasks."); check-docs carried no contract-homing entry for this comment — the trim rides the comment bans, not the guard.
- [x] `server/db/mongo.js` — all 8 GridFS bucket getters (nestSvg,
  userDxfFilesSvg, nestDxf, userDxf, userSvg, validDxf, cassettesSvg,
  artifacts) deleted with their module vars and the `GridFSBucket` import;
  `connectDB` + `db` stay; db/README now credits the files feature's own
  bucket.
- [x] Event tier: register `frameworkEventDefinitions`
  (core/commands/definitions.js) into `defineDomain`
  (app-registry.js passes commands/tasks/events) and define the
  `convertArtifact` command; the REST route (api/artifact-conversions.post.js)
  stays the live path, the command definition makes the registered name
  real (decided 2026-10-25).
- [x] Registry naming: the 10 `getPerigramRegistry` importers
  (incl. core/machines and 4 spec mocks) renamed to `getAppRegistry`
  importing app-registry.js directly; perigram-registry.js shim and the
  `getPerigramRegistry`/`resetPerigramRegistryForTests` alias exports
  deleted (decided 2026-10-25).

### Code findings (truth pass 2026-10-24)

- [x] `scopeMatches` ignores compiled lineage-key grant scopes — over-broad enforcement (server/core/access, evaluator vs compiled grants). Fixed 2026-10-25: shared/access-control.js `lineageScopeMatches` enforces every non-reserved `grant.scope` key as a lineage field (single value or any-of array); tests in shared/ui-permissions.spec.js.
- [x] Lost-notification parked continuations are never redelivered (tasks notify path; the README claim of a reconciliation pass was false and removed).
  Landed 2026-10-25: behavior documented (process-definitions/README.md Async completion: "A notification error leaves the parked continuation unresumed"); redelivery vs accept-and-document is the owner decision below.
- [x] Dead export `createPerigramRegistry` (server/core/blocks).
  Landed 2026-10-25: re-export deleted from blocks/index.js with its README mention; zero importers repo-wide (grep js/vue/mjs).
- [x] server/utils DXF helpers duplicate workers/facade/vendor engines; production rides the vendor engines, utils copies are spec-only.
  Landed 2026-10-25: verified spec-only (sole importers were their own sibling specs; workers/facade/services.js:8-9 imports the vendor copies); all four files and both utils README sections deleted. Root `dxf-parser` dep stays — server/features/artifact-templates/format.js and utils/dxfParser.js still import it.
- [x] Dead alias `createPerigramRegistry = createRegistry` (packages/core/src/index.js:282, named in packages/core/README.md:25) — zero importers after the blocks re-export deletion.
  Landed 2026-10-25: alias + README row deleted.

### Deletions

- [x] server/runtime/process-bindings.js — deleted; zero importers verified repo-wide.
- [x] server/core/blocks/{BaseEntity,Identity,Status,Lineage,Specs}.js — deleted (each verified as a shadow of the `#packages/core/src/index.js` re-export); check-arch guard target is `#packages/core/src/index.js` (decided 2026-10-25).
- [x] server/utils/blocks.js — deleted; shared/v24-compliance.spec.js now imports `inheritLineage` from server/core/blocks/index.js.
- [x] server/DATA_MODEL.md — deleted; the two components/README.md links repointed to framework.manifest.json (the live entity/field catalog).
- [x] server/utils/permissions.js `requirePermission` / `checkEntityAccess` and server/utils/auth-helpers.js `canAccessEntity` — deleted with their spec cases and README rows (utils README decision guide routes admin checks to feature-level access checks).

### Owner decisions wanted

- [x] Event tier: register `frameworkEventDefinitions` (core/commands/definitions.js:10-32) into `defineDomain` — today app-registry.js:99 passes commands/tasks only, zero `defineEvent` callers, so the runtime `eventDefinitions` map is empty while check-arch.js:384-393 statically validates the same table (guard green, runtime empty). Live failure path: `generateAttachment` (definition definitions.js:41-77, handler app-registry.js:88-91) returns `attachment.generationQueued/Completed` (artifacts/operations.js:128-147) → processEvents (commands/service.js:72) → validateDomainEvent (effects/service.js:278-287) → 500 "Domain event is not declared". Option B deletes the event table, the validation tier, and the handler emissions as one cut. Separate decision: `convertArtifact` is a registered handler with no command definition — `executeCommand('convertArtifact')` throws 400 "Unknown command" (commands/service.js:12-17; plugins/service.js:732 rejects non-`plugin.<id>.<svc>` ids); its live `artifact.converted` emission runs on the REST route api/artifact-conversions.post.js:20 calling operations directly, bypassing processEvents — define the command or delete the dead command node path.
  decided 2026-10-25: register `frameworkEventDefinitions` into `defineDomain` and define the `convertArtifact` command; the REST route stays the live path, the command definition makes the registered name real — work item above.
- [x] Registry naming: `getAppRegistry` (32 files) vs `getPerigramRegistry` (10 files, incl. core/machines) plus the perigram-registry.js re-export shim — pick one name, import app-registry.js directly, delete the shim.
  decided 2026-10-25: `getAppRegistry` everywhere, direct imports, perigram-registry.js shim deleted — work item above.
- [x] check-arch.js BaseEntity guard: after the shadow-class deletion, keep a second guard target or is `#packages/core/src/index.js` sufficient?
  decided 2026-10-25: `#packages/core/src/index.js` is the guard target.
- [ ] Lost task notifications drop parked process continuations. Observed:
  `evaluateDataflow` parks a continuation under the dispatched task-run id
  in the in-memory `pendingActionContinuations` map
  (process-definitions/service.js:642,684-690); the terminal boundary
  `continueActionFromTask`/`failActionFromTask` consumes it (716-748, with
  the map delete at 720/745 preceding the resume work).
  `notifyProcessTaskOutcome` (core/tasks/service.js:243-254) catches every
  notification error and logs it; the parked continuation stays unresumed —
  a throw before the map delete parks it forever, a throw after the delete
  drops it mid-resume — and nothing rescans terminal `task_runs` against
  parked keys. Options: (a) accept and document the invariant — behavior is
  stated in process-definitions/README.md (Async completion) and
  core/tasks/README.md, `task_runs` stays the completion record; (b) schedule
  redelivery work — persist the continuation snapshot at dispatch keyed by
  task-run id and reconcile against terminal task_runs on startup.

- [ ] WAITING — owner verification: read the 15 server/core-area READMEs;
  core/events/README.md folded into core/effects/README.md (file deleted,
  links repointed), phantom rows out + real inventories in (utils,
  scripts, db), runtime vision/hooks citations + task notify names
  corrected to code.

### Agent Notes (2026-10-24)

Session `agent/doc-deslop-exec-20261024` (worktree
`.agent-worktrees/doc-deslop-exec-20261024`). 15 READMEs executed:
server/README trims; utils/scripts/db/api/middleware rewrites (phantom
rows out, real inventories in); runtime dead vision/hooks citations
corrected; machines split + aggregator Data Flow step dead; blocks
folds; events README folded into effects (file deleted, links
repointed); commands Files list fixed; tasks notify names →
`continueActionFromTask`/`failActionFromTask`. New code finding below:
8 GridFS bucket getters in db/mongo.js with zero importers. OPEN: code
deletions + event-tier/registry-naming/BaseEntity-guard decisions.

### Agent Notes (2026-10-25)

Session `agent/deslop-execute-20261025`. Code wave executed: pack/executor
tier + task-executors poll + dispatchRegisteredTaskExecutors deleted;
perigram-registry shim deleted, 10 importers → `getAppRegistry` direct;
frameworkEventDefinitions registered into `defineDomain`, `convertArtifact`
command defined (REST route stays live); 8 GridFS getters, process-bindings,
5 shadow block classes (check-arch target → packages/core), utils/blocks
bridge, DATA_MODEL.md, welcomemessage.js (server/features plane),
requirePermission/checkEntityAccess/canAccessEntity deleted;
`scopeMatches` lineage-key gap fixed with tests. machines
`initialStatus` died with the resolveDefaultWorkflow cut (zero callers,
always threw). OPEN: mergeProcessedEffects, tasks/definitions comment
trim, lost-notification, createPerigramRegistry, DXF dedup.

### Agent Notes (2026-10-25)

Session `agent/score-deslop2-20261025-1521` (worktree `.agent-worktrees/score`).
Executed the five open items: mergeProcessedEffects unified on the pure
return-new form (one export in effects/service.js; commands/tasks import it);
framework-task comment reduced to one fact; blocks `createPerigramRegistry`
re-export deleted with its README mention; server/utils DXF extractor/writer
+ specs deleted (spec-only, vendor copies serve production); lost-notification
behavior documented and filed as the owner decision above. REGRESSION FOUND
AND FIXED: 655938b35's registry rename dropped the `getAppRegistry` import
from core/tasks/service.js — every registry-resolving entry point
(enqueueTask, claimTask, completeTaskRun…) threw `ReferenceError:
getAppRegistry is not defined`; import restored. Dead spec
core/tasks/service.spec.js deleted with it (both cases exercised the deleted
`dispatchRegisteredTaskExecutors`). Residual: packages/core
`createPerigramRegistry` alias (finding above); pre-existing check-docs
blocking link workers/nesting/README.md → ./jagua-rs/README.md (submodule
uninitialized in worktrees).
