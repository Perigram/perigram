# COMPONENT: Plugins (marketplace consumer side)

Plugin marketplace consumer contracts (SPEC §Plugin marketplace): a
platform-published central catalog, per-organization installs pinning a
declaration snapshot, and the install/uninstall gates. A third-party
plugin is **declarations plus (later) connectors** — never in-process
code: the plugin's types compose into the organization's registry view
exactly like pack types, and future service connectors bind external
executors through the worker protocol.

## Contract

- **Catalog** (`plugin_catalog`): one listing per `pluginId` —
  `{ pluginId, name, description, version, declarations: { types } }`.
  Platform-published only; organizations never write it. Publishing
  rides `server/scripts/plugins-catalog-publish.js <listing.json>`
  (publisher UI is a later slice).
- **Installs** (`plugin_installs`): one per organization+plugin —
  `{ organizationId, pluginId, name, version, declarations, installedAt }`.
  The install **snapshots** the listing's declarations: the pinned
  version is the data, so catalog changes never reach an installed
  organization until it upgrades (upgrade flow is a later slice riding
  the type-migration machinery).
- **Composition**: installed declarations are a resolution source
  between system pack types and the org-authored overlay
  (`compileRegistryForOrganization` in
  [cts-types](../cts-types/README.md)); plugin types serve as
  `scope: 'system'` in the org view, and the generic instance machinery
  resolves them per call (`declarationFor` in
  [instances](../instances/README.md)) with the same cache and
  invalidation. Plugin types never copy into the org-authored store —
  ownership stays with the plugin for clean upgrades.
- **Connector services**: a listing may declare `services` —
  `{ id (slug), label, signature: { input, output }, render }` records in
  the SPEC §8 V grammar. Installs snapshot them beside the types and mint
  a `connectorToken`. Installed services compose into the projected
  domain's service list (`packServicesForOrganization` — the one list the
  designer, compiler, and admin domain route resolve), as species records
  whose id and command are the same plugin-qualified id
  `plugin.<pluginId>.<serviceId>`; they obey the same active-process
  service gating as pack services. Executing one enqueues a task run on
  the claim queue `plugin.<pluginId>@<organizationId>` (the whole service
  input rides one `value` parameter) and returns it as the command's
  async boundary — the process invocation parks until completion. The
  publisher's executor polls the worker endpoints with the connector
  token: `requireWorkerAccess`
  ([tasks](../../core/tasks/README.md)) accepts it for claim scoped to
  that queue only, plus heartbeat/complete/fail. Uninstall deletes the
  install record, which revokes the token; admins rotate it from the
  Plugins page's connector panel.
- **Install gate**: trial composition on the live org view — every
  plugin type id must be free (no system, installed, or org declaration
  holds it; the no-shadowing rule), each type must define cleanly, and
  the compile must introduce no new errors. A refused install writes
  nothing.
- **Uninstall gate (block until drained)**: live instances of any plugin
  type, or live process definitions binding one, refuse the removal.
  There is no abandon path; the org deletes or migrates first.
- Installs/uninstalls invalidate the instance-declaration cache,
  re-derive instance indexes, and publish the org contract-change event
  (`registry` origin) so open screens reconcile.

## Routes

| Route | Access | Action |
|---|---|---|
| `GET /api/plugins/catalog` | authenticated | List catalog listings. |
| `GET /api/organizations/:id/plugins` | member (`organizations:read`) | List installed plugins. |
| `POST /api/organizations/:id/plugins` | `organizations:admin` | Install `{ pluginId }` at the catalog's current version. |
| `DELETE /api/organizations/:id/plugins/:pluginId` | `organizations:admin` | Uninstall (drain-gated). |
| `GET /api/organizations/:id/plugins/:pluginId/connector` | `organizations:admin` | Connector panel data: token, claim queue, worker endpoints. |
| `POST /api/organizations/:id/plugins/:pluginId/connector/regenerate` | `organizations:admin` | Rotate the connector token. |

The organization UI is the Plugins section in org settings
([pages/organization](../../../pages/organization/README.md)).

## Not here yet (tracked in TODO)

Version upgrades and cross-org execution (installed processes running
cross-org sockets) are later slices of the marketplace plan.

## Related

- [server/features/README.md](../README.md) — feature classification.
- [cts-types](../cts-types/README.md) — org view composition.
- [instances](../instances/README.md) — per-call declaration resolution.
