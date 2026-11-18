# COMPONENT: Graph Executions

The graph-executions capability authorizes graph data reads and execution records against saved graph revisions, then coordinates explicit output materialization. Mongo transaction mechanics are owned by [the database layer](../../db/README.md#files).

Parent: [server features](../README.md).

## Contract

- Source graph access is resolved through the generic `graph-document` instance read boundary.
- The submitted graph identity and revision must match the saved payload. The server also exposes an authorized pinned-revision resolver for Use Graph references: it enumerates only graph documents visible through the caller's read grant, loads their saved payloads, and matches the exact graph id/revision pair. Missing, excessive, or ambiguous candidate sets fail closed. This resolver is groundwork only; the saved-graph evaluator does not yet call it.
- Execution envelopes use the hidden append-only `graph-execution` CTS type through the generic instance persistence service.
- Page-file Bake validates the saved source revision, writes bytes through the [pages feature](../pages/README.md), and records the resulting file reference and destination in a `procedural-bake` execution. Instance-payload Bake writes to one exact, authorized revisioned CTS instance, requires its expected revision, and commits the payload swap, immutable revision, audit event, and execution evidence in one Mongo snapshot transaction; the uploaded blob is compensated if the transaction aborts. Instance-field Bake writes a file handle only to an explicitly declared `blob` field, through the generic authorized patch boundary with the expected instance revision; it accepts an exact instance or a single-result query selector already present in the preview read set (for example, newest by `createdAt desc`). Relation Bake creates a revisioned file-type instance and links it through the owner's declared relation with target-domain, cardinality, tenancy, and revision checks. Both forms commit their mutations and execution evidence in one transaction and compensate the uploaded blob on abort. Revision indexes are prepared before opening the transaction so the first Bake on a fresh deployment does not attempt DDL inside a transaction.
- Commit applies one exact-instance CTS field/name patch from a successful preview. Its read set must contain exactly the target instance at the proposal's expected revision; optional queries must be exact reads of that same instance. The generic instance service rechecks the caller's write grant and revision at the write boundary. The instance mutation and append-only execution evidence commit in one Mongo snapshot transaction; a stable organization sequence is reserved by compare-and-swap.
- Export returns a selected output as an authenticated download and records a `procedural-export` execution with filename, MIME type, size, output, and source-execution provenance.
- Before Bake or Export, the feature requires a stable organization snapshot or sequence-bracketed read set whenever CTS dependencies were consumed, then re-reads the saved graph document and every consumed instance/relation dependency. Query-backed previews require the recorded organization sequence to remain unchanged; deleted, revised, or re-linked dependencies fail with `409` instead of materializing stale output.
- Page-file Bake destinations identify a Page id and a validated page-relative path. The page service owns conflict policy, revision history, GridFS metadata, and compare-and-swap page updates. Instance-payload destinations identify a type, instance, and expected revision; they use the instance payload/revision boundary and currently support fail-on-conflict only. New-instance destinations provide an explicit CTS type and data draft; the host attaches the output as its payload and creates the record, revision, audit/sequence data, and execution evidence in the same transaction.
- Organization queries use the generic instance service's read grant and Mongo snapshot transactions where supported, with sequence-bracketed fallback. They support bounded deterministic lists and exact-instance detail reads. Execution read sets retain instance revisions and query/range dependencies; distinct per-query snapshots collapse to one sequence-bracketed boundary only when they share the same stable organization sequence.
- The capability accepts only a selected graph output and a successful preview execution as Bake input.

## Commit

`POST /api/graph-executions/commit` commits one selected proposal from a
successful `procedural-preview` record against the exact saved graph
revision. The first authoritative write adapter supports this output shape:

```json
{
  "kind": "cts.instance.patch",
  "typeId": "record-type",
  "instanceId": "instance-id",
  "expectedRevision": "revision-token",
  "conflictPolicy": "fail",
  "patch": {
    "fields": { "status": "approved" }
  }
}
```

The preview read set must contain exactly that instance and its matching
revision. Optional query observations must be exact-instance reads of the
same target; relation dependencies and broad query ranges are rejected by
this first commit adapter. The instance service rechecks authorization,
field policy, constraints, and the expected revision at the write boundary.
A successful commit records a `procedural-commit` execution with the
resulting instance revision and artifact reference in the same transaction
as the instance mutation. Mongo transaction support is a commit prerequisite;
unsupported deployments receive `503` before writes. Broader multi-object
and relation commits remain gated on transactionally validated write sets.

## API

| Endpoint | Responsibility |
|---|---|
| `POST /api/graph-executions/query` | Execute a bounded, authorized CTS instance query and return its read-set evidence. |
| `GET /api/graph-executions/collection-outputs` | List readable collection outputs from successful saved graph executions. |
| `GET /api/graph-executions/collection-outputs/:executionInstanceId/:outputId` | Resolve one pinned execution output through the saved graph revision and each referenced instance's read grant. |
| `POST /api/graph-executions` | Record a validated execution envelope against its saved graph revision. |
| `POST /api/graph-executions/commit` | Apply one authorized, exact-instance proposal with an expected revision and record its result. |
| `POST /api/graph-executions/bake` | Materialize a selected output to an exact Page path and record the artifact provenance. |
| `POST /api/graph-executions/export` | Return a selected output as a download and record export provenance. |

The canonical execution envelope lives in [@perigram/core](../../../packages/core/README.md). The Page file destination contract lives in [pages](../pages/README.md).


Page collection embeds can pin one successful graph execution and one collection output. The saved graph document and revision are revalidated when the output is read; each referenced CTS instance is resolved through its ordinary read grant. The execution pins output membership, while referenced instance projections remain current authorized reads.

## Execution boundary status

This feature is the authorization, evidence, and materialization boundary.
`POST /api/graph-executions` still validates and records an execution envelope
supplied by a caller. The service now has an `evaluateSavedGraph` preview
orchestration seam: it loads the caller-readable saved graph, resolves nested
Use Graph pins by exact payload revision through the same read boundary, and
delegates provider definition resolution and node execution to injected host
handlers. The core evaluator supplies cycle/depth checks, server-target
validation, cancellation, and one shared read set across nested graphs.
Plugin node definitions resolve from the organization's installed service and
runtime declarations (not the mutable catalog), and the evaluation result
collects the exact installed package/runtime/operation pins.

This is not yet managed server graph execution. The managed node execution
callback is still injected rather than connected to the plugin-runtime worker;
the service-level seam is not exposed as an authenticated execution route/task
lifecycle, and it does not persist the resulting execution envelope. A provider's
`execution.targets: ['server']` declaration and the existence of the managed
plugin task worker do not make saved-graph server execution available. The
remaining work is tracked in the root [TODO](../../../TODO.md).
