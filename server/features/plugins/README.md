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
  `{ pluginId, name, description, version, visibility?, organizations?,
  requires?, declarations: { types,
  services, editors, surfaces, previews, attachmentKinds, conversions, constructions, exports } }`.
  Platform-published only; organizations never write it. A listing may be
  `visibility: 'private'` with owning `organizations` ids — the catalog
  route serves it only to members of those orgs (the operator scopes
  private listings; owner decision 2026-10-17). Built-in listings seed
  from the deployment (`server/scripts/seed-plugin-catalog.js`, marked
  `builtin`) and refuse retraction — retiring one means removing it from
  the deployment. A type entry
  may carry `access: { inherits: <typeId> }` naming another declared
  type of the same plugin: the generic instance write transports
  authorize the type's records by the parent's grant (see
  [instances](../instances/README.md)). Publishing rides
  `POST /api/plugins/catalog` (operator token) and retracting rides
  `DELETE /api/plugins/catalog/:pluginId` (the same token; refused while
  any organization still holds an install — installed pins are snapshots
  and keep working, but a retracted-under-installs listing would strand
  them without an upgrade path) — the
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
  endpoint-mode services. The snapshot carries the full declaration
  layer — types, editors, surfaces, previews, attachment kinds,
  conversions, constructions, starter constructs, exports.
- **Composition**: installed declarations are a resolution source
  between the framework declarations and the org-authored overlay
  (`compileRegistryForOrganization` in
  [cts-types](../cts-types/README.md)); plugin types serve as
  `scope: 'system'` in the org view, and the generic instance machinery
  resolves them per call (`declarationFor` in
  [instances](../instances/README.md)) with the same cache and
  invalidation. Plugin types never copy into the org-authored store —
  `constructions` binds the plugin's own types' construction modes to
  plugin services (the instance machinery dispatches them, see
  [instances](../instances/README.md)); `exports` binds attachment
  exports — the `(typeId, kind) → service` pairs are the whole export
  truth: `generateAttachment` resolves a binding only by exact
  `(sourceType, kind)` match, and the hydration payload carries the
  bindings (`process.exports`) so the surfaces derive export affordances
  with no authored action nodes (SPEC §Exports are declarations).
  Installed construction contracts merge into the
  projected domain's construction table
  (`projectedDomainsForOrganization`).
- **Connector services**: a listing may declare `services` —
  `{ id (slug), label, signature: { input, output }, render, mode }` records
  in the SPEC §8 V grammar (`mode`: `endpoint` — the platform calls the
  configured URL with the service input and expects the service output as
  JSON, the nesting-worker shape, 60 s budget, optional
  `authorization: Bearer <key>` from the install's `authToken`; or `claim`,
  the default — the executor polls the worker protocol). Installs snapshot
  them beside the types and mint a `connectorToken`; the Connection settings
  (`GET`/`POST .../plugins/:pluginId/settings`) store per-service
  `endpoints`, the executor API key, and — for plugins that declare
  surfaces but no endpoint services — the `surfaceOrigin` the module
  proxy loads modules from (owner decision 2026-10-17). Installed services compose into the
  projected domain's service list (`projectedServicesForOrganization` — the one
  list the designer, compiler, and admin domain route resolve), as species
  records whose id and command are the same plugin-qualified id
  `plugin.<pluginId>.<serviceId>`; they obey the same active-process
  service gating. Palette law (SPEC §20 — the palette is
  operations, never an implementation-mechanism catalog): only wireable
  services compose — a signature input of `record` projects data sockets
  (the s-species port projection maps record fields only); a bare-value
  input (`json`, `list`, …) names an implementation executor that a graph
  could never feed, so it stays out of the palette and the operator
  domain while remaining fully dispatchable through its construction,
  conversion, or export binding and the connector path. Executing one
  dispatches by mode:
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
- **Service-resolved projections** (SPEC §8 p extract): a listing's type
  projections may resolve through a declared plugin service
  (`resolve: { service: 'plugin.<id>.<svc>' }`) — endpoint mode only, a
  projection is a synchronous read and cannot park on the claim queue (the
  SDK contract refuses the rest, including `handler` resolves, which only
  endpoint executors bind). The platform reads the target instance and its
  payload and dispatches `{ typeId, payloadBase64 }` to the service; the
  service's JSON response is the projection value (`resolveProjectionValue`
  here; the process runtime's `projectEntity` calls it). Pure compute over
  values — the DXF-extraction shape; the platform carries no plugin code.
- **Starter constructs**: a listing may declare `starterConstructs`
  (own file type, declared construction mode, one per type). Installs
  snapshot them, and the installing organization's initial process
  stations them (`starterConstructsForOrganization` here; a cross-install
  type collision is a composition error).
- **Install gate**: trial composition on the live org view — every
  plugin type id must be free (no system, installed, or org declaration
  holds it; the no-shadowing rule), each type must define cleanly, and
  the compile must introduce no new errors. A refused install writes
  nothing. Beside it: every `requires` entry names an installed plugin
  (owner decision 2026-10-17 — requires chains plugin-on-plugin), and an
  attachment-kind id must be unclaimed (other installs hold their kinds
  globally — collisions refuse). Editor bindings ride the listing contract (the bound type must
  be the plugin's own `file` type, one editor per type) and compose into
  the served type view beside the packs
  ([cts-types](../cts-types/README.md)). A declared surface module must
  target a mount-contract version the platform supports
  (`shared/plugin-surfaces.js` is the single supported-set home, read by
  this gate and the client loader) — an unsupported contract refuses the
  install and the upgrade, never a runtime half-mount (owner decision
  2026-10-11). Surface declarations snapshot with the install beside the
  editor bindings.
- **Surface module proxy**: plugin editor/preview modules execute in the
  browser, so they must load same-origin — the configured endpoints
  address the server's network (in dev the docker-internal executor
  host), which a browser can never reach. `GET
  /api/plugins/:pluginId/module/**` streams the path from the install's
  endpoint origin server-side (`fetchSurfaceModule` here; GET only, paths
  resolve strictly under the origin, `..` refused). Access mirrors the
  served type view: any member of an organization holding the install.
  Module responses are `no-store`: they are live executor artifacts, and
  the app-wide stale-while-revalidate rule must not delay an executor
  update past the next browser load. A JS module's declared
  dependencies (owner decision 2026-10-17) resolve to the plugin's own
  vendor scope: bare specifiers naming a declared dependency rewrite to
  same-origin proxied URLs; binary assets stream untouched. The served
  type view composes these
  same-origin URLs
  ([cts-types](../cts-types/README.md)); connection settings never reach
  the browser.
- **Dependency license gate**: a listing's declared runtime dependencies
  carry licenses; the install and upgrade gates refuse the GPL family
  by default (`PLUGIN_FORBIDDEN_LICENSES` narrows or widens the
  prefix-matched denylist, `none` disables) — the GPL-stays-out law as a
  refusal, not a review.
- **Surface styles**: a surface module composes with the host's utility
  classes, and those classes are compiled by the app's style build —
  which only sees sources in its tailwind content scan. In-repo surface
  modules (the demo's facade plugin) are scan members
  (tailwind.config.js `content` includes the surfaces tree; vendored
  runtimes are excluded); a surface shipped from outside the repo must
  limit itself to classes the host already compiles, or the host must
  add its sources to the scan.
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
  type, or live process definitions binding one, refuse the removal; so
  does another installed plugin whose `requires` names this one (uninstall
  the dependent first — the plugin-on-plugin mirror of the pack
  dependency gate). There is no abandon path; the org deletes or migrates
  first.
- Installs/uninstalls invalidate the instance-declaration cache,
  re-derive instance indexes, and publish the org contract-change event
  (`registry` origin) so open screens reconcile.

## Routes

| Route | Access | Action |
|---|---|---|
| `GET /api/plugins/catalog` | authenticated | List catalog listings (a private listing only for members of its owning orgs). |
| `GET /api/plugins/:pluginId/module/**` | member (org holding the install) | Surface module proxy: stream the module path from the install's endpoint origin (same-origin browser loading). |
| `POST /api/plugins/catalog` | platform operator (`x-operator-token`) | Publish/upsert a listing (validated by the SDK contract). |
| `DELETE /api/plugins/catalog/:pluginId` | platform operator (`x-operator-token`) | Retract a listing (refused while installs exist). |
| `GET /api/organizations/:id/plugins` | member (`organizations:read`) | List installed plugins. |
| `POST /api/organizations/:id/plugins` | `organizations:admin` | Install `{ pluginId }` at the catalog's current version. |
| `DELETE /api/organizations/:id/plugins/:pluginId` | `organizations:admin` | Uninstall (drain-gated). |
| `GET /api/organizations/:id/plugins/:pluginId/upgrade` | `organizations:admin` | Upgrade preview: additions, removals, §11 change plans, blockers. |
| `POST /api/organizations/:id/plugins/:pluginId/upgrade` | `organizations:admin` | Apply the upgrade (gated by the preview's blockers). |
| `GET /api/organizations/:id/plugins/:pluginId/connector` | `organizations:admin` | Connector panel data: token, claim queue, worker endpoints. |
| `POST /api/organizations/:id/plugins/:pluginId/connector/regenerate` | `organizations:admin` | Rotate the connector token. |
| `GET /api/organizations/:id/plugins/:pluginId/settings` | `organizations:admin` | Connection settings: per-service modes and endpoints, API key, surface origin. |
| `POST /api/organizations/:id/plugins/:pluginId/settings` | `organizations:admin` | Save connection settings (endpoints for endpoint-mode services, API key, surface origin for surface-bearing plugins). |

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
