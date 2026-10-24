# TODO

## workers deslop delta (2026-10-24 audit)

### README

- [ ] workers/README.md → merge the Services table: the blank line at L18 splits it so the documents/tech-drawing rows render as a headerless orphan block on GitHub; one table, four rows.
- [ ] workers/README.md → L4-10 narrates the polling-worker deletion (file-processing, cassette-processing, geometry-capture); state the tier as the nesting solver plus three plugin executors, and reduce the task_runs mention to one link to [server/core/tasks](../server/core/tasks/README.md).
- [ ] workers/README.md → delete the "not a task executor… no task_runs round trip" paragraph (L22-24; the table's Protocol column already says HTTP solver) and fold the WORKER_TOKEN future-executor clause (L32-33) into one clause beside the compose note.
- [ ] workers/README.md + workers/facade/README.md → document `NESTING_WORKER_URL` as the full endpoint including `/nest` (facade services.js:234 default `http://nesting-worker:8000/nest`; compose/stack/CI values carry the path; a base-URL value 404s) — stated in neither README today.
- [ ] workers/README.md → L30 "build-images.sh builds the app image plus the nesting worker image": build-images.sh pushes the retired ghcr.io/1suo registry path and is referenced by nothing (deletion owned by the root TODO, deploy-plane item); drop the sentence.
- [ ] workers/facade/README.md → surface table "Serves" cells (L36-41) are 15-20-line UI-choreography paragraphs; cells carry purpose + one contract pointer, the choreography prose moves to the surfaces home (destination per occs re-scope decision below).
- [ ] workers/facade/README.md → L15-19 restates the `applyOccsLayerPens` baking law near-verbatim from occs/README.md L19-23; canonical home occs/README — keep one link sentence.
- [ ] workers/facade/README.md → L65-73 narrates the one-shot pack-to-plugin migration; collapse to script name + "type ids are unchanged" + the profile-sketch migration pointer.
- [ ] workers/facade/README.md → document the undocumented vendor engines: `vendor/dxf-extractor.js`, `vendor/dxf-writer.js` (behind extract-geometry / import-cassette / generate-sheet-dxf; services.js:8-9) and `assets/vendor/clipper2/` (wasm).
- [ ] workers/documents/README.md → drop the owner-decision date clause (L3-5); collapse the migration paragraph (L59-64) to script name + type ids unchanged + the durable trap ("Restart the app after — per-org declaration caches rebuild on boot"); trim the crepe Latex/AI/toolbar justification (L36-47) to one clause, keeping the fence and the bare-@import cause.
- [ ] workers/tech-drawing/README.md → same date-clause (L3-4) and migration-story (L34-38) collapse as documents.
- [ ] workers/facade/README.md:62-64, workers/documents/README.md:65-66, workers/tech-drawing/README.md:39-40 → "Deploys bump `version` and re-publish…" triplicated; canonical home [server/features/plugins/README.md](../server/features/plugins/README.md) — replace each with the link and confirm the plugins README states the contract (both sides of the fold).
- [ ] workers/nesting/README.md → delete the "Core Files" section (L5-9 lists `worker_service.py` twice plus an inventory the directory shows); fold "pure algorithm, no DB access" into the opening line; delete the "old polling entry point was removed" sentence (L8-9) together with the dead cluster (Deletions below).
- [ ] workers/nesting/README.md → document the HTTP-200 error shape in the API section: all-items-fail validation returns `{ status: 'error', message, solution: { layouts: [] } }` with status 200 (worker_service.py:89-94); the facade executor branches on `result.status === 'error'` → 502 (facade services.js:109-112).
- [ ] workers/facade/occs/README.md → rewrite: the profiles.js bullet L58-267 is ~210 lines, majority designer-UI narration (popup anatomy, panel rows, fx strip, chips, tooltips) at the wrong altitude; the shape model stays as canonical contract (kinds, fields, boolean ops, fillets, evaluation, extraction roundtrip identity, layers/dimensions/parameters/expressions, purity conventions, spec/layers.json sync pin); strip dated owner-law citations (L20, L59, L278, L298, L317, L327, L363); fold internal duplication (profiles-terminal L304-305 vs L363-364; fold-edge refusal L316-325 vs L384-386; "bare codes never surface" twice within L349-358); fix L365 `addFaceAtEdge` — a local closure in surfaces/cassette-designer.mjs:1855, cite as the designer's face-grow action or drop; give each surfaces/lib function its owning home (`foldCassetteV2Region` cassetteV2Clipper.js, `resultInnerCutEntities`, `renameCassetteV2TreeParameter`, `cassetteV2AttachableProfileEdgesForTree`, `profileTerminalEdgesForTree`, `profileFoldEdgeRefusalsForTree`, `cassetteV2LayerPanelRows` cassetteV2Renderer.js, `cassettePreviewLayerSelection` drawingPreview.js).
- [ ] workers/facade/assets/vendor/cad-viewer/README.md → L43-46 patch note drops mechanism narration, keeps the trap (re-vendor re-introduces the false-positive error strings).

### Code deslop

- [ ] workers/facade/nesting-projections.js:1-6 → history comment ("queue-era projections module trimmed…") plus the V→V purity contract stated only here (check-docs never scans workers — see Additions); move the contract sentence into the facade README services section, delete the history.
- [ ] workers/facade/services.js:1-6 → endpoint-mode contract comment duplicates facade/README.md L7-11; shrink to a pointer.
- [ ] workers/nesting/test_lbf.py:18-40 → rebuilds the lbf config JSON inline; import `core.nesting_input_builder.build_config`.

### Deletions

- [ ] workers/nesting dead polling cluster → delete `core/main.py`, `utils/mongo.py`, `dxf/dxf_utils.py`, `core/svg_generator.py`, `utils/logger.py`. Reachability (audit + review-3): live entry is Dockerfile `CMD uvicorn worker_service:app`, which touches only `worker_service.py` + `core/nesting_input_builder.py` + `core/geometry_utils.py`; `core/main.py` imports `utils.mongo` GridFS buckets, `dxf.dxf_utils.read_dxf`, `core.svg_generator.create_svg_from_doc`, ezdxf; repo-wide grep for `core.main|read_dxf|create_svg_from_doc|utils.mongo|setup_logger` outside the cluster = 0 hits; `Dockerfile COPY workers/nesting/ .` ships them in the runtime image.
- [ ] workers/nesting/requirements.txt → prune to fastapi, uvicorn, shapely; ezdxf, pymongo, python-dotenv, Pillow, matplotlib serve only the dead cluster (import grep over live files: fastapi/pydantic/shapely/stdlib only).

### Additions

- [ ] Guard coverage: scripts/check-docs.js:209 `SOURCE_ROOTS` excludes `workers/`, so contract-shaped comments there are never scanned; fix owned by the root TODO ([TODO.md](../TODO.md), scripts/ item) — this folder's folds above remove the known instances.

### Owner decisions wanted

- occs/README re-scope: rename to the facade domain-geometry README (occs/ + surfaces/lib geometry passes with explicit per-item homes), or strictly occs/ with the surface UX contracts moving to a surfaces README? (Determines the destination of the facade surface-table choreography prose.)
