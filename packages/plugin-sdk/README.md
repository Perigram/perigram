# COMPONENT: @perigram/plugin-sdk

The plugin authoring toolkit (SPEC §Plugin marketplace): the listing
contract, both executor harnesses, the platform API client, and the
`perigram-plugin` CLI. Zero dependencies — Node's globals only. The
platform's install gate and publish API import the same `parseListing`, so
a listing that validates here is publishable and installable there; the
contract home is this package, mirrored as
[`src/listing.schema.json`](./src/listing.schema.json) for editors and
tooling.

Parent: [root README](../../README.md). Consumer contract:
[plugins feature](../../server/features/plugins/README.md); authoring
walkthrough: [plugin authoring guide](../../docs/PLUGIN_AUTHORING.md).

## Listing contract (`parseListing` / `normalizeListing`)

A listing is `{ pluginId (slug), name, description, version, visibility?,
organizations?, requires?, declarations }` where `visibility` is `public`
(the default) or `private` — a private listing is served only to the
organizations its `organizations` ids name, scoped by the operator at
publish (the catalog stays platform-published). `requires` lists pack or
plugin ids the types resolve against, satisfied by a mounted pack or an
installed plugin (never the plugin itself); the platform-side gates
enforce it. `declarations` carries `types` (CTS grammar,
non-empty), `services` (SPEC §8 signatures, `mode` endpoint/claim),
`editors` (file-type editor bindings — the bound type must be declared by
the same plugin with class `file`, one binding per type),
`surfaces` (plugin-delivered surface modules, owner decision 2026-10-11:
`[{ id, module, surfaceContract, kind? }]` — a root-relative module path
the plugin's executor serves, the mount-contract major it targets, and a
`kind` of `editor` (the default) or `preview` (M7: the read-only
`{ record, payload }` mount into the platform's preview slots — always
contract 1; `checkSurfaceModule` below validates the module
author-side), `previews` (`[{ type, surface }]` — the plugin's types
whose preview slots mount the bound preview surface, one per type),
`attachmentKinds` (payload upload contracts keyed by kind id), and
`conversions` (artifact conversion entries; an optional `service` names a
declared plugin service as the executor, bare or plugin-qualified),
`constructions` (the plugin's types' construction modes bound to plugin
services — the platform resolves ref inputs and payloads as base64
values and merges the returned fields before creating the record
generically), `starterConstructs` (`[{ typeId, construction }]` —
constructs the plugin stations into every installing organization's
initial process: the plugin's own file type, a declared mode, one per
type), `dependencies` (declared runtime dependencies, owner decision
2026-10-17: `[{ name, version, module, license }]` — one flat vendor
bundle per npm name served by the executor at `module`; surface modules
import the bare `name` and the platform's module proxy resolves it to
the plugin's own vendor scope; what the mount injects — `vue`,
`primevue`, `pinia`, and the host markdown pipeline `marked`/`dompurify`
— refuses as a dependency, never vendorable; `perigram-plugin vendor`
builds the bundles and writes the manifest), and `exports` (attachment
exports bound to plugin services). A type's `projections` resolve a
stored `field` path or a
declared endpoint-mode `service` (`resolve: { service:
'plugin.<id>.<svc>' }` — the platform sends `{ typeId, payloadBase64 }`
and the service's JSON response is the projection value; `handler`
resolves are the pack-mount binding and refuse here).
`parseListing` throws on every violation; `normalizeListing` returns the
catalog document the publish API stores.

## Executor harnesses

- **Endpoint mode** — `createEndpointExecutor({ services, token })` returns
  a `node:http` server serving each service at `POST /<serviceId>` (JSON
  in/out, handler errors as 500 with the message body, optional
  `authorization: Bearer` key check). Point the plugin's Connection
  settings at it.
- **Claim mode** — `runClaimExecutor({ appUrl, token, workerId, services,
  pollIntervalMs, heartbeatIntervalMs, signal, onLog, fetchImpl })` polls
  `/api/tasks/claim` with the connector token, executes one claimed run at
  a time (`taskId` `plugin.<x>.<y>` → `services[y]`), heartbeats while the
  handler runs, then completes or fails the run. An unknown service fails
  the run loudly instead of dropping it. Poll cadence is kept between
  every claim — a queue that always has work must not starve timers.

A services module is any ESM file exporting `services` (or a default):
`{ '<serviceId>': async input => output }`.

## Surface module check (`checkSurfaceModule`)

The author-side half of the consistency law: `checkSurfaceModule(path)`
loads a surface module and proves what the SDK can prove alone and
zero-dep — the import graph carries no host externals (`vue`, `primevue`,
`pinia`: the mount injects them; `marked`/`dompurify`: the host markdown
pipeline is provided, never vendored), the default export is the factory
`createSurface(ctx) -> component`, and the factory returns a component
against a stub context without logging errors. A bare specifier naming a
declared dependency is legal (owner decision 2026-10-17 — the platform's
module proxy resolves it); with `dependencies` and `pluginRoot`, every
declared vendor module must also exist under the plugin root. The stub
carries the contract-2 superset (queries, notify, access beside the base
context), so editor-grade modules smoke against their full mount
context; the author-facing contract shapes live in the
[plugin authoring guide](../../docs/PLUGIN_AUTHORING.md) §1a. The real
host-shell mount (save callbacks over the instance transports) is proven
by the platform's fixture-plugin e2e. The CLI wraps it:
`perigram-plugin surfaces <module.mjs> [--listing listing.json]`.

## Vendor command (`perigram-plugin vendor`)

Builds a plugin's declared runtime dependencies as flat bundles: it
scans the plugin's own module graph for bare imports, bundles each name
once with the plugin repo's esbuild install (`npm i -D esbuild` — the
SDK stays zero-dependency), writes `assets/vendor/<name>.mjs`, and emits
the `{ name, version, module, license }` manifest entries — merging them
into the listing with `--listing`. A dependency tree never crosses the
platform boundary; the flattened, declared artifact does. Unresolvable
names surface as leftovers (install them, or vendor their code by
relative import the pre-2026 way).

## API client (`createPluginClient`)

`{ appUrl, operatorToken?, token?, organizationId? }` → `{ login,
publish, install, connector, settings, saveSettings, invoke }`, each a
thin documented-route call (`publish` → `POST /api/plugins/catalog` with
`x-operator-token`; the org-scoped calls take the user JWT as Bearer;
`invoke` rides `POST /api/admin/commands/plugin.<x>.<y>/run`). Missing
credentials are named errors, not obscure 401s.

## CLI (`perigram-plugin`)

```
login --email E --password P        print an access token (save as PERIGRAM_TOKEN)
validate <listing.json>             validate the listing locally
dev <services.mjs> [--port N] [--token K]   run the endpoint executor locally
run <services.mjs> --token <connector token> [--app URL] [--worker-id ID]
publish <listing.json>              publish to the catalog (PERIGRAM_OPERATOR_TOKEN)
install <pluginId>                  install into PERIGRAM_ORG_ID
connector <pluginId>                connector panel: token, queue, endpoints
connect <pluginId> [--set svc=URL ...] [--key K] [--surface-origin URL]
                                    read/save connection settings (the
                                    surface origin serves plugins with
                                    surfaces but no endpoint services)
test <pluginId> <serviceId> [--input file.json]   invoke an installed service
surfaces <module.mjs> [--listing L]   check a surface module (import graph,
                                    factory shape, stub-context smoke);
                                    --listing admits declared dependencies
vendor [--listing L] [--entry DIR]   build flat vendor bundles for the
                                    graph's bare imports, merge the
                                    dependency manifest into the listing
```

Env: `PERIGRAM_APP` (default `http://localhost:3000`),
`PERIGRAM_OPERATOR_TOKEN`, `PERIGRAM_TOKEN`, `PERIGRAM_ORG_ID`.

## Related

- [server/features/plugins](../../server/features/plugins/README.md) — the
  platform consumer of the contract.
- [docs/PLUGIN_AUTHORING.md](../../docs/PLUGIN_AUTHORING.md) — the
  authoring walkthrough.
