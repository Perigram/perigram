# TODO

## workers deslop delta (2026-10-24 audit)

### README

- [x] workers/README.md → merge the Services table: the blank line at L18 splits it so the documents/tech-drawing rows render as a headerless orphan block on GitHub; one table, four rows.
- [x] workers/README.md → L4-10 narrates the polling-worker deletion (file-processing, cassette-processing, geometry-capture); state the tier as the nesting solver plus three plugin executors, and reduce the task_runs mention to one link to [server/core/tasks](../server/core/tasks/README.md).
- [x] workers/README.md → delete the "not a task executor… no task_runs round trip" paragraph (L22-24; the table's Protocol column already says HTTP solver) and fold the WORKER_TOKEN future-executor clause (L32-33) into one clause beside the compose note.
- [x] workers/README.md + workers/nesting/README.md → document `NESTING_WORKER_URL` as the platform-owned Nesting capability endpoint including `/nest`; plugin runtimes never call the worker URL directly.
- [x] workers/README.md → L30 "build-images.sh builds the app image plus the nesting worker image": build-images.sh pushes the retired ghcr.io/1suo registry path and is referenced by nothing (deletion owned by the root TODO, deploy-plane item); drop the sentence.
- [x] workers/facade/README.md → surface table "Serves" cells (L36-41) are 15-20-line UI-choreography paragraphs; cells carry purpose + one contract pointer, the choreography prose moves to the surfaces home (destination per occs re-scope decision below).
- [x] workers/facade/README.md → L15-19 restates the `applyOccsLayerPens` baking law near-verbatim from occs/README.md L19-23; canonical home occs/README — keep one link sentence.
- [x] workers/facade/README.md → L65-73 narrates the one-shot pack-to-plugin migration; collapse to script name + "type ids are unchanged" + the profile-sketch migration pointer.
- [x] workers/facade/README.md → document the undocumented vendor engines: `vendor/dxf-extractor.js`, `vendor/dxf-writer.js` (behind extract-geometry / import-cassette / generate-sheet-dxf; services.js:8-9) and `assets/vendor/clipper2/` (wasm).
- [x] workers/documents/README.md → drop the owner-decision date clause (L3-5); collapse the migration paragraph (L59-64) to script name + type ids unchanged + the durable trap ("Restart the app after — per-org declaration caches rebuild on boot"); trim the crepe Latex/AI/toolbar justification (L36-47) to one clause, keeping the fence and the bare-@import cause.
- [x] workers/tech-drawing/README.md → same date-clause (L3-4) and migration-story (L34-38) collapse as documents.
- [x] workers/facade/README.md:62-64, workers/documents/README.md:65-66, workers/tech-drawing/README.md:39-40 → "Deploys bump `version` and re-publish…" triplicated; canonical home [server/features/plugins/README.md](../server/features/plugins/README.md) — replace each with the link and confirm the plugins README states the contract (both sides of the fold).
- [x] workers/nesting/README.md → delete the "Core Files" section (L5-9 lists `worker_service.py` twice plus an inventory the directory shows); fold "pure algorithm, no DB access" into the opening line; delete the "old polling entry point was removed" sentence (L8-9) together with the dead cluster (Deletions below).
- [x] workers/nesting/README.md → document the HTTP-200 error shape in the API section: all-items-fail validation returns `{ status: 'error', message, solution: { layouts: [] } }` with status 200 (worker_service.py:89-94); the Nesting managed runtime maps `result.status === 'error'` → 502 (Nesting `runtime/server.mjs`).
- [x] workers/facade/occs/README.md → rewrite: the profiles.js bullet L58-267 is ~210 lines, majority designer-UI narration (popup anatomy, panel rows, fx strip, chips, tooltips) at the wrong altitude; the shape model stays as canonical contract (kinds, fields, boolean ops, fillets, evaluation, extraction roundtrip identity, layers/dimensions/parameters/expressions, purity conventions, spec/layers.json sync pin); strip dated owner-law citations (L20, L59, L278, L298, L317, L327, L363); fold internal duplication (profiles-terminal L304-305 vs L363-364; fold-edge refusal L316-325 vs L384-386; "bare codes never surface" twice within L349-358); fix L365 `addFaceAtEdge` — a local closure in surfaces/cassette-designer.mjs:1855, cite as the designer's face-grow action or drop; give each surfaces/lib function its owning home (`foldCassetteV2Region` cassetteV2Clipper.js, `resultInnerCutEntities`, `renameCassetteV2TreeParameter`, `cassetteV2AttachableProfileEdgesForTree`, `profileTerminalEdgesForTree`, `profileFoldEdgeRefusalsForTree`, `cassetteV2LayerPanelRows` cassetteV2Renderer.js, `cassettePreviewLayerSelection` drawingPreview.js).

### Code deslop

- [x] workers/facade/nesting-projections.js:1-6 → history comment ("queue-era projections module trimmed…") plus the V→V purity contract stated only here (check-docs never scans workers — see Additions); move the contract sentence into the facade README services section, delete the history. Landed 2026-10-25: purity law verified already homed in facade README Services intro (a1bd0dab6); header folded to a one-line README pointer; the adjacent 3-line variant comment (L9-11) cut with it as banned prose.
- [x] workers/facade/services.js:1-6 → endpoint-mode contract comment duplicates facade/README.md L7-11; shrink to a pointer. Landed 2026-10-25: one-line pointer to ./README.md (Services).
- [x] workers/nesting/test_lbf.py:18-40 → rebuilds the lbf config JSON inline; import `core.nesting_input_builder.build_config`. Landed 2026-10-25: config from `build_config()` (asserted equal to the retired inline dict; the builder's first consumer); dead `string`/`sys` imports dropped; this env lacks shapely and the lbf binary — script verified to the handled no-binary branch only.

### Code findings (truth pass 2026-10-24)

- [x] occs/profiles.js:42 `PROFILE_GEOMETRY_SEED` dead (defined, zero references).
- [x] occs/profiles.js:552-556 stale stacked comment (retired order-independent CSG prose) above `resolveOccsProfileSectionOperations`.

### Deletions

- [x] workers/nesting dead polling cluster → delete `core/main.py`, `utils/mongo.py`, `dxf/dxf_utils.py`, `core/svg_generator.py`, `utils/logger.py`. Reachability (audit + review-3): live entry is Dockerfile `CMD uvicorn worker_service:app`, which touches only `worker_service.py` + `core/nesting_input_builder.py` + `core/geometry_utils.py`; `core/main.py` imports `utils.mongo` GridFS buckets, `dxf.dxf_utils.read_dxf`, `core.svg_generator.create_svg_from_doc`, ezdxf; repo-wide grep for `core.main|read_dxf|create_svg_from_doc|utils.mongo|setup_logger` outside the cluster = 0 hits; `Dockerfile COPY workers/nesting/ .` ships them in the runtime image.
- [x] workers/nesting/requirements.txt → prune to fastapi, uvicorn, shapely; ezdxf, pymongo, python-dotenv, Pillow, matplotlib serve only the dead cluster (import grep over live files: fastapi/pydantic/shapely/stdlib only).

### Additions

- [x] Browser runtime capability calls are tied to the invocation
  AbortSignal: pending calls reject and are removed on cancellation, calls
  after abort fail immediately, and a runtime that resolves after abort cannot
  report success. Unit coverage is in
  `shared/plugin-runtime.spec.js`.
- [ ] Add managed server-worker integration tests for parent capability HTTP
  request abort and forced child termination after the cooperative grace
  period. The behavior is implemented in `workers/plugin-runtime/index.ts`,
  but these process-level paths remain unverified.

- [ ] Add managed Python/WASM runtime adapters only after platform-owned
  runtime images, dependency resolution, capability bridging, resource limits,
  and install-time compatibility checks exist. The current managed worker
  install gate accepts JavaScript runtime entries only; do not treat the SDK's
  broader descriptor grammar as runtime support.

- [x] Guard coverage: scripts/check-docs.js:209 `SOURCE_ROOTS` excludes `workers/`, so contract-shaped comments there are never scanned; fix owned by the root TODO ([TODO.md](../TODO.md), scripts/ item) — this folder's folds above remove the known instances.
  Landed 2026-10-25 (655938b35): `workers` is in `SOURCE_ROOTS` (check-docs.js:243).

### Owner decisions wanted

- occs/README re-scope: rename to the facade domain-geometry README (occs/ + surfaces/lib geometry passes with explicit per-item homes), or strictly occs/ with the surface UX contracts moving to a surfaces README? (Determines the destination of the facade surface-table choreography prose.)

- [ ] WAITING — owner verification: read the workers READMEs — occs
  rewrite (396→271), publish/upgrade folds to the plugins link, services
  table repaired, nesting inventory + NESTING_WORKER_URL /nest + HTTP-200
  error shape, vendored engines inventoried.

### Agent Notes (2026-10-25)

Session `agent/workers-deslop2-20261025-1521` (worktree
`.agent-worktrees/workers`). Code deslop landed:
nesting-projections and services headers folded to one-line
README pointers (the V→V purity law was already homed by the
2026-10-24 README wave — facade README Services intro);
test_lbf config now from `build_config()`. Guards: check-arch
OK; check-docs OK with 26 advisory debt entries, three in
workers/facade/occs/profiles.js belonging to the open occs
re-scope decision, zero in the touched files. jagua-rs
submodule initialized in the worktree so the nesting README
link resolves for the guard. Python env lacks shapely and the
lbf binary, so test_lbf was verified to the handled no-binary
branch only.

### Agent Notes (2026-10-25)

Session `agent/deslop-execute-20261025`. Dead polling cluster deleted
(core/main.py, svg_generator, dxf/, utils/), requirements pruned to
shapely+numpy+fastapi+uvicorn (numpy stays — shapely's own dependency),
nesting README opening states the live import path; occs PROFILE_GEOMETRY_SEED
and the stale order-independent comment cut. OPEN: nesting-projections/
services.js comment folds, test_lbf config import, occs re-scope decision.

### Agent Notes (2026-10-24)

Session `agent/doc-deslop-exec-20261024` (worktree
`.agent-worktrees/doc-deslop-exec-20261024`). occs/README.md rewritten
(396→271: designer-UI narration out, shape model canonical, dated
owner-law citations stripped, surfaces/lib functions homed); facade
publish/upgrade paragraphs folded to the server/features/plugins link,
services table repaired, vendored engines documented; nesting README
corrected to today's inventory + `NESTING_WORKER_URL` `/nest` endpoint +
HTTP-200 error shape; documents/tech-drawing date clauses + migration
stories collapsed. OPEN: dead-cluster deletion + requirements prune, code
items, occs re-scope decision.
