# COMPONENT: Graph Executions

The graph-executions capability authorizes graph data reads and execution records against saved graph revisions, then coordinates explicit output materialization.

Parent: [server features](../README.md).

## Contract

- Source graph access is resolved through the generic `graph-document` instance read boundary.
- The submitted graph identity and revision must match the saved payload.
- Execution envelopes use the hidden append-only `graph-execution` CTS type through the generic instance persistence service.
- Page-file Bake validates the saved source revision, writes bytes through the [pages feature](../pages/README.md), and records the resulting file reference and destination in a `procedural-bake` execution.
- Bake destinations identify a Page id and a validated page-relative path. The page service owns conflict policy, revision history, GridFS metadata, and compare-and-swap page updates.
- Organization queries use the generic instance service's read grant and Mongo snapshot transactions where supported, with sequence-bracketed fallback. They support bounded deterministic lists and exact-instance detail reads. Execution read sets retain instance revisions and query/range dependencies; distinct per-query snapshots collapse to one sequence-bracketed boundary only when they share the same stable organization sequence.
- The capability accepts only a selected graph output and a successful preview execution as Bake input.

## API

| Endpoint | Responsibility |
|---|---|
| `POST /api/graph-executions/query` | Execute a bounded, authorized CTS instance query and return its read-set evidence. |
| `POST /api/graph-executions` | Record a validated execution envelope against its saved graph revision. |
| `POST /api/graph-executions/bake` | Materialize a selected output to an exact Page path and record the artifact provenance. |

The canonical execution envelope lives in [@perigram/core](../../../packages/core/README.md). The Page file destination contract lives in [pages](../pages/README.md).
