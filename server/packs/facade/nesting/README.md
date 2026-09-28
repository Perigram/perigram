# COMPONENT: Nesting

The nesting solver's value boundary. The queue-orchestrated flow
(`solveNesting`, `nesting.solve` task executor, nesting-run entities and
hooks) was deleted with the queue-flow legacy cut; what remains are the
value seams graph processes drive.

## Responsibilities

- `projections.js` is the pure π layer (`@perigram/cts` SPEC §8): the
  value-shaped worker request builder (job items from polygon parts or
  dimension fallback rectangles, sheet params with optional normalized
  `sheet_polygon`), worker-response enrichment (source geometry, source
  layers, and bin shape restored onto stripped solver responses), and the
  summary math (efficiency/remnant area from explicit metrics, density,
  or placed source polygon area — in that precedence). No service imports, no
  persistence, no auth.
- `solve-value.js` is the registered service command (`solveNestingValue`,
  SPEC §8 s species): the pack's `nesting.solve` service registration
  ([`packages/facade` pack](../../../../packages/facade/README.md))
  names it, and the facade pack mounts it as a command handler
  ([`server/packs/facade`](../../README.md)). It receives the command
  envelope; the declared parameter sockets `items` (job geometry),
  `material` (the `sheet-material` ref sheet width/height resolve from),
  and the optional `space`/`sheetCount` knobs arrive on `parameters`. It
  validates the value shapes before any worker call (400s), calls the
  FastAPI solver at `NESTING_WORKER_URL` (default
  `http://nesting-worker:8000/nest`), maps worker failures to 502, and
  returns `{ layouts, summary }` as values — no entities are created or
  transitioned. For a `cts.service` effect the graph receives this raw
  handler value; the command envelope (recording, events) stays in
  `command_runs`.
- `items.js` is the `nesting.items` service command: cassette-design
  refs → job items, reading each design's baked
  `data.geometry.nestingPolygons` once, server-side.

The services are synchronous from the graph's perspective (the handler
awaits the worker). Pure value in, pure value out: authorization is the
process action's own grant surface plus the command-level feature gate;
the command definitions declare no entity inputs or outputs.
