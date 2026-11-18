```yaml
doc_id: WORKERS-SPEC-001
classification: reference
status: active
owner: product-owner
created: 2026-10-24
updated: 2026-10-24
```

# SPEC: Workers — executor plane

Four HTTP processes run beside the app: the nesting solver and three plugin
executors (facade, documents, tech-drawing). Each executor is one plugin's
compute and surface host; the platform reaches it per configured endpoint
and executes zero plugin code. Code under `workers/` imports platform code
zero times.

Parents: [README.md](../README.md) · [SPEC.md](../SPEC.md) ·
[workers/README.md](./README.md)

## Contracts owned here

### The listing contract

One `listing.json` per executor is the plugin's whole declaration surface
(types, editors, services, surfaces, attachment kinds, conversions,
constructions, exports, dependencies, starter constructs), validated by
`npx perigram-plugin validate` and snapshotted at install
([packages/plugin-sdk](../packages/plugin-sdk/README.md)).

| Executor | Port | Declarations | Services | Surfaces |
|---|---|---|---|---|
| [nesting](./nesting/README.md) | platform capability | generic polygon parts and stock geometry; no Facade type dependency | `nesting-solve` (managed server runtime; `nesting.solve` host capability) | — |
| [facade](./facade/README.md) | 8790 | types `cassette-template`, `cassette-design`, `cassette-instance`, `sheet-design`, `sheet-cut-plan`, `sheet-instance`, `profile`, `hardware`; constructions `render`/`upload`/`convertDxf` (cassette-design), `fromLayout` (sheet-design); `dxf` export on sheet-design; `requires: ["tech-drawing"]` | `nesting-solve`, `extract-geometry`, `bake`, `generate-sheet-dxf`, `construct-sheet`, `match-sheet`, `nesting-parts` | `sheet-design-editor` (5), `cassette-designer` (2), `cassette-preview` (1), `profile-preview` (1) |
| [documents](./documents/README.md) | 8791 | generic media/office file types; `fill` on text-document/xlsx-workbook/pdf-document, `render` on pdf-document; text-document starter construct; `requires: ["tech-drawing"]` | 27 listing-derived `documents-shared` graph operations (browser/server targets declared) plus 7 endpoint services: `table-rows`, `table-cells`, `text`, `fill`, `render-pdf`, `render-report-pdf`, `render-document-pdf` | `text-editor` (3), `csv-editor` (3), `document-preview`, `html-preview` |
| [tech-drawing](./tech-drawing/README.md) | 8792 | drawing reference types, DXF/SVG sources (geometry revision scope on dxf-source), `fill` on dxf-source, the sketch type | `place-dxf` | `sketch-editor` (3) |

### Endpoint-mode service protocol

The platform sends referenced instances and payloads as base64 values; the
executor returns computed fields and files in one response; the executor
calls nothing back. Static serving is CORS-open with path traversal
refused — the module URL is the only credential the browser holds.

### Executor-served surface modules

`surfaces/*.mjs` are served as static GETs at
`http://<origin>/surfaces/<module>.mjs` beside the services. Each module
targets a [plugin-surfaces](../shared/plugin-surfaces.js) contract
version; the mount contract (data-only surface, host-owned chrome) lives
in the root [SPEC.md](../SPEC.md) §20.

### Nesting solver — [nesting](./nesting/README.md)

- `NESTING_WORKER_URL` is the full endpoint including `/nest` (default
  `http://nesting-worker:8000/nest`; a base URL 404s).
- `POST /nest`: `items[]` (`id`, `coords`, `handles`, `count`) + `params`
  (`width`, `height`, `space`, `sheetCount`, optional `sheet_polygon` as a
  flat outer-ring list or `{ outer, inner }`; inner rings become
  container holes).
- Response: `lbf` solution JSON (layouts, placed items, transformations).
  When every item fails geometry validation the worker answers HTTP 200
  `{ status: 'error', message, solution: { layouts: [] } }`; the Nesting
  managed runtime maps `status === 'error'` to a 502 operation failure.
- Pure algorithm service: buffer polygons by spacing, build the lbf
  config, run the vendored `lbf` binary as a subprocess; the solver holds
  no database client.

### Vendor laws

- GPL exclusion: GPL-licensed engines stay out of the plugin plane — DWG
  parsing (LibreDWG) keeps the pipeline DXF-only; external constraint
  solvers stay behind the service seam.
- Vendored runtimes rebuild through `perigram-plugin vendor` from declared
  dependencies; each vendor directory's README owns its rebuild contract
  and traps (cadcraft: pinned release edition + the same-origin host
  module and chrome CSS; three: OrbitControls sibling-import rewrite;
  documents: esbuild-bundled crepe theme over the enabled features).
- `workers/nesting/jagua-rs` is vendored upstream, read-only.

## Structure

| Path | Homes |
|---|---|
| `facade/` | entry `index.js`; `services.js` (the seven services); `nesting-projections.js` (value→value purity); `occs/` the domain's single geometry engine — executor services and browser surfaces share it, and it is served statically; `surfaces/` + `surfaces/lib/` editor and preview modules; `vendor/` DXF engines; `assets/vendor/{three,clipper2}` |
| `documents/` | entry, services, text/csv surfaces, vendored editor runtimes |
| `tech-drawing/` | declarations listing + sketch and DXF editor surfaces + the vendored CadCraft edition |
| `nesting/` | installable generic Nesting plugin (`listing.json`, managed `runtime/server.mjs`) plus isolated `worker_service.py`; `core/nesting_input_builder.py`, `core/geometry_utils.py`; `jagua-rs/` + `lbf` |
| `plugin-executor.Dockerfile` | shared executor image; the nesting image builds from the repo-root context |

## Laws

- Publish, install, upgrade, and diff-preview are owned by
  [server/features/plugins](../server/features/plugins/README.md);
  executor READMEs link it.
- The `task_runs` claim protocol (`WORKER_TOKEN`, `/api/tasks/*`) is owned
  by [server/core/tasks](../server/core/tasks/README.md).
- The OCCS layer standards (`occs/layerStandards.js`) are the registry of
  record; every production output (DXF export, nesting redraw, baked
  layerData) names layers through that table via `applyOccsLayerPens`.
- Migration scripts live in [server/scripts](../server/scripts/README.md);
  a listing migration keeps type ids stable and restarts the app so
  per-org declaration caches rebuild.

## End state

Executor READMEs carry the services/surfaces tables, the publish link, and
each migration script's name with its durable trap; the occs README is
the shape-model contract book; every vendor directory documents its
rebuild contract.
