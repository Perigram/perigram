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
- `../value-services/solve-nesting.js` is the registered service command
  (`solveNestingValue`, SPEC §8 s species): the pack's `nesting.solve`
  service registration
  ([`packages/facade` pack](../../../../packages/facade/README.md))
  names it, and the facade pack mounts it as a command handler
  ([`server/packs/facade`](../../README.md)). It receives the command
  envelope; the declared parameter sockets `items` (job geometry),
  `sheetWidth`/`sheetHeight`/`thickness` (the sheet as values — the graph
  reads them off the material through the field projection; the handler
  resolves nothing), and the optional `space`/`sheetCount` knobs arrive
  on `parameters`. It
  validates the value shapes before any worker call (400s), calls the
  FastAPI solver at `NESTING_WORKER_URL` (default
  `http://nesting-worker:8000/nest`), maps worker failures to 502, and
  returns `{ layouts, summary }` as values — no entities are created or
  transitioned, none are read. For a `cts.service` effect the graph
  receives this raw handler value; the command envelope (recording,
  events) stays in `command_runs`. The handler is pure V→V and imports
  no instance or file services (the SPEC §8 purity guards hold this).

The service is synchronous from the graph's perspective (the handler
awaits the worker). Pure value in, pure value out: authorization is the
process action's own grant surface plus the command-level feature gate;
the command definitions declare no entity inputs or outputs. Design
geometry reaches the solver as job-item values through the
`nesting-polygons` projection declared on `cassette-design`
([`packages/facade` pack](../../../../packages/facade/README.md)) — the
solver boundary never sees refs.
