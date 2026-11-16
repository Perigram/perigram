# Managed Plugin Runtime

Parent: [workers](../README.md).

One platform worker claims the shared `plugin-runtime` task type for every
organization and installed plugin. The worker retrieves the pinned
organization-owned package assets through a claim-bound API, creates a
temporary package directory, and starts a fresh Deno process for each
operation.

The parent worker retains the platform token and network access. The
operation process receives the package directory as its read boundary and
runs with a bounded V8 heap and wall time. Its permission set excludes
network access, environment access, filesystem writes, and child-process
creation. Organization data, files, and other host services are available
through capability requests that the parent forwards to the server; the
server checks the active task claim, installed package version, operation
declaration, and capability allowlist before executing a handler.

Runtime modules export `createRuntime()` (or a default factory) returning
an object with `execute(operationId, input, { capabilities, signal })`.
The same operation contract is used by the browser Worker adapter. Package
dependencies resolve from installed local assets through the generated
Deno import map.

Perigram runs this worker as shared platform infrastructure across
organizations. Each install carries immutable package assets and declared
runtime requirements.
