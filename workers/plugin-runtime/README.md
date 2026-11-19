# Managed Plugin Runtime

Parent: [workers](../README.md).

One platform worker claims the shared `plugin-runtime` task type for every
organization and installed plugin. The worker retrieves the pinned
organization-owned package assets through a claim-bound API, creates a
temporary package directory, and starts a fresh Deno process for each
operation.

The parent worker retains the platform token and network access. The
operation process receives the package directory as its read boundary and
runs under the plugin-runtime container's memory limit and a bounded wall time. The child process starts with a package-scoped read permission and bounded
execution resources. The parent mediates organization data, files, and
network access through capability requests; the server checks the active
task claim, installed package version, operation declaration, and capability
allowlist before executing a handler.

Runtime modules export `createRuntime()` (or a default factory) returning
an object with `execute(operationId, input, { capabilities, signal })`.
The same operation contract is used by the browser Worker adapter. Cancellation aborts the runtime signal and rejects every outstanding
capability call with an `AbortError`; calls made after cancellation reject
immediately. The parent also aborts in-flight capability HTTP requests and
allows a one-second cooperative shutdown before terminating an unresponsive
child process. Runtime operations must observe `signal` and stop their own
work promptly; the hard process deadline remains the final containment boundary. Browser
runtime factories may also return a structured-cloneable `providers` array
containing provider ids and node definitions. Package
dependencies resolve from installed local assets through the generated
Deno import map.

Perigram runs this worker as shared platform infrastructure across
organizations. Each install carries immutable package assets and declared
runtime requirements.

For graph-node tasks, the worker returns per-call capability evidence alongside
the operation output. Host authority lives in the task-run evidence journal:
the claim-bound capability route records what the host itself executed
(capability id, authorized scope, safe identifying inputs, and read-set or
file-hash proof), and the graph evaluator merges that journal as the
authoritative evidence. Worker-reported claims carry the same fields from the
host responses, but a claim with no journal entry stays unverified and blocks
materialization. The evaluator records that dependency and rechecks current
read access and file bytes before Commit, Bake, or Export; capabilities
outside the host adapter set stay unverified and block materialization.
