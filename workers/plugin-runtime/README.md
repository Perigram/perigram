# Managed Plugin Runtime

Parent: [workers](../README.md).

One platform worker claims the shared `plugin-runtime` task type for every
organization and installed plugin. The worker retrieves the pinned
organization-owned package assets through a claim-bound API, creates a
temporary package directory, and starts a fresh Deno process for each
operation.

The parent worker retains the platform token and network access. The
operation process receives the package directory as its read boundary and
runs with a bounded V8 heap and wall time. The child process starts with a package-scoped read permission and bounded
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
