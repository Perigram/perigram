# CONTAINER: build123d Plugin Executor

> **Transitional legacy implementation (owner direction 2026-11-16).**
> This endpoint executor and its per-operation endpoint listing are not the
> target architecture. New development must follow SPEC §20 local-first
> organization plugins: package assets are installed as organization data,
> and build123d executes in the browser through Pyodide/OCP.wasm. Do not add
> new executor endpoints, endpoint settings, or deployment dependencies.
>
> The intended upstream implementation is
> [1suo/build123d-flow](https://github.com/1suo/build123d-flow). As checked
> on 2026-11-16, main is
> `3c62677065016ae166f50a176130b127ca35ef12` (package version `0.1.0`),
> using build123d `0.13.0`, Pyodide `314.0.7`, and OCP.wasm
> `8.0.1.1.post202609241841`. It is an early standalone app; integrate its
> graph/editor/runtime components into a Perigram plugin package rather
> than embedding its app shell. Its latest commit removed the test suite,
> so restore browser-runtime, discovery, geometry, export, and graph
> regression tests before production integration.


The build123d engine as an installable plugin (SPEC §28): the op
catalog is parsed from the installed build123d library by introspection;
every op registers as a deterministic service operation with its provenance
and palette placement. One provider URL receives `{ operationId, input }`
and a generic dispatcher executes the real library call. The executor is
Python — the engine's own runtime.

Parent: [workers README](../README.md). Contract:
[plugin SDK](../../packages/plugin-sdk/README.md); platform consumer:
[plugins feature](../../server/features/plugins/README.md).

## Discovery law

| File | Role |
|---|---|
| `discover.py` | Introspects the installed build123d and emits `catalog.json`: one op per representable constructor (the `objects_part`/`objects_sketch`/`objects_curve` shape factories), function (the `operations_*` modules, `drafting`, `text`), and shape-algebra operator (`Shape.__add__`/`__sub__`/`__and__` as union/subtract/intersect). |
| `generate-listing.mjs` | Compiles the catalog into `listing.json`, validating through the SDK's `parseListing` before writing. |
| `catalog.json` | The generated catalog: op id, kind, label, palette group, python target, params, return, doc summary, provenance (`build123d` + version). Committed; the executor's dispatch table. |
| `listing.json` | The generated listing (one service per op). Committed; the publish input. |
| `dispatch.py` | The one evaluator: resolves an op from the catalog, coerces args per its param types, calls the real build123d callable, serializes the result. |
| `server.py` | Transitional provider executor: one `POST /` with `{ operationId, input }`; env `BUILD123D_EXECUTOR_PORT` (8793), `BUILD123D_EXECUTOR_KEY`. |
| `Dockerfile` | `python:3.14-slim` + the engine, pinned to the catalog's provenance version. |

Regenerate after an engine change (the Dockerfile pin moves with it):

```bash
cd workers/build123d
python3 discover.py > catalog.json
node generate-listing.mjs
npx perigram-plugin validate listing.json
```

Admissibility rules (the policy; the installed API decides the rest):

- A param annotated `float`/`int`/`bool`/`str` maps to number/boolean/
  string; shape classes and shape collections map to a shape value; a
  non-representable annotation drops the param when it has a default
  and rejects the callable when required.
- Positional variadic parameters make a callable inadmissible because graph inputs cannot represent positional argument lists; keyword variadics are ignored.
- File-I/O callables stay out (the attachment channel owns files).
- The algebra operand is shape-typed by protocol semantics — the
  installed signatures leave it unannotated; its first param is the
  receiver.
- Ids are slugs; a collision takes a numeric suffix.

## Value contract

A shape on the wire is `{ kind: 'shape', step: <base64>, bounds: { min,
max }, volume?, area? }` — a STEP serialization plus measured extents.
A shape-typed param accepts one shape value or a list of them. Ops that
return scalars return the scalar.

In the transitional listing every op is `{ mode: 'endpoint', cache: 'deterministic'
}`: pure compute over values, replayed by the platform's service cache.
Scalar params prompt as command parameters; shape and json params are
graph data sockets. Palette sections derive from the discovered module
(`part`, `sketch`, `curve`, `operations`, `drafting`, `text`, `algebra`).

The listing declares one type, `b3d-part` (file class, `application/step`
payload, upload creation) — the persistence vocabulary for STEP parts.

## Deploy

- Dev compose: `build123d-executor` (port 8793) builds from
  `workers/build123d`.
- Publish: `node server/scripts/seed-plugin-catalog.js` seeds the
  built-in listing; organizations install from the Plugins section and
  configure the single provider-level executor origin in Connection settings.
