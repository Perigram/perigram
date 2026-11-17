# build123d provider integration

The provider implementation lives in
[1suo/build123d-flow](https://github.com/1suo/build123d-flow/tree/perigram-plugin).
This directory records the host-side integration contract; it is not a
second plugin implementation and must not grow a parallel graph runtime.

## Host ownership

Perigram owns canonical graph documents and immutable graph revisions;
normalized provider-neutral node definitions and exact-version registry;
graph planning, procedural evaluation coordination, execution records,
collection/tree mapping, matching, diagnostics, and output references;
plugin installation, runtime isolation, capability mediation, and preview
workspace lifecycle.

The build123d provider owns Python AST translation, build123d type/API
introspection, the local Pyodide/OCP.wasm runtime implementation, native-value
lifetime inside that runtime, and CAD representation production.

## Provider identity and contracts

The provider id is `build123d`. Python-language lowering primitives use
`perigram.python`; they must not be presented as CAD-domain operations.
Operation ids are stable discovered catalog identities, pinned by an
independent node-definition version.

Every port declares transport shape independently from semantic identity.
The semantic descriptor uses open-world nominal identities for discovered
native types and `{ kind: 'any' }` for unknown values. Any is not a statement
that the runtime value is non-geometric. Geometry preview is selected from
the runtime output representation and provider capabilities, not a closed
socket-type allowlist.

The canonical graph format identifier is `perigram.graph` (version 1),
owned by `packages/core/src/graph.js`. Provider adapters must validate
against the actual `@perigram/plugin-sdk/nodes` and `packages/core`
validators; a locally reimplemented schema is not an acceptable substitute.

## Runtime architecture

The target is local-first browser execution. The installed plugin declares a
JavaScript runtime entry; that runtime hosts Pyodide and OCP.wasm and exposes
provider definitions/dispatch through the SDK's browser-safe node-provider
contract. Perigram's JavaScript Worker remains the isolation boundary. Python
and native kernel objects stay inside the Pyodide runtime and never cross
structured-clone or persistence boundaries.

The existing `workers/build123d` Python endpoint executor is transitional
legacy infrastructure. Its README explicitly says not to add endpoint
settings, services, or deployment dependencies. Do not revive it as a
separate server-side Python task worker.

## Production acceptance gates

1. A plugin package declares the JavaScript runtime entry and pins compatible
   Pyodide, build123d, and OCP.wasm assets/dependencies.
2. The runtime registers provider definitions through the SDK and resolves
   exact provider/operation/version identities.
3. Kernel-free translation output passes the actual SDK node-definition
   validator and canonical graph-document validator in CI.
4. Translated graphs execute through Perigram's procedural evaluator,
   retaining Perigram's data-tree matching and execution-scope semantics.
5. Native values remain runtime-owned; outputs cross the host boundary only
   through scoped references and explicitly supported preview representations.
6. Cancellation, bounded memory/time, diagnostics, and cache invalidation
   are exercised in browser-worker tests.
7. Install, author, execute, upgrade, and uninstall complete end to end.

Until all seven gates pass, this remains an integration prototype, not a
production-installable CAD provider. No gate may be replaced by an adapter
unit test or omitted to claim green.
