# COMPONENT: @perigram/plugin-sdk

The plugin authoring toolkit (SPEC §20): the listing and portable
execution contracts, provider-neutral node definitions, external
integration harnesses, the platform API client, and the
`perigram-plugin` CLI. It has no third-party runtime dependencies.
The listing parser is pure and runs in Node and browsers; executor,
surface-check, vendor, and CLI modules use Node built-ins. The platform's
install gate and publish API import the same `parseListing`, so a listing
that validates here is publishable and installable there; the contract
home is this package, mirrored as
[`src/listing.schema.json`](./src/listing.schema.json) for editors and
tooling.

Parent: [packages README](../README.md). Consumer contract:
[plugins feature](../../server/features/plugins/README.md); host-side
surface mount:
[generated screens](../../components/generated/README.md).

## Authoring loop

A plugin package contains `listing.json`, versioned runtime entry modules,
surface modules, and declared dependencies. The listing declares each
runtime's language, version, entry asset, and supported targets. Each
managed operation declares its runtime, supported targets, execution
kind, and required host capabilities. `perigram-plugin validate listing.json`
checks the package contract before publication.

Perigram owns browser Worker execution and managed isolated server
execution. Organizations install immutable package assets and compose
graphs against the pinned declarations. Provider-level external
integrations use explicit connection protocols with credentials held by
the platform. The endpoint and claim harnesses remain available for those
remote integration adapters.

Acceptance is one clean loop through install → execute → upgrade →
uninstall: the install gate (type-id no-shadowing, clean compile,
claimable attachment kinds, required packs enabled), the upgrade preview,
and the uninstall drain gate all refuse loudly.

## Runtime entry points

| Entry | Runtime | Contract |
|---|---|---|
| `@perigram/plugin-sdk/listing` | Node and browser | Pure `parseListing` / `normalizeListing`; safe for client-side listing validation. |
| `@perigram/plugin-sdk` | Node.js | Node-bound barrel re-exporting the listing, executor, surface-check, API client, and node-contract modules; do not import it into browser bundles. |
| `@perigram/plugin-sdk/endpoint-executor`, `./claim-executor`, `./api-client`, `./surface-check` | Node.js | Server/executor and authoring helpers. |
| `perigram-plugin` | Node.js CLI | Package bin entry; not a browser API. |

The package export map is the supported boundary. Browser consumers import
the dedicated `./listing` entry rather than reaching into `src/` or
importing the Node-bound root barrel.

## Node provider palette contract

Every node definition declares `palette.group` as a stable lowercase semantic slug. `palette.label` is the optional human-facing group name and `palette.keywords` are provider-authored search aliases. The same `palette` object is used by plugin service and projection declarations in `listing.json`: `group` is a stable semantic slug, `label` is the optional human-facing group label, `keywords` are provider-authored search aliases, and `visible: false` keeps construction/projection helpers out of graph-node discovery. The SDK rejects malformed metadata and retired `group` fields; operation-id prefixes are never inferred as palette categories. Providers keep their operation and port identities independent of labels and grouping.

## Port compatibility

The SDK provides `compareNodePorts(source, target)` for provider-neutral
transport and semantic checks, plus `createPortCompatibilityRegistry()` for
registered domain-specific compatibility profiles. Domain packages own and
register those profiles; the SDK stays domain-neutral. Beyond the dedicated
paths — transport shape, semantic `base` equality, `nullable` widening,
`constraints` (conditional), and `unit` (conversion-required) — every
semantic key, known or unknown, is a qualifier compared by deep value
equality (object key order ignored, array order significant): equal values
leave the verdict unchanged, differing values return `incompatible` with a
reason naming the key. A qualifier declared by the target alone makes the
result `conditional` (the runtime validates it); a qualifier declared by the
source alone is `incompatible`. A generic JSON target — `base: 'json'`
carrying at most `nullable` — accepts typed JSON values. A specific semantic
target requires a matching declared identity or a provider-declared runtime
validator. Optional outputs and nullable values may connect to stricter
inputs conditionally; the graph evaluator checks presence, nullability, and
primitive/record base values at runtime. The graph editor uses `compatible`
for connection gestures, persisted-edge validation, and preview preflight.

Every comparator result — the default comparator's and every registered
profile comparator's — is `{ status, compatible, reason, conversions }`: a
`status` from the frozen `PORT_COMPATIBILITY_OUTCOMES` vocabulary, a boolean
`compatible`, a string `reason`, and a `conversions` array. A profile
comparator result with an unknown status, a missing key, or a `compatible`
flag contradicting its status throws at dispatch.

| Outcome | `compatible` | Meaning |
|---|---|---|
| `exact` | `true` | Transport and semantic contracts match. |
| `safe-coercion` | `true` | The target accepts the value through widening (item into a collection, non-null into nullable, typed into generic JSON). |
| `conditional` | `true` | The connection holds after a runtime check (optional-source presence, nullable source, differing constraints, an undeclared target qualifier, an untyped source against a typed target). |
| `conversion-required` | `false` | The edge needs an explicit conversion; `conversions` carries the matching declared conversions. |
| `incompatible` | `false` | The ports accept no connection. |

### Declared conversions

A node provider declares conversions alongside its definitions;
`normalizeNodeProvider` validates and freezes them (ids unique within the
provider), and `registry.registerConversions(list)` registers the flat list
with a port compatibility registry:

```js
conversions: [
  {
    id: 'length.mm-to-m',
    from: { base: 'number', unit: 'mm' },
    to: { base: 'number', unit: 'm' },
    runtime: 'javascript',
    deterministic: true,
    fidelity: 'lossless'
  }
]
```

`from` and `to` are partial semantic descriptors: a string `base` plus the
keys the conversion compares. `provider` and `runtime` are optional ids
naming the conversion's executor; `fidelity` comes from the frozen
`CONVERSION_FIDELITIES` vocabulary (`lossless`, `semantically-lossy`,
`visual-only`).

When a comparison returns `conversion-required` with empty `conversions`, the
registry attaches every registered conversion whose `from` keys all equal the
source port's `semantic` values and whose `to` keys all equal the target's.
Only the keys a declaration names are compared, by exact value equality.

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
itself); the platform-side gates enforce it. `declarations` carries `types` (CTS grammar, non-empty; types may carry
transient migration declarations), `services` (SPEC §8 signatures,
palette metadata, and either managed `execution` metadata or an explicit
external-integration `mode`), `runtimes` (version-pinned runtime
descriptors: `{ id, language, version, entry, targets }`; language is
`javascript`, `python`, or `wasm`; entry is a `.js`/`.mjs`, `.py`, or
`.wasm` package asset respectively; targets
are `browser` and/or `server`), and `engine` (the transitional browser
engine declaration: `{ module }` — a root-relative entry module served
from the installed package; its default export is
`createEngine() -> { dispatch?, nodeProviders? }` — optional
`dispatch(serviceId, parameters) -> Promise<value>` and optional
node-provider contributions in the `@perigram/plugin-sdk/nodes` shape).
A managed service declares `execution: { runtime, targets, kind,
capabilities?, deterministic?, idempotent? }`. Its runtime entry module
exports `createRuntime()` (or a default factory) returning
`{ execute(operationId, input, { capabilities, signal }) }`. The runtime factory may return a `providers` array of structured-cloneable
provider metadata (`provider`, `definitions`, and optional
`previewRenderers`). Each definition pins `execution.runtime` and
`execution.targets`; the host wraps provider execution in Worker RPC.
Provider metadata is produced inside the Worker. A preview renderer maps
its renderer id to the id of a plugin-declared `preview` surface; the
host resolves that id to the installed module URL and mounts the surface
with `{ record: null, payload: { value, output } }`. Renderer metadata
stays structured-cloneable across the Worker boundary. Capability calls
use `capabilities.call(name, input)` and are mediated by the host. `runtime` references
a declared runtime; `targets` is a non-empty subset of that runtime's
targets; `kind` uses the graph node execution vocabulary: `pure`, `read`,
`stateful`, `proposal`, `commit`, `effect`, or `control`; capability ids are
qualified names such as `files.read` or `organization.instances.read`.
Pure operations are capability-free. `commit` and `effect` operations are server-only and require a declared host capability. Managed service operations declare `execution` as their runtime contract.
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
`primevue`, `pinia`, `dompurify`, and `pele` — refuses as a dependency
(`marked` vendors only for a server runtime the managed child executes;
the surface check refuses it inside surface module graphs, which receive
the host's `renderMarkdown`);
`perigram-plugin vendor`
builds the bundles and writes the manifest), and `exports` (attachment
exports bound to plugin services). A type's `projections` resolve a
stored `field` path or a
declared `service` (`resolve: { service:
'plugin.<id>.<svc>' }` — the platform sends `{ typeId, payloadBase64 }`
and the service's JSON response is the projection value; the bound
service is endpoint mode or a managed pure server operation, and
`handler`
resolves are the pack-mount binding and refuse here).
`parseListing` throws on every violation; `normalizeListing` returns the
catalog document the publish API stores. Service and projection declarations
use the same `palette` object as node definitions: `palette.group` is the
stable lowercase slug used to group an operation in the process designer,
`palette.label` is its optional human-facing label, and
`palette.keywords` are search aliases. A visible service must declare
`palette.group`; `palette.visible: false` excludes an internal operation
from discovery. The retired service-level `group` field is rejected.
This shape is mirrored in [`src/listing.schema.json`](./src/listing.schema.json). A signature field may declare `kind` — a
namespaced value slug (`document.report`, `text.flow-document`) that
gates socket compatibility: a kinded socket accepts its own kind alone,
an unkinded `json` socket accepts everything, so conversion between
value kinds stays an explicit graph operation (HAG P1/P4). A service
declaring `cache: 'deterministic'` must be endpoint mode (SPEC §28): the
platform replays same-input
executions through its service cache — the key covers the service
identity, the installed version, and the canonical input — so the
executor sees each distinct input once; the declaration is a promise
the service makes about its own output, and a claim-mode service
refuses it (its run parks on the queue and replays through its own
task record). A type projection's service resolve binds an endpoint-mode
service or a managed pure server operation — the platform's synchronous
managed projection boundary executes the latter in-process.
`previewChannels`
(`[{ id, surface, label }]`, SPEC §28) declares the plugin's designer
preview tabs: each binds a preview-kind surface the designer mounts
read-only over the graph's preview evaluation — the channel id is a
globally unique slug and the label is the tab's name; the same schema
mirror carries it.

## Provider-neutral node contracts

The browser-safe `@perigram/plugin-sdk/nodes` entry owns normalized node
provider definitions and exact-version registration. A definition declares
provider and operation identity, its own version, JSON configuration schema,
input/output ports, semantic descriptors, transport shapes, execution kind,
qualified unique capability ids, determinism, idempotency, and optional preview metadata. Provider IDs are lowercase; operation and port IDs preserve the existing stable identifier grammar, including camel-case names. A runtime-bound definition declares `execution.targets` beside its `runtime`; a host-native definition (a platform provider whose host executes it directly) declares `execution.targets` alone.

- `validateNodeDefinition`, `normalizeNodeDefinition`, and
  `assertValidNodeDefinition` validate and freeze declarations.
- `createNodeProviderRegistry` registers definitions by provider, operation,
  and exact definition version; resolution returns the exact registered version.
- Port transport shape and semantic meaning are independent fields;
  `TRANSPORT_SHAPES` is the frozen transport-shape vocabulary (`item`,
  `list`, `tree`, `map`, `tuple`, `stream`).
- `PORT_COMPATIBILITY_OUTCOMES` is the frozen comparator-outcome vocabulary
  and `CONVERSION_FIDELITIES` the frozen conversion-fidelity vocabulary
  (§Port compatibility).

The package root remains Node-bound. Browser consumers import the dedicated
`./nodes` entry for graph authoring and provider discovery.

## Executor harnesses

- **Endpoint mode** — `createEndpointExecutor({ services, token })` returns
  a `node:http` server serving every operation through one `POST /` provider
  URL. The JSON envelope is `{ operationId, input }`; handler errors return
  500 with the message body, and the optional `authorization: Bearer` key
  check is provider-wide. Point the plugin's single executor setting at it.
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
