# COMPONENT: Plugins (marketplace consumer side)

Plugin marketplace consumer contracts (SPEC §20): a
platform-published central catalog, per-organization installs pinning a
declaration snapshot, and the install/uninstall gates. A plugin is a versioned package of declarations, runtime modules, and
surfaces. Organization installs pin the package assets and execution
metadata; Perigram supplies browser Workers and managed server runtime
capacity. Provider-level integrations carry the external connector
protocol.

Parent: [server/features](../README.md).

## Contract

### Catalog

`plugin_catalog` holds one listing per `pluginId` —
`{ pluginId, name, description, version, visibility?, organizations?,
requires?, declarations: { types, services, editors, surfaces,
previews, constructions, exports, runtimes } }`.
Publishing is platform-operator-only. A listing may be
`visibility: 'private'` with owning `organizations` ids — the catalog
route serves it only to members of those orgs (the operator scopes
private listings). Built-in listings seed
from the deployment (`server/scripts/seed-plugin-catalog.js`, marked
`builtin`) and refuse retraction — retiring one means removing it from
the deployment. A type entry may carry `access: { inherits: <typeId> }`
naming another declared type of the same plugin: the generic instance
write transports authorize the type's records by the parent's grant
(see [instances](../instances/README.md)). Publishing rides
`POST /api/plugins/catalog` (operator token) and retracting rides
`DELETE /api/plugins/catalog/:pluginId` (the same token; refused while
any organization still holds an install — a retracted listing would
strand installed pins; the package assets go with it) — the
[@perigram/plugin-sdk](../../../packages/plugin-sdk/README.md) CLI
wraps it (`perigram-plugin publish`); the listing contract is validated
by the SDK's `parseListing`, the same parser the install gate runs.
A runtime package (SPEC §20) publishes its entry modules, surfaces, and
declared runtime assets beside the listing:
`PUT /api/plugins/catalog/:pluginId/assets/**?version=<v>` (the same
operator token, raw body, `Content-Type` stored with the asset) keys
each release asset as `pluginId/version/path` in the catalog's
`plugin_assets` GridFS bucket. Installing a release materializes its
assets into the installing organization's `org_plugin_assets` bucket,
keyed by `organizationId/pluginId/version/path`, with content hashes
pinned in the install's `packageAssets` manifest. The catalog copy is
distribution data; the installed copy is organization data.

### Installs

`plugin_installs` holds one per organization+plugin —
`{ organizationId, pluginId, name, version, declarations, services,
requires, executorOrigin, packageAssets, connectorToken, installedAt }`. The install
**snapshots** the listing's declarations: the pinned version is the
data, so catalog changes reach an installed organization only through
the explicit upgrade flow ([Upgrades](#upgrades)). Every install write
— route or onboarding — rides `installFromCatalog`, the gate-and-write
core: the route wrapper only adds caller authority, `executorOrigin`/
`surfaceOrigin` pre-wire provider-level connection settings under the
settings-save validation, and the deployment's built-in plugins install through the
seed scripts ([server/scripts/README.md](../../scripts/README.md))
writing the same record shape directly. The snapshot carries the full declaration layer — types, editors,
surfaces, previews, constructions, starter constructs, exports, runtime
declarations, and any transitional client engine declaration.

Install, upgrade, and uninstall mutations run inside the
organization change-sequence boundary. Each completed mutation invalidates
the instance-declaration cache, re-derives instance indexes, and publishes
the org contract-change event (`registry` origin) so open screens reconcile.

### Composition

Installed declarations are a resolution source between the framework
declarations and the org-authored overlay
(`compileRegistryForOrganization` in
[cts-types](../cts-types/README.md)); plugin types serve as
`scope: 'system'` in the org view, and the generic instance machinery
resolves them per call (`declarationFor` in
[instances](../instances/README.md)) with the same cache and
invalidation. `constructions` binds the plugin's own types'
construction modes to plugin services (the instance machinery
dispatches them, see [instances](../instances/README.md)); `exports`
binds attachment exports — the `(typeId, kind) → service` pairs are
the whole export truth: the bound service returns the exported file
through the executor payload contract (`payload: { base64, mime, name? }`,
[plugin-sdk](../../../packages/plugin-sdk/README.md)); the stored name is
the payload's own or `<instance name>.<kind>`. The `generateAttachment` command
([operations](./operations.js)) resolves a binding only by exact
`(sourceType, kind)` match, stores the exported file in the `files`
GridFS bucket, gates the run on write access to the source instance,
and returns the stored file reference; the hydration payload carries
the bindings (`process.exports`) so the surfaces derive export
affordances with no authored action nodes (SPEC §21).
Installed construction contracts merge into the projected domain's
construction table (`projectedDomainsForOrganization`).

### Service execution

Managed services declare `execution: { runtime, targets, kind,
capabilities, deterministic?, idempotent? }`. The install snapshot pins
the package runtime and operation contract. Server calls enqueue the shared
`plugin-runtime` task; the Deno worker loads the pinned organization
package into a restricted subprocess and requests host capabilities through
claim-bound routes.

The capability adapter in `capabilities.js` validates the installed version,
runtime target, operation declaration, and capability allowlist. It uses
authorized instance and file services. Browser calls use the authenticated
organization capability route and expose query, read, and file-read
capabilities. Server calls use the claimed task route and may invoke declared
writes. The server rehydrates the run actor from current membership and
grants before package delivery and capability calls. The instance-update
capability accepts an optional `expectedRevision` precondition and forwards
it to the generic instance compare-and-swap write boundary.

Remote service adapters currently retain a transitional endpoint mode and
claim mode. Endpoint-mode operations share one provider-level `executorOrigin`;
all operations POST to `<executorOrigin>` with `{ operationId, input }`. The install
never stores or derives a URL per function. Legacy install maps are collapsed on settings
save when every operation URL has the same provider base; divergent maps are
surfaced as a migration warning rather than silently guessed.
New external-system integrations must use provider-level connection records
with server-held credentials, per SPEC §20; the legacy endpoint adapter is a
migration bridge, not the target execution model.

Installed services compose into the projected domain's service list
(`projectedServicesForOrganization` — the one list the designer,
compiler, and admin domain route resolve), as species records whose id
and command are the same plugin-qualified id
`plugin.<pluginId>.<serviceId>`; they obey the same active-process
service gating. A service's palette section is its declared listing
`group` (a slug validated by the listing contract; absent falls to the
services tab), and the section renders in the designer palette's plugin
tier with pack provenance. The documents plugin's `table-data` section
carries the extraction trio beside the CSV composition. The same services compose
into the projected command
table (`projectedDomainsForOrganization`): a service's scalar signature
fields ride as the command's `input.parameters` — the inputs a run
dialog prompts, prefilled by an authored field `default`, and the
required-input availability check counts as promptable — while
structured fields (`list`/`record`) stay graph data sockets.

Palette law (SPEC §14 — the palette serves operations): only wireable
services compose — a signature input of `record` projects data sockets
(the s-species port projection maps record fields only); a bare-value
input (`json`, `list`, …) names an implementation executor the graph
cannot feed, so it stays out of the palette and the operator domain
while remaining fully dispatchable through its construction,
conversion, or export binding and the connector path.

Managed service execution dispatches through the platform scheduler.
Browser pure and read operations may preview in a Worker. Server tasks run
the pinned package and mediate each declared capability. Graph input
validation, read evidence, and transactional effect commits are tracked
in TODO. Endpoint and claim services use the external integration protocol.

A transitional endpoint service input field declared with base `blob` receives a
payload handle `{ fileId, mime, size, name? }` on the wire; the
endpoint dispatch hydrates the handle with its stored bytes as
`payloadBase64`, so the executor reaches no storage — the hydration is
declaration-driven (the service's signature names the field), and the
deterministic cache keys the raw handle beside it. A service declaring
`cache: 'deterministic'` (legacy endpoint-only,
validated by the listing contract) replays through the
`plugin_service_cache` collection first: the key hashes the service
identity, the installed version, and the canonical input (sorted keys
at every depth — structurally equal inputs hit), and a miss stores the
executor's response, so same-input executions never call the executor
twice (SPEC §28 artifact contract). The worker endpoints accept the
connector token scoped to
that queue only ([tasks](../../core/tasks/README.md)). Uninstall
deletes the install record, which revokes the token; admins rotate it
from the Plugins page's connector panel. Authoring and hosting
(including the executor implementations for both modes) is documented
in the [plugin SDK](../../../packages/plugin-sdk/README.md).

Built-in executor origins are deployment-owned: the documents/facade migration scripts persist `executorOrigin` and `platformManaged`, and the organization settings API refuses attempts to replace those origins or credentials. Third-party endpoint integrations remain configurable at provider scope.

### Service-resolved projections

SPEC §8 p extract: a listing's type projections may resolve through a
declared plugin service (`resolve: { service: 'plugin.<id>.<svc>' }`)
— transitional endpoint mode only, a projection is a synchronous read and cannot
park on the claim queue (the SDK contract refuses the rest, including
`handler` resolves, which only endpoint executors bind). The platform
reads the target instance and dispatches `{ typeId, instanceId, fields,
payloadBase64? }` to the service — the instance's §3 field values and,
when it carries one, its payload as base64; the service's JSON response
is the projection value (`resolveProjectionValue` here; the process
runtime's `projectEntity` calls it). Pure compute over values — the
platform carries no plugin code.

### Starter constructs

A listing may declare `starterConstructs` (own file type, declared
construction mode, one per type). Installs snapshot them, and the
installing organization's initial process stations them
(`starterConstructsForOrganization` here; a cross-install type
collision is a composition error).

### Install gate

Trial composition on the live org view — every plugin type id must be
free (no system, installed, or org declaration holds it; the
no-shadowing rule), each type must define cleanly, and the compile must
introduce no new errors. A refused install writes nothing. Beside it:
every `requires` entry names an installed plugin (requires chains
plugin-on-plugin), and an attachment-kind
id must be unclaimed (other installs hold their kinds globally —
collisions refuse). Editor bindings ride the listing contract (the
bound type must be the plugin's own `file` type, one editor per type)
and compose into the served type view beside the packs
([cts-types](../cts-types/README.md)). A declared surface module must
target a mount-contract version the platform supports
(`shared/plugin-surfaces.js` is the single supported-set home, read by
this gate and the client loader) — an unsupported contract refuses the
install and the upgrade at the gate.
Surface declarations snapshot with the install beside the editor
bindings.

### Surface module proxy

Plugin editor/preview modules execute in the browser, and the
configured endpoints address the server's network (in dev the
docker-internal executor host), so the modules load same-origin through
the proxy: `GET /api/plugins/:pluginId/module/**` streams the path from
the install's endpoint origin server-side (`fetchSurfaceModule` here;
GET only, paths resolve strictly under the origin, `..` refused).
An install that declares the client engine serves every module path
from the platform-stored package assets of its pinned version — the
install carries no origin, and a path the package does not carry
answers 404. Access mirrors the served type view: any member of an
organization
holding the install. Every module load revalidates against the
executor: responses carry `private, no-cache` and an `ETag`, and an
unchanged body answers `304` — an executor update still reaches the
next browser load. A JS module's declared dependencies resolve to the
plugin's own vendor scope: bare specifiers naming a declared dependency
rewrite to same-origin proxied URLs; a dependency module of the form
`plugin:<id><path>` rewrites to the required plugin's proxied scope
(`<id>` must appear in the listing's `requires`); binary assets stream
untouched.
The served type view composes these same-origin URLs
([cts-types](../cts-types/README.md)); connection settings stay
server-side.

### Dependency license gate

A listing's declared runtime dependencies carry licenses; the install
and upgrade gates refuse the GPL family by default
(`PLUGIN_FORBIDDEN_LICENSES` narrows or widens the prefix-matched
denylist, `none` disables) — the GPL-stays-out law enforced as a
refusal.

### Surface styles

A surface module composes with the host's utility classes, and those
classes are compiled by the app's style build — which only sees sources
in its tailwind content scan. In-repo surface modules (the demo's
facade plugin) are scan members (tailwind.config.js `content` includes
the surfaces tree; vendored runtimes are excluded); a surface shipped
from outside the repo must limit itself to classes the host already
compiles, or the host must add its sources to the scan.

### Upgrades

Pins move only through an explicit diff-plus-migration apply
(`GET`/`POST /api/organizations/:id/plugins/:pluginId/upgrade`). The
preview runs the SPEC §11 planner over every changed type
(`planTypeMigration`): additions list as such, removals drain-gate like
uninstall, uncovered breaking changes on types with live instances
block the apply (zero-instance types re-break freely, mirroring org
authoring relief), and covered steps — declared on the new
declaration's transient `migrate` — execute against instances on
apply. A type rename is a covered migration: the new declaration's
transient `renameFrom: <retired id>` reports the rename in the preview
and the apply rewrites the org's stored instances, typed refs, and
authored type bindings to the new id before the per-type steps run — a
renamed type with data migrates where a removed type would drain-gate.
The apply re-checks the install-gate laws against the world as
it is (required packs still enabled, attachment kinds still claimable),
trial-composes the org view without the plugin's old layer
(`compileRegistryForOrganization`'s `excludePluginId`) so a refused
upgrade writes nothing; the persisted pin carries the extended
declaration layer (editors, attachment kinds, conversions, requires)
beside the types and leaves `migrate` on the transient declaration.
Services replace with the snapshot; the connector token survives.

### Uninstall gate (block until drained)

Live instances of any plugin type, or live process definitions binding
one, refuse the removal — the org deletes or migrates the data first.
Beside the gate: an installed plugin whose `requires` names the target
rides the removal — the preview (`uninstallPreview`, served at
`GET .../plugins/:pluginId/uninstall-preview`) lists the dependants and
the blocking data for the confirm dialog, and the delete accepts
`?cascade=1` to remove them together (all-or-nothing: any live data in
the cascade refuses the whole removal).

## Routes

| Route | Access | Action |
|---|---|---|
| `GET /api/plugins/catalog` | authenticated | List catalog listings (a private listing only for members of its owning orgs). |
| `GET /api/plugins/:pluginId/module/**` | member (org holding the install) | Surface module proxy: stream the module path from the install's endpoint origin, or from the installing organization's materialized package for a packaged install (the catalog copy remains a migration fallback for pre-materialization pins) (same-origin browser loading). |
| `PUT /api/plugins/catalog/:pluginId/assets/**?version=` | operator token | Store one client-carried package asset (`pluginId/version/path`) for the module proxy to serve. |
| `POST /api/plugins/catalog` | platform operator (`x-operator-token`) | Publish/upsert a listing (validated by the SDK contract). |
| `DELETE /api/plugins/catalog/:pluginId` | platform operator (`x-operator-token`) | Retract a listing (refused while installs exist). |
| `GET /api/organizations/:id/plugins` | member (`organizations:read`) | List installed plugins. |
| `POST /api/organizations/:id/plugins` | `organizations:admin` | Install `{ pluginId }` at the catalog's current version. |
| `GET /api/organizations/:id/plugins/:pluginId/uninstall-preview` | `organizations:admin` | Uninstall impact: dependants that ride a cascade, live data that blocks it. |
| `DELETE /api/organizations/:id/plugins/:pluginId` | `organizations:admin` | Uninstall (drain-gated; `?cascade=1` removes dependants together). |
| `GET /api/organizations/:id/plugins/:pluginId/upgrade` | `organizations:admin` | Upgrade preview: additions, removals, §11 change plans, blockers. |
| `POST /api/organizations/:id/plugins/:pluginId/upgrade` | `organizations:admin` | Apply the upgrade (gated by the preview's blockers). |
| `GET /api/organizations/:id/plugins/:pluginId/connector` | `organizations:admin` | Connector panel data: token, claim queue, worker endpoints. |
| `POST /api/organizations/:id/plugins/:pluginId/connector/regenerate` | `organizations:admin` | Rotate the connector token. |
| `GET /api/organizations/:id/plugins/:pluginId/settings` | `organizations:admin` | Connection settings: one provider executor origin, provider credential, and optional legacy surface origin. |
| `POST /api/organizations/:id/plugins/:pluginId/settings` | `organizations:admin` | Save the provider-level executor origin and credential, plus the optional surface origin for legacy external surfaces. |

The organization UI is the Plugins section in org settings
([pages/organization](../../../pages/organization/README.md)):
installed plugins and the central catalog.

## Related

- [server/features/README.md](../README.md) — feature classification.
- [cts-types](../cts-types/README.md) — org view composition.
- [instances](../instances/README.md) — per-call declaration resolution.
- [Plugin SDK](../../../packages/plugin-sdk/README.md) — authoring loop,
  surface mount contracts, CLI.
