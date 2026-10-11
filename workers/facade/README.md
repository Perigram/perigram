# CONTAINER: Facade Plugin Executor

The facade fabrication domain as a third-party plugin (SPEC §Plugin
marketplace, owner decision 2026-10-10): `listing.json` is the whole
declaration surface (types, services, editor bindings, attachment kinds,
conversions, service-backed construction bindings, exports), and this
process is the executor that owns the domain's compute. The platform
carries zero facade code — it reaches this executor per configured
service endpoint (endpoint mode), sending referenced instances and
payloads as base64 values and receiving computed fields and files. The
executor never calls back.

Runs from the repo mount (compose `facade-executor`, port 8790) or as
its own deployment — nothing here imports platform code; `vendor/` holds
the geometry/OCCS/DXF modules (the app keeps its own copies for the
read-side preview family until that migrates; the executor's are
authoritative for construction).

## Editor surfaces

The plugin's editor modules live in `surfaces/` and are served by this
executor as static GETs beside the services (the install-resolved module
URL `http://<origin>/surfaces/<module>.mjs`; CORS-open, path-traversal
refused — the URL is the only credential the browser gets). Each module
targets a surface mount contract
([plugin-surfaces](../../shared/plugin-surfaces.js)):

| Surface | Contract | Serves |
|---|---|---|
| `sheet-design-editor` | 2 | The sheet-design type's editor: layout drag/rotate/snap, layer-pen styling, save through the mount's patch transport. Pure layout compute in `surfaces/lib/`. |

The cassette designer remains an app-side registration until its own
migration (TODO §Plugin-delivered editor surfaces, M6).

## Services

| Service | Construction/flow | Contract |
|---|---|---|
| `extract-geometry` | cassette-design `upload`/`convertDxf` | DXF payload (base64) in → `{ data: { geometry } }` out |
| `bake` | cassette-design `bake` | template ref (payload = OCCS document, base64) + parameters in → evaluated geometry out |
| `nesting-solve` | the `plugin.facade.nesting-solve` value service | SPEC §8 signature; calls the nesting worker (`NESTING_WORKER_URL`) |
| `import-cassette` | the `dxfSourceToCassette` conversion | artifact buffer + layer mapping in → cassette payload + extracted fields out |
| `generate-sheet-dxf` | the sheet-design `LAYOUT_DXF` export binding | stored geometry values in → DXF text out |

## Publish, install, migrate

- Listing: `workers/facade/listing.json` (validated by
  [@perigram/plugin-sdk](../../packages/plugin-sdk/README.md) —
  `npx perigram-plugin validate workers/facade/listing.json`).
- Publish + install: the publish API (`POST /api/plugins/catalog`) and the
  org install route, or the CLI (`perigram-plugin publish`, `install`).
- Existing orgs: `server/scripts/migrate-facade-pack-to-plugin.js`
  swaps the mounted pack for the install (disablement record + install
  snapshot + service-node rewrites `nesting.solve` →
  `plugin.facade.nesting-solve`); type ids are unchanged, so instances
  and process bindings resolve continuously.

Parent: [workers README](../README.md). Platform consumer:
[plugins feature](../../server/features/plugins/README.md).
