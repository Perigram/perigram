# COMPONENT: Nesting

Command handler and compatibility job metadata for queue nesting.

## Responsibilities

- `projections.js` is the pure π layer (`@perigram/cts` SPEC §8): job-file
  geometry resolution (with an injected parametric evaluator), solver request
  building, material-pool normalization, polygon inset/normalization, result
  enrichment, and summary math. No service imports, no persistence, no auth.
- `operations.js` is the κ layer: `solveNesting` (command), the
  `nesting.solve` executor, machine/tool/material snapshot resolution, and
  the sheet-design/sheet materializer. It re-exports the projections it
  composed from before the split.

- `operations.js` implements the `solveNesting` command.
- The handler validates queue state, creates a `nesting_run`, enqueues
  `nesting.solve`, writes a linked compatibility `nesting_jobs` record, and
  returns a queue `requestNesting` effect only when the active queue workflow
  exposes that intent for the queue's current state. Process-authored queue
  lifecycles may use custom statuses without a `requestNesting` transition; in
  that case the `nesting_job` lock plus linked `nesting_run`/task own execution
  state and the command must not fail after successfully scheduling the worker.
- Command output is initially the `nesting_run` plus task/job references.
  `sheet_design` entities are created only after the worker returns. Layouts
  with the same cassette-design/count composition collapse into one
  representative `sheet_design`; `data.sheetCount` records the physical
  multiplicity, and one physical `sheet` twin is created per collapsed count.
  Generated files are requested separately through artifact/attachment
  commands; the queue nesting API does not request attachments unless
  explicitly told to. Because
  `solveNesting` is asynchronous, active-process command-output status
  projection must not move the returned `nesting_run` to a downstream process
  status before the `nesting.solve` task completes; task completion owns the
  final run status and the `sheetDesignIds` link.
- The registered `nesting.solve` task executor builds the FastAPI payload from
  cassette polygon parts or dimension fallback rectangles, carries baked OCCS
  `layerData` as request-side source layers, calls `NESTING_WORKER_URL`,
  enriches stripped worker responses with source request geometry, source
  layers, and bin shape data, creates composition-collapsed `sheet_design`
  records, stores their IDs on `nesting_run.data.sheetDesignIds`, updates the
  compatibility job, and returns solver completion/failure effects for the task
  runtime to apply. Queue lifecycle changes now happen through the declared
  effect policy rather than directly inside the executor.
  Active process workflows may add custom `nesting_run` statuses, but runtime
  workflow resolution preserves the domain system completion/failure intents
  required by this executor. A solver HTTP 200 is not the terminal business
  state until the app-side `nesting.solveCompleted` event transitions the run.
- Run summaries use explicit worker `efficiency`/`remnantArea` metrics when
  present. Current `lbf` responses usually expose only `solution.density` and
  layout placements, so the projections fall back to density and then placed
  source polygon area to derive card-visible utilization and remnant area.
- Run and output provenance: `solveNesting` records the solve's effective
  inputs on the run as `provenance.solve.effective.{machine,tool,material}`
  (CTS provenance semantics; determinism is not required of the solver, the
  recorded effective inputs are the replay record). `sheet_design` and each
  `sheet` carry that same `provenance.solve` forward instead of
  `data.*Snapshot` fields; `server/scripts/migrate-nesting-provenance.js`
  moves persisted records. The compatibility `nesting_jobs` collection keeps
  its flat snapshot fields.
- Compatibility `nesting_jobs.projectSlug` is resolved from the parent project,
  not the queue, so notification/statistics plugins can find the project.
- Before rejecting a queue as already nesting, the handler checks the active
  compatibility job's `taskRunId`; jobs whose task is `FAILED` or `CANCELLED`
  are marked `error` and no longer block a new nesting request.
- `statistics.js` supports both legacy `nesting_jobs.sheets` payloads and the
  current worker result shape stored at `nesting_jobs.result.solution.layouts`.
- `jobs.js` owns Mongo access for `nesting_jobs`.
- Queue-local settings live on `queue.data.nestingSettings`. The queue nesting
  API builds the `solveNesting` command parameters from those settings and
  `queue.data.job.materialPool`; a `nesting_run` then stores the immutable
  worker snapshot under `data.params`.
- Warehouse-mode runs resolve sheet size and sheet count from
  `queue.data.job.materialPool`. The FastAPI worker still receives only its
  strict `{ width, height, space, sheetCount, sheet_polygon }` params, while the
  nesting run/job keep `materialPool` context for downstream sheet-design and
  inventory UI. Mixed stock sizes or stock entries without dimensions are
  rejected before task creation. Remnant stock sources may carry
  `sheetPolygon`/`geometryData`; `resolveNestingContext()` forwards that polygon
  as FastAPI `sheet_polygon` using `{ outer, inner }` shape data when holes
  exist. Remnant holes are container holes in jagua-rs, i.e. fixed
  non-placeable material zones, not fake movable nesting items.

`buildJobFiles()` is exported for focused coverage of the handoff from queue
items to worker files. Parametric queue entries load their saved
`cassette_design` and compare queued parameters with that design's baked
parameters. If material selection changed the material-bound `T` parameter or
any other parameter differs, nesting resolves the source cassette template from
`provenance.derivedFrom.source`, evaluates that template for the effective
parameters without persisting a derived `cassette_design`, and passes the
evaluated `polygonParts` into `buildNestingWorkerRequest()` under the queued
design id. The fetched cassette design is the source of truth for whether an
item is parametric; a stale queue item `type` must not make an OCCS-derived
design skip evaluation and fall back to a rectangle.
Because `solveNesting` consumes saved queue item references, the command
contract declares transient read grants for cassette templates and cassette
designs. Process action execution applies those grants only for the command run,
so generated queue users can run nesting without receiving standalone
cassette-design list/detail access.
The command's queue lifecycle event is optional by workflow capability, not a
legacy fallback. Domain queues in `DRAFT` still emit `queue.nestingRequested`
through the status API, while process queues whose active status machine does
not allow `requestNesting` skip that event and rely on the generated
`nesting_run` lifecycle for visible solver progress/result state.
For OCCS templates with multiple `sheet` workpieces, baking stores one
`polygonPart` per sheet workpiece. The FastAPI worker receives these as separate
items with the same baked cassette ID, preserving the single template reference
while allowing independent placement. Degenerate polygon parts with fewer than
three unique points or zero area are skipped before the worker request, so
legacy DXF imports that contain two-point closed curves do not produce worker
geometry warnings. Each request item also carries only the
source layers relevant to that workpiece (`cut.outer`, `fold.route`, dimensions,
and other annotation layers); the worker is not expected to preserve those
unknown fields, so the task merges them back from the request before sheet
design preview projection. `enrichNestingResult()` also keeps request items that
are absent from a partial worker `items` array, because layouts may still
reference those request ids after demand expansion; the request copy remains the
source for cassette design ids, source layers, and preview geometry.

The long-running execution contract is the `nesting.solve` task. The HTTP
algorithm service lives in [workers/nesting](../../../workers/nesting/README.md).

## Related

- [Command runtime](../../core/commands/README.md)
- [Task runtime](../../core/tasks/README.md)
- [Nesting runs](../nesting-runs/README.md)

## V -> V service boundary (SPEC §8/§21)

`solve-value.js` is the registered service command (`solveNestingValue`):
pure value in (job geometry items + sheet params), value out (layouts +
summary) — the worker HTTP call and `projections.js` run for real, with no
queue entities or legacy feature services in the path. The declared
signature in `packages/domain-cnc/src/pack.js` is the contract;
`solve-value.spec.js` proves the mapping with the worker mocked. The
queue-orchestrated flow (`operations.js`) stays for the legacy UI surfaces.
