# build123d provider integration

The provider implementation lives in [1suo/build123d-flow](https://github.com/1suo/build123d-flow/tree/perigram-plugin). This directory records the host-side integration contract; it is not a second plugin implementation and must not grow a parallel graph runtime.

## Host ownership

Perigram remains authoritative for canonical graph documents and immutable graph revisions; normalized provider-neutral node definitions and exact-version registry; graph planning, procedural evaluation coordination, execution records, collection/tree mapping, matching, diagnostics, and output references; plugin installation, runtime isolation, capability mediation, and preview workspace lifecycle.

The build123d provider owns Python AST translation, build123d type/API introspection, native operation execution, native-value lifetime, and CAD representation production.

## Provider identity and contracts

The provider id is build123d. Python-language lowering primitives use perigram.python; they must not be presented as CAD-domain operations. Operation ids are the stable discovered catalog identities, pinned by an independent node-definition version.

Every port declares shape independently from semantic. The semantic descriptor uses open-world nominal identities for discovered native types and { kind: 'any' } for unknown values. Any is not a statement that the runtime value is non-geometric. Geometry preview is selected from the runtime output representation and provider capabilities, not a closed socket-type allowlist.

Native Python and OCP objects never enter graph JSON. The provider retains them inside its isolated execution context and exposes scoped output references and supported preview representations.

## Runtime integration gate

A Python runtime descriptor in a listing is not, by itself, proof that the host can launch a native Python process. Before enabling this provider in the catalog, the host must demonstrate:

1. a pinned Python runtime implementation and dependency image;
2. installation of pinned build123d/OCP dependencies without importing them into the Perigram host or JavaScript worker;
3. provider discovery metadata crossing the worker boundary as structured cloneable JSON;
4. operation dispatch with cancellation, bounded resources, and diagnostics;
5. native-value ownership scoped to one execution, with no native object serialized into graph documents or execution records;
6. preview artifact/reference delivery to a declared, capability-restricted preview renderer;
7. provider version pinning and deterministic invalidation of cached outputs.

Until all seven pass, the plugin is an integration prototype, not a production-installable CAD provider.

## Acceptance boundary

The provider repository tests the Python translator and adapter without a CAD kernel. Perigram tests the SDK definitions and canonical graph documents using the actual plugin-sdk/nodes and packages/core validators. The integrated suite then exercises provider dispatch, native CAD execution, output references, preview, and plugin lifecycle. No gate may be substituted for a later gate or made green by omitting examples.
