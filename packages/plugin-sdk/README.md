# COMPONENT: @perigram/plugin-sdk

The plugin authoring toolkit (SPEC §20): the listing
contract, both executor harnesses, the platform API client, and the
`perigram-plugin` CLI. Zero dependencies — Node's globals only. The
platform's install gate and publish API import the same `parseListing`, so
a listing that validates here is publishable and installable there; the
contract home is this package, mirrored as
[`src/listing.schema.json`](./src/listing.schema.json) for editors and
tooling.

Parent: [packages README](../README.md). Consumer contract:
[plugins feature](../../server/features/plugins/README.md); host-side
surface mount:
[generated screens](../../components/generated/README.md).

## Authoring loop

A plugin is declarations plus connectors: `listing.json` (the whole
contract, `perigram-plugin validate listing.json`) and `services.mjs` (one
handler per declared service). Two hosting models, one contract:

| Model | Who runs the executor | How the platform reaches it |
|---|---|---|
| Self-hosted | The org (or an agent acting for it) | claim mode (poll) or endpoint mode (URL + key) |
| Cloud-hosted | The publisher | endpoint mode (their URL + API key) |

Run the executor locally (`perigram-plugin dev`), or poll in claim mode
(`perigram-plugin run --token <connector token>`). Publish, install,
connect, and test ride the CLI sequence under §CLI: `login` → `publish` →
`install` → `connector` → `connect --set <svc>=<url> --key <key>` →
`test`. A plugin release is two deploys at one version: the executor
image and the listing (`publish`; built-in deployment plugins seed from
`server/scripts/seed-plugin-catalog.js`). Installed organizations see the
available version and apply it themselves through the upgrade diff
preview.

Acceptance is one clean loop through install → execute → upgrade →
uninstall: the install gate (type-id no-shadowing, clean compile,
claimable attachment kinds, required packs enabled), the upgrade preview,
and the uninstall drain gate all refuse loudly.

## Surface mount contracts

A surface module default-exports the factory `createSurface(ctx) ->
component`; the component declares props `{ record, persistence, mode }`
(the preview `kind`: `{ record, payload }`). `mode` is the grant-keyed
mount mode — `'edit'` when the opener holds the type's write grant,
`'read'` otherwise; an editor module that declares the prop degrades to
its read-only presentation under `'read'` (SPEC §4). A surface module may
carry named
exports of its own domain law; host renderers consume them through the
served surface URL (the DXF editor exports `spotNamesOf`, the anchor
read the fill dialog's spot-parts row uses). The ctx ladder by
`surfaceContract` major:

- **1 (base)** — `{ vue, components, locale }`: the host's Vue runtime
  subset (render functions only), the vetted component pack, and
  `{ t, te, locale }`. The mount injects `vue`, `primevue`, and `pinia`;
  surface modules receive them through the ctx.
- **2 (editor-grade)** — adds `queries` (`list(typeId, params)` /
  `get(typeId, id)`), `records` (`create` / `update` / `delete` across
  types), `notify` (host toast), `access` (`canWrite(record)` gates
  editing; a denied surface degrades to view-only).
- **3 (capability)** — adds `sync.onRecordChanged(callback)` (host
  record-change bridge; own publications are skipped host-side) and
  `upload.file(blob, { fileName })` (host file channel, returns the
  stored ref).
- **4 (navigation)** — adds `open.instance({ typeId, instanceId })`: the
  workspace owns tabs, surfaces ask through it (the record surface of an
  editor-bound type is its editor, SPEC §4).

`persistence` carries `createBlank()`, `loadDocument(record)`,
`saveDocument(record, document, { fileName, mimeType })`, `patch(record,
body)`, `rename(record, name)` — the generic instance transports; the
bound type must declare a revision scope (payload replacement requires
one). Preview surfaces receive the read-only `{ record, payload }` mount:
the host owns the chrome and keeps its generic preview while the module
loads or cannot mount; render a quiet blank for records with nothing
to show.
Surface markup rides host-compiled utility classes — a class the host
does not scan is dead, so the surface's sources join the scan (the
plugins feature's surface-styles contract). Third-party runtimes ride
declared vendor dependencies (§Vendor command).

## Listing contract (`parseListing` / `normalizeListing`)

A listing is `{ pluginId (slug), name, description, version, visibility?,
organizations?, requires?, declarations }` where `visibility` is `public`
(the default) or `private` — a private listing is served only to the
organizations its `organizations` ids name, scoped by the operator at
publish (the catalog stays platform-published). `requires` lists the pack or plugin ids
the types resolve against, satisfied by an install (never the plugin
itself); the platform-side gates enforce it. `declarations` carries `types` (CTS grammar,
non-empty; a type may carry the transient `migrate` steps and
`renameFrom: <retired id>` — the rename channel upgrades consume,
never stored on the install pin), `services` (SPEC §8 signatures, `mode` endpoint/claim),
`editors` (file-type editor bindings — the bound type must be declared by
the same plugin with class `file`, one binding per type),
`surfaces` (plugin-delivered surface modules:
`[{ id, module, surfaceContract, kind? }]` — a root-relative module path
the plugin's executor serves, the mount-contract major it targets, and a
`kind` of `editor` (the default) or `preview` (M7: the read-only
`{ record, payload }` mount into the platform's preview slots — always
contract 1; `checkSurfaceModule` below validates the module
author-side), `previews` (`[{ type, surface }]` — the plugin's types
whose preview slots mount the bound preview surface, one per type),
`constructions` (the plugin's types' construction modes bound to plugin
services — the dispatch sends
`{ mode, typeId, refs, pins, draft: { identity, data, lineage } }` with
ref inputs and payloads resolved as base64
values; the executor returns `data` fields and may return `payload:
{ base64, mime, name? }`, which becomes the created record's
payload, or answer a refusal as `{ failures: [{ name?, message }] }`
naming its offenders, which the platform refuses the construction
with; the executor may also return `meta`, an ephemeral object the
construction preview answers verbatim and records never store — the
documents fills name the template's tokens through it), `starterConstructs` (`[{ typeId, construction }]` —
constructs the plugin stations into every installing organization's
initial process: the plugin's own file type, a declared mode, one per
type), `dependencies` (declared runtime dependencies:
`[{ name, version, module, license }]` — one flat vendor
bundle per npm name served by the executor at `module`; surface modules
import the bare `name` and the platform's module proxy resolves it to
the plugin's own vendor scope, or — for a `module` of the form
`plugin:<id><path>` — to the required plugin's scope (`<id>` must appear
in `requires`); what the mount injects — `vue`,
`primevue`, `pinia`, and the host markdown pipeline
`marked`/`dompurify`/`pele` — refuses as a dependency;
`perigram-plugin vendor`
builds the bundles and writes the manifest), and `exports` (attachment
exports bound to plugin services). A type's `projections` resolve a
stored `field` path or a
declared endpoint-mode `service` (`resolve: { service:
'plugin.<id>.<svc>' }` — the platform sends `{ typeId, payloadBase64 }`
and the service's JSON response is the projection value; `handler`
resolves are the pack-mount binding and refuse here).
`parseListing` throws on every violation; `normalizeListing` returns the
catalog document the publish API stores. A service or projection may
declare `group` — a slug naming the process-designer palette section its
operation drops into (SPEC §8 plugin-tab law: grouped operations render
in the plugin's own tab; an ungrouped service falls to the services
tab, an ungrouped projection stays palette-unlisted); `parseListing`
rejects a malformed slug, and `group` is mirrored in
[`src/listing.schema.json`](./src/listing.schema.json) for editors and
agents authoring listings. `previewChannels`
(`[{ id, surface, label }]`, SPEC §28) declares the plugin's designer
preview tabs: each binds a preview-kind surface the designer mounts
read-only over the graph's preview evaluation — the channel id is a
globally unique slug and the label is the tab's name; the same schema
mirror carries it.

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
  the run loudly. Poll cadence is kept between
  every claim — a queue that always has work must not starve timers.

A services module is any ESM file exporting `services` (or a default):
`{ '<serviceId>': async input => output }`.

## Surface module check (`checkSurfaceModule`)

The author-side half of the consistency law: `checkSurfaceModule(path)`
loads a surface module and proves what the SDK can prove alone and
zero-dep — the import graph carries no host externals (`vue`, `primevue`,
`pinia`: the mount injects them; `marked`/`dompurify`/`pele`: the host
markdown pipeline is provided, never vendored), the default export is the factory
`createSurface(ctx) -> component`, and the factory returns a component
against a stub context without logging errors. A bare specifier naming a
declared dependency is legal (the platform's
module proxy resolves it); with `dependencies` and `pluginRoot`, every
declared vendor module must also exist under the plugin root — a
`plugin:<id><path>` module lives under the required plugin's root and is
exempt. The stub
carries the contract-4 superset (queries, records, notify, access, sync,
upload, open beside the base context), so modules smoke against their
full mount context; the author-facing contract shapes live in §Surface mount
contracts. The real
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
platform boundary; the flattened, declared bundle does. Unresolvable
names surface as leftovers (install them, or vendor their code by
relative import).

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
- [components/generated](../../components/generated/README.md) — the
  host-side surface mount and preview slots.
