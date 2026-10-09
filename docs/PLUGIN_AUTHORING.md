# Plugin Authoring Guide (for coding agents and humans)

```yaml
doc_id: PERIGRAM-PLUGIN-AUTHORING-001
classification: reference
status: active
owner: product-owner
created: 2026-10-09
updated: 2026-10-09
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
[server/features/plugins](../server/features/plugins/README.md).

## 1. Author the listing

One JSON file — the whole plugin contract:

```json
{
  "pluginId": "coatings",
  "name": "Coatings",
  "description": "Coating reference types and matching service",
  "version": "1",
  "declarations": {
    "types": [
      {
        "id": "coating",
        "class": "item",
        "name": "Coating",
        "fields": { "code": { "base": "string" } }
      }
    ],
    "services": [
      {
        "id": "match",
        "label": "Coating match",
        "mode": "endpoint",
        "signature": {
          "input": { "base": "record", "fields": { "code": { "base": "string" } } },
          "output": { "base": "json" }
        }
      }
    ]
  }
}
```

Rules the publisher script and the install gate enforce:

- `pluginId` and every `services[].id` are slugs (`[a-z0-9-]+`).
- Every type needs `id` and `class` (`file`/`item`/`group`); type ids must
  not collide with system pack types, other plugins, or the org's own
  declarations — install refuses loudly. `name` is the display name users
  see (the SPEC §13 display vocabulary); without it the raw id never
  renders — the UI falls back to a localized type-name table shared with
  the platform's own types.
- Type declarations use the CTS grammar (see
  [packages/cts](../packages/cts/README.md)); states, edges, and fields
  follow the same shapes the process designer authors.
- Service `signature`s are the SPEC §8 V grammar: pure values in and out,
  no `ref` fields — a service never dereferences instances.
- `mode` per service: `"endpoint"` (the platform calls a URL) or
  `"claim"` (your executor polls; default).

## 2. Publish

```bash
node server/scripts/plugins-catalog-publish.js coatings.json
```

Upserts the listing in the platform catalog (platform-published; orgs
never write it). Bump `version` for a new release — installed
organizations see the upgrade with a diff preview.

## 3. Implement the executor

### endpoint mode (both hosting models)

An HTTP handler: `POST` the service input as the JSON request body,
respond with the service output as JSON.

- Auth: when the org configured an API key, it arrives as
  `authorization: Bearer <key>`.
- Errors: any non-2xx fails the service call (body text surfaces in the
  error); answer slowly and the call times out at 60 s — long work
  belongs in claim mode.
- The org sets the URL (and optional key) in the plugin's Connection
  settings on the Plugins page.

### claim mode

Poll the worker protocol with the connector token from the plugin's
connector panel:

```
POST /api/tasks/claim          { "workerId": "my-executor" }
  → run: { _id, taskId, input: { parameters: { value: <service input> } }, claimToken }
POST /api/tasks/{runId}/heartbeat  { "claimToken": "..." }
POST /api/tasks/{runId}/complete   { "claimToken": "...", "result": { "output": <service output> } }
POST /api/tasks/{runId}/fail       { "claimToken": "...", "message": "..." }
```

All calls carry `x-worker-token: <connector token>`. Claims are pinned to
your organization's queue for your plugin (`plugin.<pluginId>@<orgId>`) —
you will never receive another org's or plugin's runs. The `taskId` has
the shape `plugin.<pluginId>.<serviceId>`. A completed run resumes the
parked process invocation with your output.

## 4. Install and connect

Organization → Plugins → Install (consent lists the types and services),
then:

- endpoint services: Connection (sliders) → set URLs + API key;
- claim services: Connector (key) → copy the token into your executor;
  rotate it there when regenerated.

## 5. Test it

With the dev stack running: publish the listing, install it into a throwaway
org, exercise the service through a process (drop a `cts.service` node
bound to `plugin.<x>.<y>` into a draft, enable the service in the
service-access tab, apply, run), and confirm the executor's output
surfaces on the invocation. The install gate, upgrade preview, and
uninstall drain gate all refuse loudly — a clean run through install →
execute → upgrade → uninstall is the acceptance loop.
