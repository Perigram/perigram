# TODO

## server/features deslop delta (2026-10-24 audit)

### README

Parent:

- [x] server/features/README.md L38-41 → delete the pack-owned stable-URLs paragraph: `/api/cassettes` and `/api/sheet-designs` routes exist nowhere (find server/api -iname '*cassette*' -o -iname '*sheet*' empty) and `PACK_OWNED_FEATURES = new Map()` (check-arch.js:27) with a dead branch at L138-149.
- [x] server/features/README.md L29-32 → capability table adds `agent-bots` and `llm` rows (both in check-arch CAPABILITY_FEATURES, check-arch.js:41,51).
- [x] server/features/README.md L60-66 → example imports a live module (`organizations`); `projects/` is deleted by this same README L48-50.
- [x] server/features/README.md L43-51 → keep the surviving rule (undeclared types ride the generic path); delete the deleted-features inventory; L99-108 Core Feature Modules table collapses to name+link (classification L31 + child READMEs own the content); L116 states the import path positively; L34-41 garbled sentence rewritten once; L1/L3 drop version vocabulary.

Per-feature (areas 3+4):

- [x] agent-bots: tool catalog L25-114 (one ~88-line bullet) → tool table (name / chat-run-only / gating / seam); chat runtime L121-198 split by concern (trigger / run / streaming / stop / coalescing); delete HISTORY L204, L323-327; L4, L84, L106-107, L268-269 stated as laws (one delegated assistant identity per org; reader bounded to the run's own conversation attachments).
- [x] artifacts: client behavior L61-66 → components/entities/Artifact/README.md; Key Files L28-32 deleted; L82-83 → "PDF requires `entities.template`"; conversion section L95-104 → one link to artifact-conversions (canonical).
- [x] billing: org-ownership law single-homed here — parent README L124-127 becomes a link; L26-27 folds into the runtime-config law.
- [x] connections: add route table (`GET /api/connections/events` SSE, `POST /api/connections/subscriptions` — both files exist, documented nowhere); delete transport history L74-77; entityChanged bridging L41-46 → link instance-events (canonical home of the catch-up path).
- [x] cts-types: service bullet L23-77 split into Write gate / Migration steps / Removal ceremony; L33-37 → "redefinition is free when the stored declaration cannot compile or the type has zero instances"; describeOrganizationTypes L78-101 → record-kind table.
- [x] directory: Client Surfaces L59-71 → components/directory; L19-21 collapses to the display-name-only clause.
- [x] instance-events: example event L19-27 uses deleted type `queue` → live type id; consumers L59-77 trimmed to the two-path contract (canonical home stays); L29-42 laws stated affirmatively (events carry identity only; status history is the audit source; handlers register through the declared binding).
- [x] instance-revisions: add route table (`GET /api/instance-revisions`, `GET .../:id`, `GET .../:id/file`); Core Files L7-14 deleted; sheet-snapshot contents L56-64 reconciled in place inside instance-revisions/README.md (scope names `geometry`, `layout` kept); pre-source-key paragraph L38-45 dies with the code migration below.
- [x] instances: L19-22 collapses to the one law ("the wire DTO is this document verbatim"); migration executor L31-53 → step-kind table (step → rewrite).
- [x] invitations: add the 7-route table (org-side `GET/POST /api/organizations/:id/invitations`, `DELETE .../:invId`, `GET/POST /api/invitations/:token{,/join}`, `POST /api/auth/join-org`); Core Files L3-5 and template-convention note L51-52 deleted.
- [x] llm: document `POST /api/llm/models` (server/api/llm/models.post.js); delete HISTORY L102-104, L163-165; L49-50 one clause; L83-85 link only; own the model-resolution precedence chain ("wake rule → conversation → org chat route", currently also in agent-bots L17-19) — agent-bots links.
- [x] livekit: delete `## Migration` L166-170 and roadmap L89-92; Client Contract L135-151 → keep room-derivation + chat integration, link components/calls; L147 → "app chat owns messaging".
- [x] meetings: L24-26 roadmap → one clause.
- [x] notifications: L30-33 → push targets are `support.inbox` and `call.invite`; Files L65-70 deleted; client paragraph L50-63 trimmed to the composable/plugin split.
- [x] organizations: delete `setActiveProcessDefinition` L12-14 (service.js exports `getProcessConfiguration` only, L166; the name exists solely in never-called spec mocks, process-definitions.spec.js:96,610,683) and `processTemplateId` L26 (zero code hits); add the `/organization/plugins` screen row (system-screens.js:96-109, organizations:read-gated); owner-recovery law canonical here, users/README links (users L91-95 restates it).
- [x] partnerships: L6-8 tightened to the invariant.
- [x] plugins: delete "(upgrade flow is a later slice)" L40-41 (the flow exists, §Upgrades L176-191; service.js:870-881) and `## Not here yet` L228-231; L6-7, L17, L58 restated positively (operator-token publish only; declarations resolve per call); L30-32 one clause (retraction refuses while installs exist); Contract mega-bullets split Catalog/Installs/Connectors/Projections/Surfaces/Gateways around the Routes spine.
- [x] states: examples L57, L144-168 use deleted types (`project`, `queue`, `cassette_instance`) → live types; L108 signature is `getHistoryByTarget(typeId, instanceId)` (service.js:65); L179 links core/blocks (utils/blocks.js bridge is deleted); L171-175 documents `addStatus`/`initializeStatus` as the live status-event write seam (partnerships + invitations call them); document `initializeStatus`/`findLatest` (service has 9 exports, README covers 2 + events read).
- [x] transcription: L40-41 → transcripts persist per user via `repository.upsertTranscript` (support/service.js:862-867); `transcribeAudio` returns `{text,provider,model}` with `model: ''` for local (transcription/service.js:106).
- [x] users: delete `permission-templates.js` row L9 (file absent; dir = index, model, organization-owner, repository, service, spec); Core Files adds `organization-owner.js` (owner-recovery seam consumed by process-definitions/runtime.js); L91-93 dual-read sentence dies with the migration tracked in process-definitions/TODO.md.
- [x] workflow-overrides: L25 example uses a live type (`cassette` is pack-served).
- [x] _template: L3-4 scopes the strict structure to entity modules (parent L25-27 exempts capability modules); file table adds `process-update-handler.js` (the template's own processUpdate); Golden Rules L15-24 become pointers to the parent (canonical); L33-39 boilerplate snippet matches `registerServiceSet` (app-registry.js:102-110, L160-171).

### Code deslop

- [x] scripts/check-arch.js: delete phantom `CAPABILITY_FEATURES` names `material-options`, `nesting`, `notification`, `parametric-cassettes` and the empty `PACK_OWNED_FEATURES` map + branch; "Phase 7 cuts or declares them" comment dropped (artifact-templates' undeclared status already surfaced in the parent README entity table); the dead `utils/blocks` guard branches died with the file.
- [ ] Contract-comment trims (docs-guard homing backlog): instance-events/service.js:21-24 (restates the README's contractChanged refresh-hint semantics) → pointer; cts-types/service.js:330-335 ("Deleting a type is a ceremony (SPEC §19)" duplicates the README removal ceremony) → pointer; support/service.js:36-39 (contract + history in one comment); workflow-overrides/service.js:45-50 (restates the README resolution-order law).
- [ ] Move server/api/instance-events/index.get.spec.js beside feature spec instance-events.spec.js — the only spec file inside server/api (single-convention rule).
- [ ] Single-source `CAPABILITY_FEATURES` and the parent README module tables (one derivation) so the sets stop drifting.
- [ ] instance-revisions: migrate stored `data.typeId`/`data.instanceId` documents to `data.source.*` and drop the three `$or` fallbacks (repository.js:36-37,50-51,64-65); repo law: stored data migrates with the contract (decided 2026-10-25).

### Code findings (truth pass 2026-10-24)

- [x] agent-bots `wakeOn` omitted-preserves contradicts code — omitted rules are cleared; behavior decision (preserve semantics vs code).
  decided 2026-10-25: code behavior stands (omitted rules clear); closes as documented code behavior.
- [x] instance-revisions `RECORDED` state referenced in prose exists nowhere; unimplemented intent or stale vocabulary — decide.
  decided 2026-10-25: vocabulary dies; no implementation.
- [x] migration-plan.js:27 stale "Historical 409 shape" contract comment — deleted with `strandedAsAffected` (409 single-shape cut, process-definitions/TODO.md).

### Additions

- [ ] server/features/files/README.md — capability module listed in the parent table with no component README (AGENTS.md component contract; review-1 coverage gap): routes + GridFS bucket contract + upload-session seam.

### Owner decisions wanted

- [x] Artifact-cluster cutover: root SPEC.md:368 retires `artifact` when chat/proof/capture/upload flows move to file instances; support chat attachments still ride artifacts (support/service.js:2,40) and the registry carries artifact construction/mode handlers (app-registry.js:47,55,65,81,195) — schedule the cutover as TODO or confirm the family stays the live file path (decides README investment vs retirement plan).
  decided 2026-10-25: schedule — root TODO.md task "Artifact-family cutover to file instances" owns the work.
- [x] instance-revisions migration timing: confirm every stored doc is migratable now (any dev DB still pre-source-key?) so the `$or` dual-read dies in the same cut.
  decided 2026-10-25: migrate stored docs, delete the `$or` fallbacks.

- [ ] WAITING — owner verification: read server/features/README.md + the
  per-feature READMEs; pack-owned stable-URLs paragraph dead, capability
  rows + route tables added (connections, instance-revisions, invitations,
  llm models), history purged (livekit, llm, connections,
  instance-revisions), _template folded to a parent pointer.

### Agent Notes (2026-10-24)

Session `agent/doc-deslop-exec-20261024` (worktree
`.agent-worktrees/doc-deslop-exec-20261024`). Parent README: pack-owned
paragraph dead, agent-bots + llm capability rows added, module table
collapsed to name+link. Per-feature: agent-bots restructured to a tool
table; route inventories added (connections, instance-revisions,
invitations ×7, llm models); history purged (livekit, llm, connections,
instance-revisions); organizations/users/plugins stale claims fixed;
_template folded to a parent pointer. OPEN: files/ README (Additions),
check-arch phantom names + code items, artifact-cluster +
instance-revisions-migration decisions.

### Agent Notes (2026-10-25)

Session `agent/deslop-execute-20261025`. check-arch phantom names +
PACK_OWNED_FEATURES + Phase 7 comment executed (parent README already
carries the artifact-templates note); migration-plan stale 409 comment
died with `strandedAsAffected`. New guards in scripts/check-docs.js
(workers in SOURCE_ROOTS, out-of-root link failure, orphaned-README
detection) landed green; out-of-root failure surfaced 3 wrong-depth
links in components/shared/README.md (fixed to `../../`), DATA_MODEL
links in components/README.md repointed to framework.manifest.json.
