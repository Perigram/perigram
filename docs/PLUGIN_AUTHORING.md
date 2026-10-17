# Plugin Authoring Guide (for coding agents and humans)

```yaml
doc_id: PERIGRAM-PLUGIN-AUTHORING-001
classification: reference
status: active
owner: product-owner
created: 2026-10-09
updated: 2026-10-10
```


How to author, host, and publish a Perigram plugin. A plugin is
**declarations plus connectors** ([SPEC §Plugin
marketplace](../SPEC.md)): type declarations and service contracts as
data, executable logic outside the platform process. There is no
in-process plugin code — ever.

Two hosting models, one contract:

| Model | Who runs the executor | How the platform reaches it |
|---|---|---|
| Self-hosted | You (the org, or an agent acting for it) | claim mode (poll) or endpoint mode (URL you configure) |
| Cloud-hosted | The publisher | endpoint mode (their URL + API key) |

Parent: [root README](../README.md). Component contract:
[server/features/plugins](../server/features/plugins/README.md). Toolkit:
[@perigram/plugin-sdk](../packages/plugin-sdk/README.md) — the listing
contract (with JSON schema), both executor harnesses, and the
`perigram-plugin` CLI this guide uses.

## 1. Author the listing and the services

Two files:

- `listing.json` — the whole plugin contract. Validate locally against the
  contract and schema:

  ```bash
  npx perigram-plugin validate listing.json
  ```

- `services.mjs` — the executor logic, one handler per declared service:

  ```js
  export const services = {
    match: async (input) => ({ matched: input?.code ?? null })
  };
  ```

The listing may declare beside its types: `services` (SPEC §8 signatures
with `mode` `endpoint`/`claim`), `editors` (file-type editor bindings —
only for file types the plugin itself declares), `surfaces`
(plugin-delivered editor surface modules — see §1a), `attachmentKinds`
(payload upload contracts), `conversions` (artifact conversions, with an
optional `service` binding), `constructions` (the plugin's types'
construction modes bound to plugin services — the platform resolves the
operator's inputs as values and merges the executor's computed fields
into the created record), `exports` (attachment exports bound to plugin
services), and `requires` (mounted pack ids the types resolve against).
Types follow the CTS declaration grammar — fields, states, transitions,
operators, payload traits, and revision scopes are authored with the
vocabulary documented in
[packages/cts](../packages/cts/README.md). Shapes: the SDK's
[listing contract](../packages/plugin-sdk/README.md).

## 1a. Author an editor surface (plugin-delivered UI)

An editor-bearing plugin ships its editor itself (owner decision
2026-10-11): the listing declares the surface's module, the executor
serves it, and the platform mounts it inside its own chrome. The surface
contract is data-only — the module receives the record and the
persistence callbacks, never stores, routing, or auth:

- Default-export the factory `createSurface(ctx) -> component`. `ctx` is
  `{ vue, components, locale }`: the host's Vue runtime subset (`h`, `ref`,
  `computed`, `watch`, lifecycle hooks — render functions, no template
  compiler), the vetted component pack (compose from it; that is the
  consistency law), and `{ t, te, locale }`. The pack is the PrimeVue
  primitives (`Button`, `Checkbox`, `Dialog`, `InputText`, `InputNumber`,
  `Message`, `Popover`, `ScrollPanel`, `Select`, `Tag`, `Textarea`) plus
  the host designer chrome (`DesignerSurface`, `DesignerWorkspace`,
  `DrawingCanvas`, `InstanceSelect`, `StandardDialog`).
- The returned component declares props `{ record, persistence }`.
  `persistence` carries `createBlank()`, `loadDocument(record)`,
  `saveDocument(record, document, { fileName, mimeType })`,
  `patch(record, body)`, and `rename(record, name)` — the generic
  instance transports. A blank create enters unnamed (the type's
  identifier row names records; `rename` renames them); documents ride
  the payload channel; `patch` writes record data and summary through
  the generic update transport; the module never calls the API itself.
  The bound type must declare a revision scope (`revisions`, e.g.
  `"document"`): payload replacement requires one, and a type without it
  refuses saves.
- Utility classes in surface markup are host-compiled: the app's tailwind
  content scan must include the surface's sources (the plugins feature
  README's surface-styles contract). Classes the host does not compile
  are silently dead — a surface that needs one the host lacks must get
  its sources into the scan, not assume it exists.
- Editor-grade mounts (`surfaceContract: 2`) receive three more ctx
  members beside the base: `queries` (`list(typeId, params)` /
  `get(typeId, id)` — cross-type instance reads over the generic
  transport, the data-only replacement for store access), `records`
  (`create(typeId, payload)` / `update(typeId, id, payload)` — cross-type
  record writes for editors that compose other types' records),
  `notify` (`{ severity, summary, detail }` — the host toast), and
  `access` (`canWrite(record)` — the host's write-grant resolution;
  without the grant, degrade to view-only). A surface that needs none of
  them stays on contract 1. The plugin serves its own third-party runtimes
  beside its modules — either vendored as static assets under the
  executor root, imported by relative URL, or as declared runtime
  dependencies (owner decision 2026-10-17): `perigram-plugin vendor
  --listing listing.json` builds each bare import into one flat bundle
  under `assets/vendor/` and declares `{ name, version, module, license
  }` in the listing; the module then imports the bare name
  (`import * as THREE from 'three'`) and the platform's module proxy
  resolves it to the plugin's own vendor scope. What the mount injects
  is never vendorable: `vue`, `primevue`, `pinia`, and the host markdown
  pipeline (`renderMarkdown` is provided; `marked`/`dompurify` refuse as
  dependencies) — and the plugin repo needs `esbuild` installed for the
  vendor build (the SDK itself stays zero-dependency).
- Never import `vue`, `primevue`, or `pinia` — the mount injects them.

### 1b. Author a preview surface (read-only)

A plugin can also own how its types PREVIEW (M7): declare a surface with
`"kind": "preview"` (always contract 1) and bind it with a `previews`
entry. The platform mounts it in its preview slots — the card preview
band and the detail previewSource group — over a read-only mount:

- The component's props are `{ record, payload }`: the instance record
  (the §3 wire shape) and the parsed payload document (`null` when the
  record has no payload or it does not parse). The host resolves the
  payload URL — the module never fetches, persists, or queries; it
  receives no `queries`/`records`/`notify`/`access` io and no
  persistence callbacks.
- Card chrome stays the platform's. While the module loads, and whenever
  it cannot (unconnected executor, offline), the platform's generic
  preview keeps rendering — render a quiet blank for records with
  nothing to show instead of an error state.
- Everything else follows the editor laws: host vue, the vetted
  component pack (e.g. `DrawingCanvas` for drawings), host locale, no
  host externals, `perigram-plugin surfaces` validates the module.
  `perigram-plugin surfaces <module.mjs>` refuses a module whose import
  graph carries host externals, whose factory is missing, or whose factory
  logs errors against the stub context (the stub carries the contract-2
  superset, so editor-grade modules smoke against their full context).
- The surface UX laws: the host owns the chrome (mount inside the page
  you are given; compose the designer chrome from the pack instead of
  inventing toolbars around it), the save affordance and undo behavior
  match the platform editors, keyboard paths and aria labels are
  first-class. Remote editors are online-only — mount fast and fail
  honestly.
- Declare it in the listing beside the editor binding:

  ```json
  "surfaces": [{ "id": "coating-designer", "module": "/surfaces/coating-designer.mjs", "surfaceContract": 2 }],
  "editors": [{ "type": "coating-sheet", "surface": "coating-designer", "modes": ["edit"] }]
  ```

  The executor serves the module at that path (static file route beside
  the services); the platform streams it to the browser same-origin
  through its plugin-module proxy, so the executor host never needs to be
  browser-reachable. `surfaceContract` is the mount-contract major — the
  platform refuses an install targeting one it does not support.

## 2. Run the executor

Endpoint mode (both hosting models) — a local HTTP executor, one URL per
service:

```bash
npx perigram-plugin dev services.mjs --port 8787 --token executor-key
```

Claim mode — poll the worker protocol with the connector token from the
plugin's connector panel:

```bash
npx perigram-plugin run services.mjs --token <connector token> --app https://your-perigram
```

The harnesses also import directly from `@perigram/plugin-sdk`
(`createEndpointExecutor`, `runClaimExecutor`) when you want to own the
process.

## 3. Publish, install, connect, test

```bash
export PERIGRAM_APP=https://your-perigram
export PERIGRAM_OPERATOR_TOKEN=...   # platform operator (publish)
npx perigram-plugin login --email you@org --password ...   # → PERIGRAM_TOKEN
export PERIGRAM_ORG_ID=...

npx perigram-plugin publish listing.json
npx perigram-plugin install coatings
npx perigram-plugin connector coatings          # token + claim queue
npx perigram-plugin connect coatings --set match=http://localhost:8787/match --key executor-key
npx perigram-plugin test coatings match --input input.json
```

Publishing rides the platform API (`POST /api/plugins/catalog`,
operator-token gated) — the same validation the install gate runs. Bump
`version` for a new release; installed organizations see the upgrade with
a diff preview.

## 4. Acceptance loop

Install → execute → upgrade → uninstall. The install gate (type-id
no-shadowing, clean compile, claimable attachment kinds, required packs
enabled), the upgrade preview, and the uninstall drain gate all refuse
loudly — a clean loop through those four states is the acceptance test.

## 5. Release loop

A plugin release is two deploys at one version: the executor (a
container image beside the app, or wherever its orgs reach it) and the
listing (`perigram-plugin publish`; plugins built into a deployment seed
from `server/scripts/seed-plugin-catalog.js`). Bump `version`, ship both,
and installed organizations see the available version on the Plugins
page and apply it through the §11 diff preview — publishing never pushes
to orgs.
