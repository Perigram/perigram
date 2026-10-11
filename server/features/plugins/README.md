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
  `{ pluginId, name, description, version, requires?, declarations: { types,
  services, editors, surfaces, attachmentKinds, conversions, constructions, exports } }`.
  Platform-published only; organizations never write it. Publishing rides
  `POST /api/plugins/catalog` (operator token) — the
  [@perigram/plugin-sdk](../../../packages/plugin-sdk/README.md) CLI wraps
  it (`perigram-plugin publish`); the listing contract is validated by the
  SDK's `parseListing`, the same parser the install gate runs.
- **Installs** (`plugin_installs`): one per organization+plugin —
  `{ organizationId, pluginId, name, version, declarations, services,
  requires, endpoints, connectorToken, installedAt }`.
  The install **snapshots** the listing's declarations: the pinned
  version is the data, so catalog changes never reach an installed
  organization until it upgrades (upgrade flow is a later slice riding
  the type-migration machinery). Every install write — route or
  onboarding — rides `installFromCatalog`, the gate-and-write core: the
  route wrapper only adds caller authority, and an organization's
  default installs at creation (`organizations/default-plugins.js`)
  pass the same gates with pre-wired, validated endpoints for
  endpoint-mode services.
- **Composition**: installed declarations are a resolution source
  between system pack types and the org-authored overlay
  (`compileRegistryForOrganization` in
  [cts-types](../cts-types/README.md)); plugin types serve as
  `scope: 'system'` in the org view, and the generic instance machinery
  resolves them per call (`declarationFor` in
  [instances](../instances/README.md)) with the same cache and
  invalidation. Plugin types never copy into the org-authored store —
  `constructions` binds the plugin's own types' construction modes to
  plugin services (the instance machinery dispatches them, see
  [instances](../instances/README.md)); `exports` binds attachment
  exports (`generateAttachment` resolves the sheet-design LAYOUT_DXF
  executor through it). Installed construction contracts merge into the
  projected domain's construction table beside the packs
  (`packDomainsForOrganization`).
  ownership stays with the plugin for clean upgrades.
- **Connector services**: a listing may declare `services` —
  `{ id (slug), label, signature: { input, output }, render, mode }` records
  in the SPEC §8 V grammar (`mode`: `endpoint` — the platform calls the
  configured URL with the service input and expects the service output as
  JSON, the nesting-worker shape, 60 s budget, optional
  `authorization: Bearer <key>` from the install's `authToken`; or `claim`,
  the default — the executor polls the worker protocol). Installs snapshot
  them beside the types and mint a `connectorToken`; the Connection settings
  (`GET`/`POST .../plugins/:pluginId/settings`) store per-service
  `endpoints` and the executor API key. Installed services compose into the
  projected domain's service list (`packServicesForOrganization` — the one
  list the designer, compiler, and admin domain route resolve), as species
  records whose id and command are the same plugin-qualified id
  `plugin.<pluginId>.<serviceId>`; they obey the same active-process
  service gating as pack services. Executing one dispatches by mode:
  endpoint mode calls the URL (missing endpoint refuses with a
  configure-it message), claim mode enqueues a task run on
  the claim queue `plugin.<pluginId>@<organizationId>` (the whole service
  input rides one `value` parameter) and returns it as the command's
  async boundary — the process invocation parks until completion. The
  worker endpoints accept the connector token scoped to that queue only
  ([tasks](../../core/tasks/README.md)). Uninstall deletes the
  install record, which revokes the token; admins rotate it from the
  Plugins page's connector panel. Authoring and hosting (including the
  executor implementations for both modes) is documented in the
  [plugin authoring guide](../../../docs/PLUGIN_AUTHORING.md).
- **Install gate**: trial composition on the live org view — every
  plugin type id must be free (no system, installed, or org declaration
  holds it; the no-shadowing rule), each type must define cleanly, and
  the compile must introduce no new errors. A refused install writes
  nothing. Beside it: a `requires` entry must name a mounted pack that is
  enabled for the organization (a disabled requirement strands the
  plugin's types), and an attachment-kind id must be unclaimed (enabled
  packs and other installs hold their kinds globally — collisions
  refuse). Editor bindings ride the listing contract (the bound type must
  be the plugin's own `file` type, one editor per type) and compose into
  the served type view beside the packs
  ([cts-types](../cts-types/README.md)). A declared surface module must
  target a mount-contract version the platform supports
  (`shared/plugin-surfaces.js` is the single supported-set home, read by
  this gate and the client loader) — an unsupported contract refuses the
  install and the upgrade, never a runtime half-mount (owner decision
  2026-10-11). Surface declarations snapshot with the install beside the
  editor bindings.
- **Mounted-pack enablement**: the installed list includes the mounted
  domain packs (the facade and its dependencies) — enabled by default,
  zero migration. `GET .../plugins/state` serves the combined pack +
  install state; `POST .../plugins/packs/:packId` re-enables a pack
  (cascading over its requirements), `DELETE` disables one under the
  same drain law as a plugin uninstall: live instances or process
  bindings on any pack type refuse, an enabled dependent pack refuses,
  an installed plugin whose `requires` names the pack refuses, and a
  trial compose of the org view without the pack refuses when
  org-authored declarations still reference its types. Disablement
  records live in `pack_disablements`; absence is enabled. This is the
  management plane the facade extraction lands in — the org-facing
  contract stays install/remove while the pack's code moves out from
  underneath.
- **Upgrades**: pins move only through an explicit diff-plus-migration
  apply (`GET`/`POST /api/organizations/:id/plugins/:pluginId/upgrade`).
  The preview runs the SPEC §11 planner over every changed type
  (`planTypeMigration`): additions list as such, removals drain-gate like
  uninstall, uncovered breaking changes on types with live instances
  block the apply (zero-instance types re-break freely, mirroring org
  authoring relief), and covered steps — declared on the new
  declaration's transient `migrate` — execute against instances on
  apply. The apply re-checks the install-gate laws against the world as
  it is (required packs still enabled, attachment kinds still claimable),
  trial-composes the org view without the plugin's old layer
  (`compileRegistryForOrganization`'s `excludePluginId`) so a refused
  upgrade writes nothing; the persisted pin never carries `migrate` and
  carries the extended declaration layer (editors, attachment kinds,
  conversions, requires) beside the types. Services replace with the
  snapshot; the connector token survives.
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
| `POST /api/plugins/catalog` | platform operator (`x-operator-token`) | Publish/upsert a listing (validated by the SDK contract). |
| `GET /api/organizations/:id/plugins` | member (`organizations:read`) | List installed plugins. |
| `POST /api/organizations/:id/plugins` | `organizations:admin` | Install `{ pluginId }` at the catalog's current version. |
| `DELETE /api/organizations/:id/plugins/:pluginId` | `organizations:admin` | Uninstall (drain-gated). |
| `GET /api/organizations/:id/plugins/:pluginId/upgrade` | `organizations:admin` | Upgrade preview: additions, removals, §11 change plans, blockers. |
| `POST /api/organizations/:id/plugins/:pluginId/upgrade` | `organizations:admin` | Apply the upgrade (gated by the preview's blockers). |
| `GET /api/organizations/:id/plugins/state` | member (`organizations:read`) | Combined state: mounted packs (enabled/disabled) + marketplace installs. |
| `POST /api/organizations/:id/plugins/packs/:packId` | `organizations:admin` | Enable a mounted pack (cascades over requirements). |
| `DELETE /api/organizations/:id/plugins/packs/:packId` | `organizations:admin` | Disable a mounted pack (drain-gated, dependents-gated, trial-compose-gated). |
| `GET /api/organizations/:id/plugins/:pluginId/connector` | `organizations:admin` | Connector panel data: token, claim queue, worker endpoints. |
| `POST /api/organizations/:id/plugins/:pluginId/connector/regenerate` | `organizations:admin` | Rotate the connector token. |
| `GET /api/organizations/:id/plugins/:pluginId/settings` | `organizations:admin` | Connection settings: per-service modes and endpoints, API key. |
| `POST /api/organizations/:id/plugins/:pluginId/settings` | `organizations:admin` | Save connection settings (endpoints for endpoint-mode services, API key). |

The organization UI is the Plugins section in org settings
([pages/organization](../../../pages/organization/README.md)): installed
plugins and the central catalog.

## Not here yet (tracked in TODO)

Cross-org execution (installed processes running cross-org sockets) and a
publisher UI beyond the CLI are later slices of the marketplace plan.

## Related

- [server/features/README.md](../README.md) — feature classification.
- [cts-types](../cts-types/README.md) — org view composition.
- [instances](../instances/README.md) — per-call declaration resolution.
- [Plugin authoring guide](../../../docs/PLUGIN_AUTHORING.md) — authoring,
  hosting, and publishing for agents and humans.
