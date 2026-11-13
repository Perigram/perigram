# CONTAINER: build123d Plugin Executor

The build123d engine as an installable plugin (SPEC §28): the op
catalog is parsed from the installed build123d library by
introspection, every op registers as a deterministic endpoint value
service with its provenance and palette placement, and one generic
dispatcher executes the real library call. The executor is python —
the engine's own runtime.

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
| `server.py` | Endpoint-mode executor: `POST /<op-id>` with the service input record as the JSON body; env `BUILD123D_EXECUTOR_PORT` (8793), `BUILD123D_EXECUTOR_KEY`. |
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
- Variadic parameters are ignored while named parameters remain.
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

In the listing every op is `{ mode: 'endpoint', cache: 'deterministic'
}`: pure compute over values, replayed by the platform's service cache.
Scalar params prompt as command parameters; shape and json params are
graph data sockets. Palette sections derive from the discovered module
(`build123d-part`, `build123d-sketch`, `build123d-curve`,
`build123d-operations`, `build123d-drafting`, `build123d-text`,
`build123d-algebra`).

The listing declares one type, `b3d-part` (file class, `application/step`
payload, upload creation) — the persistence vocabulary for STEP parts.

## Deploy

- Dev compose: `build123d-executor` (port 8793) builds from
  `workers/build123d`.
- Publish: `node server/scripts/seed-plugin-catalog.js` seeds the
  built-in listing; organizations install from the Plugins section and
  point the Connection settings at the executor.
