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
Shapes: the SDK's
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
  compiler), the vetted PrimeVue pack (compose from it; that is the
  consistency law), and `{ t, te, locale }`.
- The returned component declares props `{ record, persistence }`.
  `persistence` carries `createBlank({ name })`, `loadDocument(record)`,
  `saveDocument(record, document, { fileName, mimeType })`, and
  `rename(record, name)` — the generic instance transports. Documents ride
  the payload channel; the module never calls the API itself.
- Never import `vue`, `primevue`, or `pinia` — the mount injects them.
  `perigram-plugin surfaces <module.mjs>` refuses a module whose import
  graph carries host externals, whose factory is missing, or whose factory
  logs errors against the stub context.
- The surface UX laws: the host owns the chrome (mount inside the page
  you are given; never invent toolbars around it), the save affordance
  and undo behavior match the platform editors, keyboard paths and aria
  labels are first-class. Remote editors are online-only — mount fast and
  fail honestly.
- Declare it in the listing beside the editor binding:

  ```json
  "surfaces": [{ "id": "coating-designer", "module": "/surfaces/coating-designer.mjs", "surfaceContract": 1 }],
  "editors": [{ "type": "coating-sheet", "surface": "coating-designer", "modes": ["edit"] }]
  ```

  The executor serves the module at that path (static file route beside
  the services); `surfaceContract` is the mount-contract major — the
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
