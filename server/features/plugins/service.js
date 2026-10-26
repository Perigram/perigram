// Plugin marketplace consumer side (SPEC §Plugin marketplace): central
// catalog listings, per-org installs pinning a declaration snapshot, and
// the install/uninstall gates. Installed declarations are a resolution
// source in the org view (the plugins repository composes into
// compileRegistryForOrganization) — plugin types never copy into the
// org-authored store, so plugin ownership stays clean for upgrades.
//
// Slice 1 carries declaration payloads only: connectors (worker-protocol
// executors), upgrades, and cross-org execution are later slices.
import { createError } from 'h3';
import { randomBytes } from 'node:crypto';
import * as repository from './repository.js';
import { compileRegistryForOrganization } from '../cts-types/service.js';
import { instanceServiceResolver, invalidateInstanceDeclarations } from '../instances/service.js';
import { ensureInstanceIndexes } from '../instances/indexes.js';
import { countInstancesOfType } from '../instances/count.js';
import { applyTypeMigrationSteps } from '../instances/migrations.js';
import { planTypeMigration } from '~/packages/cts/src/index.js';
import { findTypeReferences } from '../process-definitions/service.js';
import { publishOrgContractChanged } from '../instance-events/service.js';
import { hasPermission } from '../../utils/auth-helpers.js';
import { enqueueTask } from '../../core/tasks/service.js';
import * as filesService from '../files/service.js';
import { parseListing, normalizeListing } from '#packages/plugin-sdk/src/listing.js';
import { isSupportedSurfaceContract, endpointOriginOf } from '#shared/plugin-surfaces.js';

// Connector command ids: plugin.<pluginId>.<serviceId>; the install's
// claim queue is plugin.<pluginId>@<organizationId>.
const PLUGIN_COMMAND_PATTERN = /^plugin\.([a-z0-9-]+)\.([a-z0-9-]+)$/;

export async function listCatalog({ auth = {} } = {}) {
  const listings = await repository.listCatalog();
  // A private listing is served only to its owning organizations (the
  // operator scopes them at publish — the catalog stays
  // platform-published). Visibility is membership of any owning org.
  const orgIds = new Set(
    (auth.memberships || []).map(membership => String(membership?.organizationId)).filter(Boolean)
  );
  if (auth.organizationId) orgIds.add(String(auth.organizationId));
  return listings
    .filter(listing => listing.visibility !== 'private'
      || (listing.organizations || []).some(orgId => orgIds.has(String(orgId))))
    .map(serializeListing);
}

// Platform-side publishing (the publish API's body): one parser with the
// install gate — @perigram/plugin-sdk's listing contract — and the
// normalized catalog document the install snapshots.
export async function publishListing(listing = {}) {
  const normalized = normalizeListing(listing);
  await repository.upsertCatalogListing({ ...normalized, publishedAt: new Date() });
  return serializeListing(normalized);
}

// Retract a catalog listing (operator action): installed organizations
// keep their pinned snapshots, but the listing leaves the Available
// panel and no new install can target it. Refuses while any
// organization still holds an install — retracting under live installs
// would strand them without an upgrade path (the same drain law as
// uninstall).
export async function retractListing(pluginId = '') {
  const listing = await repository.findCatalogByPluginId(pluginId);
  if (!listing) throw createError({ statusCode: 404, message: 'Plugin not found' });
  if (listing.builtin) {
    throw createError({
      statusCode: 409,
      message: 'Built-in listings are deployment-published — remove the plugin from the deployment to retire it'
    });
  }
  const installs = await repository.countInstallsByPluginId(pluginId);
  if (installs > 0) {
    throw createError({
      statusCode: 409,
      message: `Plugin is still installed by ${installs} organization${installs === 1 ? '' : 's'} — uninstall everywhere before retracting the listing`
    });
  }
  await repository.deleteCatalogListing(pluginId);
  return { pluginId: String(pluginId), retracted: true };
}

export async function listInstalled({ organizationId, auth = {} }) {
  assertSameOrganization(organizationId, auth);
  assertOrganizationPermission(auth, 'read');
  const installs = await repository.listInstallsByOrganization(organizationId);
  return Promise.all(installs.map(async install => ({
    ...serializeInstall(install),
    availableVersion: await availableVersionFor(install)
  })));
}

async function availableVersionFor(install) {
  const listing = await repository.findCatalogByPluginId(install.pluginId).catch(() => null);
  return listing && listing.version !== install.version ? listing.version : null;
}

export async function install({ organizationId, pluginId, auth = {} }) {
  assertSameOrganization(organizationId, auth);
  assertOrganizationPermission(auth, 'admin');
  return installFromCatalog({ organizationId, pluginId });
}

// The gate-and-write core behind the install route: the wrapper above
// owns caller authority. `endpoints` pre-wires connection settings for
// endpoint-mode services under the same validation the settings save
// applies.
export async function installFromCatalog({ organizationId, pluginId, endpoints = {}, surfaceOrigin = null }) {
  const listing = await repository.findCatalogByPluginId(pluginId);
  if (!listing) throw createError({ statusCode: 404, message: 'Plugin not found' });
  if (await repository.findInstall(organizationId, pluginId)) {
    throw createError({ statusCode: 409, message: 'Plugin already installed' });
  }
  const layer = parseListingOr400(listing);
  const { types, services, editors, constructions, starterConstructs, dependencies, exports: exportBindings, surfaces, requires } = layer;
  assertInstallableDependencies(dependencies);
  // Surface modules target a mount-contract major; an unsupported one
  // refuses at the gate — never a runtime half-mount (SPEC §Plugin
  // marketplace, owner decision 2026-10-11).
  for (const surface of surfaces) {
    if (!isSupportedSurfaceContract(surface.surfaceContract)) {
      throw createError({
        statusCode: 400,
        message: `Surface ${surface.id} targets contract version ${surface.surfaceContract}, which this platform does not support`
      });
    }
  }
  // The plugin's requirements must be satisfied by installs (owner
  // decision 2026-10-17: requires chains plugin-on-plugin; the packs
  // retired). A missing requirement would strand the plugin's types.
  const installedPlugins = await repository.listInstallsByOrganization(organizationId);
  const installedPluginIds = new Set(installedPlugins.map(install => String(install.pluginId)));
  for (const requirementId of requires) {
    if (!installedPluginIds.has(requirementId)) {
      throw createError({ statusCode: 400, message: `Plugin requires plugin ${requirementId}, which is not installed — install it first` });
    }
  }
  // Trial composition on the live org view: every plugin type must define
  // cleanly (no shadowing of system, installed, or org ids) and introduce
  // no compile errors. A refused install touches nothing.
  const registry = await compileRegistryForOrganization(organizationId);
  const baseline = registry.compile(organizationId);
  const baselineErrors = new Set(baseline.ok ? [] : baseline.errors);
  for (const type of types) {
    // Explicit collision gate: defineType keys org and system types
    // separately, so an id clash with the org overlay would only explode
    // later in resolveView — refuse it here, loudly, before any write.
    if (registry.getType(type.id, organizationId)) {
      throw createError({
        statusCode: 400,
        message: `Plugin type ${type.id} is not installable: type id already declared in this organization`
      });
    }
    try {
      registry.defineType(type);
    } catch (error) {
      throw createError({
        statusCode: 400,
        message: `Plugin type ${type.id} is not installable: ${error?.message || error}`
      });
    }
  }
  const compiled = registry.compile(organizationId);
  const introduced = (compiled.errors || []).filter(error => !baselineErrors.has(error));
  if (introduced.length) {
    throw createError({ statusCode: 400, message: introduced.join('; ') });
  }

  const configuredEndpoints = configuredEndpointsFor(services, endpoints);
  const configuredSurfaceOrigin = configuredSurfaceOriginFor(surfaces, surfaceOrigin);
  await repository.createInstall({
    organizationId: String(organizationId),
    pluginId: String(listing.pluginId),
    name: listing.name || listing.pluginId,
    version: listing.version || '1',
    declarations: { types, editors, constructions, starterConstructs, dependencies, exports: exportBindings, surfaces, previews: layer.previews },
    services,
    requires,
    endpoints: configuredEndpoints,
    ...(configuredSurfaceOrigin ? { surfaceOrigin: configuredSurfaceOrigin } : {}),
    connectorToken: mintConnectorToken()
  });
  invalidateInstanceDeclarations(String(organizationId));
  await ensureInstanceIndexes(registry.resolveView(organizationId));
  publishOrgContractChanged(String(organizationId), 'registry', {
    pluginId: String(listing.pluginId),
    installed: true
  });
  return {
    pluginId: String(listing.pluginId),
    name: listing.name || listing.pluginId,
    version: listing.version || '1',
    types: types.map(typeSummary),
    services: services.map(serviceSummary)
  };
}

// The uninstall impact (owner direction 2026-10-17: deletion warns about
// what stops working, or removes the dependants): transitive installed
// dependants (their requires chain names the target) and the live data
// that blocks removal under the drain law.
async function uninstallImpact(organizationId, install) {
  const pluginId = String(install.pluginId);
  const others = await repository.listInstallsByOrganization(organizationId);
  const installs = [install, ...others.filter(entry => String(entry.pluginId) !== pluginId)];
  const removing = new Set([pluginId]);
  const dependants = [];
  let grew = true;
  while (grew) {
    grew = false;
    for (const candidate of installs) {
      if (removing.has(String(candidate.pluginId))) continue;
      if ((candidate.requires || []).some(id => removing.has(String(id)))) {
        removing.add(String(candidate.pluginId));
        dependants.push({ pluginId: candidate.pluginId, name: candidate.name || candidate.pluginId, version: candidate.version || '1' });
        grew = true;
      }
    }
  }
  const blocked = [];
  for (const target of installs) {
    if (!removing.has(String(target.pluginId))) continue;
    for (const type of target.declarations?.types || []) {
      const [instances, boundBy] = await Promise.all([
        countInstancesOfType(type.id, organizationId),
        findTypeReferences(organizationId, type.id)
      ]);
      if (instances > 0 || boundBy.length) {
        blocked.push({
          pluginId: String(target.pluginId),
          typeId: type.id,
          instances,
          boundBy: boundBy.map(binding => binding.name || binding.id)
        });
      }
    }
  }
  return { removing: [...removing], dependants, blocked };
}

// The preview behind the confirm dialog: what an uninstall removes
// (beside the target) and what live data blocks it.
export async function uninstallPreview({ organizationId, pluginId, auth = {} }) {
  assertSameOrganization(organizationId, auth);
  assertOrganizationPermission(auth, 'admin');
  const install = await repository.findInstall(organizationId, pluginId);
  if (!install) throw createError({ statusCode: 404, message: 'Plugin is not installed' });
  return { pluginId: String(pluginId), ...(await uninstallImpact(organizationId, install)) };
}

// Block until drained: live data of any removing type refuses the
// uninstall (no abandon path — the org deletes or migrates first).
// Dependents ride the removal when `cascade` is set (the preview's
// dependants list is the consent surface); without it, a depended-on
// plugin refuses naming its dependant.
export async function uninstall({ organizationId, pluginId, cascade = false, auth = {} }) {
  assertSameOrganization(organizationId, auth);
  assertOrganizationPermission(auth, 'admin');

  const install = await repository.findInstall(organizationId, pluginId);
  if (!install) throw createError({ statusCode: 404, message: 'Plugin is not installed' });
  const { removing, dependants, blocked } = await uninstallImpact(organizationId, install);
  if (dependants.length && !cascade) {
    throw createError({
      statusCode: 409,
      message: `Plugin ${pluginId} is required by installed plugin ${dependants[0].pluginId} — remove them together (the confirm dialog offers it) or uninstall the dependant first`,
      data: { dependants }
    });
  }
  if (blocked.length) {
    const detail = blocked.map(entry =>
      entry.instances > 0
        ? `${entry.typeId}: ${entry.instances} instance(s)`
        : `${entry.typeId}: bound by ${entry.boundBy.join(', ')}`
    ).join('; ');
    throw createError({
      statusCode: 409,
      message: `Plugin types still have live data (${detail}) — delete or migrate it first`,
      data: { blocked }
    });
  }

  for (const id of removing) {
    await repository.deleteInstall(organizationId, id);
  }
  invalidateInstanceDeclarations(String(organizationId));
  const after = await compileRegistryForOrganization(organizationId);
  await ensureInstanceIndexes(after.resolveView(organizationId));
  publishOrgContractChanged(String(organizationId), 'registry', {
    pluginId: String(pluginId),
    removed: true,
    ...(removing.length > 1 ? { cascadeRemoved: removing.filter(id => id !== String(pluginId)) } : {})
  });
  return { removed: true, cascadeRemoved: removing.filter(id => id !== String(pluginId)) };
}

function serializeListing(listing = {}) {
  return {
    pluginId: listing.pluginId,
    name: listing.name || listing.pluginId,
    description: listing.description || '',
    version: listing.version || '1',
    requires: listing.requires || [],
    visibility: listing.visibility === 'private' ? 'private' : 'public',
    types: (listing.declarations?.types || []).map(typeSummary),
    services: (listing.declarations?.services || []).map(serviceSummary),
    editors: (listing.declarations?.editors || []).map(editor => ({ type: editor.type, surface: editor.surface }))
  };
}

function serializeInstall(install = {}) {
  return {
    pluginId: install.pluginId,
    name: install.name || install.pluginId,
    version: install.version || '1',
    installedAt: install.installedAt,
    requires: install.requires || [],
    types: (install.declarations?.types || []).map(typeSummary),
    services: (install.services || []).map(serviceSummary)
  };
}

function typeSummary(type = {}) {
  return { id: type.id, name: type.name || null, class: type.class || null };
}

function serviceSummary(service = {}) {
  return { id: service.id, label: service.render?.label || service.label || service.id, mode: serviceModeOf(service) };
}

function mintConnectorToken() {
  return randomBytes(24).toString('base64url');
}

// --- Connector services (marketplace SPEC: services execute on external
// executors — endpoint mode calls a configured URL (the nesting-worker
// shape: self-hosted or cloud-hosted), claim mode polls the worker
// protocol) ---

export function serviceModeOf(service = {}) {
  return service.mode === 'endpoint' ? 'endpoint' : 'claim';
}

// Declared runtime dependencies (owner decision 2026-10-17): the license
// policy half of the gate — the GPL-stays-out law is a refusal, not a
// review. The denylist is prefix-matched (case-insensitive), so
// `GPL-3.0-or-later` and `AGPL-3.0` both fall; operators narrow or widen
// it with PLUGIN_FORBIDDEN_LICENSES (comma-separated, `none` disables).
const DEFAULT_FORBIDDEN_LICENSES = ['GPL', 'AGPL'];

function forbiddenLicensePatterns() {
  const raw = process.env.PLUGIN_FORBIDDEN_LICENSES !== undefined
    ? process.env.PLUGIN_FORBIDDEN_LICENSES
    : DEFAULT_FORBIDDEN_LICENSES.join(',');
  return raw.split(',').map(pattern => pattern.trim()).filter(Boolean).map(pattern => pattern.toLowerCase());
}

function assertInstallableDependencies(dependencies = []) {
  const patterns = forbiddenLicensePatterns();
  for (const dependency of dependencies) {
    const license = String(dependency.license || '').toLowerCase();
    if (patterns.some(pattern => license.startsWith(pattern))) {
      throw createError({
        statusCode: 400,
        message: `Dependency ${dependency.name}@${dependency.version} is ${dependency.license} — the deployment's plugin license policy forbids it`
      });
    }
  }
}

// The plugin's connection settings: per-service endpoints for
// endpoint-mode services, and the API key sent to the publisher's
// executor when calling them.
// The plugin-module proxy core (the README's surface module proxy
// contract): resolves the caller's install and streams the module path
// from its endpoint origin. Browsers load plugin modules same-origin
// through the route wrapper — never the server-network origin.
export async function fetchSurfaceModule({ organizationId, pluginId, modulePath = '', auth = {} }) {
  assertSameOrganization(organizationId, auth);
  const install = await repository.findInstall(organizationId, pluginId);
  if (!install) throw createError({ statusCode: 404, message: 'Plugin not installed' });
  const origin = endpointOriginOf(install);
  if (!origin) throw createError({ statusCode: 503, message: `Plugin ${pluginId} has no connected executor endpoint` });
  const segments = String(modulePath || '').split('/')
    .map(segment => { try { return decodeURIComponent(segment); } catch { return null; } })
    .filter(Boolean);
  if (!segments.length || segments.some(segment => segment === '.' || segment === '..' || /[\\/]/.test(segment))) {
    throw createError({ statusCode: 400, message: 'Invalid module path' });
  }
  const url = `${origin}/${segments.map(encodeURIComponent).join('/')}`;
  let response;
  try {
    response = await fetch(url, { headers: { accept: '*/*' } });
  } catch (error) {
    throw createError({ statusCode: 502, message: `Plugin ${pluginId} executor did not serve the module (${error?.message || 'unreachable'})` });
  }
  if (!response.ok) {
    throw createError({ statusCode: 502, message: `Plugin ${pluginId} executor did not serve the module (${response.status})` });
  }
  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const isJsModule = /\.[cm]?js$/.test(segments[segments.length - 1] || '');
  // A JS module's declared dependencies (owner decision 2026-10-17)
  // resolve to the plugin's own vendor scope: bare specifiers rewrite to
  // same-origin proxied URLs, so a surface imports `three` and the
  // browser loads it from this route. Binary assets stream untouched.
  if (isJsModule) {
    const source = await response.text();
    const rewritten = rewriteDeclaredImports(source, pluginId, install.declarations?.dependencies || []);
    return { contentType, body: Buffer.from(rewritten, 'utf8') };
  }
  return {
    contentType,
    body: Buffer.from(await response.arrayBuffer())
  };
}

function rewriteDeclaredImports(source, pluginId, dependencies = []) {
  if (!dependencies.length) return source;
  const targets = new Map(dependencies.map(dependency => [
    dependency.name,
    `/api/plugins/${encodeURIComponent(pluginId)}/module${dependency.module}`
  ]));
  return source.replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"]+)\2/g, (whole, prefix, quote, specifier) => {
    const target = targets.get(specifier);
    return target ? `${prefix}${quote}${target}${quote}` : whole;
  });
}

export async function settingsFor({ organizationId, pluginId, auth = {} }) {
  assertSameOrganization(organizationId, auth);
  assertOrganizationPermission(auth, 'admin');
  const install = await repository.findInstall(organizationId, pluginId);
  if (!install) throw createError({ statusCode: 404, message: 'Plugin is not installed' });
  const endpoints = install.endpoints || {};
  return {
    pluginId: install.pluginId,
    authToken: install.authToken || null,
    surfaceOrigin: install.surfaceOrigin || null,
    surfaces: (install.declarations?.surfaces || []).length > 0,
    services: (install.services || []).map(service => ({
      id: service.id,
      label: serviceSummary(service).label,
      mode: serviceModeOf(service),
      endpoint: endpoints[service.id] || null
    }))
  };
}

// Endpoint settings validation, one home: unknown services, claim-mode
// services, and non-http(s) URLs refuse.
function configuredEndpointsFor(services = [], endpoints = {}) {
  const serviceById = new Map((services || []).map(service => [service.id, service]));
  const configured = {};
  for (const [serviceId, url] of Object.entries(endpoints || {})) {
    const service = serviceById.get(serviceId);
    if (!service) {
      throw createError({ statusCode: 400, message: `Unknown service ${serviceId}` });
    }
    if (serviceModeOf(service) !== 'endpoint') {
      throw createError({ statusCode: 400, message: `Service ${serviceId} executes through the worker claim protocol — no endpoint applies` });
    }
    if (url) {
      const parsed = String(url);
      if (!/^https?:\/\//.test(parsed)) {
        throw createError({ statusCode: 400, message: `Endpoint for ${serviceId} must be an http(s) URL` });
      }
      configured[serviceId] = parsed;
    }
  }
  return configured;
}

// The surface origin (owner decision 2026-10-17): executors with
// surfaces but no endpoint services still need a reachable origin for
// the module proxy. Only a plugin that declares surfaces may carry one.
function configuredSurfaceOriginFor(surfaces = [], surfaceOrigin = null) {
  if (!surfaceOrigin) return null;
  if (!surfaces?.length) {
    throw createError({ statusCode: 400, message: 'The plugin declares no surface modules — a surface origin does not apply' });
  }
  const parsed = String(surfaceOrigin);
  if (!/^https?:\/\//.test(parsed)) {
    throw createError({ statusCode: 400, message: 'The surface origin must be an http(s) URL' });
  }
  return parsed;
}

export async function updateSettings({ organizationId, pluginId, endpoints = {}, authToken = null, surfaceOrigin = undefined, auth = {} }) {
  assertSameOrganization(organizationId, auth);
  assertOrganizationPermission(auth, 'admin');
  const install = await repository.findInstall(organizationId, pluginId);
  if (!install) throw createError({ statusCode: 404, message: 'Plugin is not installed' });
  const configured = configuredEndpointsFor(install.services, endpoints);
  const configuredSurfaceOrigin = surfaceOrigin === undefined
    ? (install.surfaceOrigin || null)
    : configuredSurfaceOriginFor(install.declarations?.surfaces || [], surfaceOrigin);
  await repository.updateSettings(organizationId, pluginId, {
    endpoints: configured,
    authToken: authToken ? String(authToken) : null,
    surfaceOrigin: configuredSurfaceOrigin
  });
  return settingsFor({ organizationId, pluginId, auth });
}

// Service-species records for the projected domain: the palette,
// compiler, and designer treat them exactly like pack services. The
// command id and service id are the same plugin-qualified id.
//
// Palette law (SPEC §20, "the palette is operations, never an
// implementation-mechanism catalog"): only wireable services compose —
// a service whose signature input is a bare value (json, list, …)
// projects no data sockets (the s-species port projection maps record
// fields only), so its node could never be fed from a graph. Such
// services are implementation executors (construction/conversion/export
// bindings dispatch them by service ref) and stay off the palette.
function wireableValueService(service = {}) {
  const input = service.signature?.input;
  return !input || input.base === 'record';
}

export async function servicesForOrganization(organizationId) {
  const installs = await repository.listInstallsByOrganization(organizationId);
  const services = [];
  for (const install of installs) {
    for (const service of install.services || []) {
      if (!wireableValueService(service)) continue;
      const id = `plugin.${install.pluginId}.${service.id}`;
      services.push({
        id,
        species: 'service',
        command: id,
        group: install.name || install.pluginId,
        signature: service.signature,
        render: service.render || { label: service.label || service.id }
      });
    }
  }
  return services;
}

// The one service list the projected-domain consumers resolve: mounted
// pack services plus the organization's installed plugin services —
// disabled packs contribute nothing.
export async function projectedServicesForOrganization(organizationId) {
  return await servicesForOrganization(organizationId);
}

// The projected-domain pack slices for an organization: enabled packs,
// with installed plugins' construction contracts merged beside them (the
// listing's service-backed constructions are the plugin layer of the same
// domain vocabulary).
export async function projectedDomainsForOrganization(organizationId) {
  const merged = { commands: {}, construction: {}, events: [], serviceContracts: {} };
  const installs = organizationId ? await repository.listInstallsByOrganization(organizationId) : [];
  for (const install of installs) {
    for (const [typeId, modes] of Object.entries(install.declarations?.constructions || {})) {
      if (!modes || typeof modes !== 'object') continue;
      if (merged.construction[typeId]) {
        throw createError({ statusCode: 500, message: `construction contracts for type ${typeId} declared by both a pack and installed plugin ${install.pluginId}` });
      }
      merged.construction[typeId] = { modes: Object.keys(modes) };
    }
    // Plugin value services are commands: `plugin.<x>.<y>` executes
    // through the connector path (the compiler's command table and the
    // command runtime agree on this shape). Scalar signature fields are
    // the command's prompted parameters; structured fields stay graph
    // data sockets.
    for (const service of install.services || []) {
      if (!service?.id) continue;
      const commandId = `plugin.${install.pluginId}.${service.id}`;
      merged.commands[commandId] = {
        id: commandId,
        service: `plugin.${install.pluginId}`,
        action: 'run',
        plugin: true,
        input: { parameters: serviceParameters(service.signature) }
      };
    }
  }
  return merged;
}

const PARAMETER_BASES = Object.freeze({
  string: 'string',
  id: 'string',
  quantity: 'number',
  number: 'number',
  boolean: 'boolean',
  enum: 'enum',
  dateTime: 'dateTime'
});

function serviceParameters(signature = {}) {
  const fields = signature?.input?.base === 'record' ? signature.input.fields || {} : {};
  return Object.entries(fields).flatMap(([name, descriptor = {}]) => {
    const type = PARAMETER_BASES[descriptor.base];
    if (!type) return [];
    return [{
      name,
      label: name,
      type,
      ...(type === 'number' && descriptor.unit ? { unit: descriptor.unit } : {}),
      ...(Array.isArray(descriptor.options) ? { options: descriptor.options } : {}),
      required: descriptor.nullable !== true,
      ...(Object.hasOwn(descriptor, 'default') ? { default: descriptor.default } : {})
    }];
  });
}

// Service-backed construction bindings (installed plugins): typeId ->
// mode -> plugin-qualified service ref. The instance machinery dispatches
// constructions with no registered handler through these.
export async function constructionsForOrganization(organizationId) {
  const installs = organizationId ? await repository.listInstallsByOrganization(organizationId) : [];
  const constructions = {};
  for (const install of installs) {
    for (const [typeId, modes] of Object.entries(install.declarations?.constructions || {})) {
      if (!modes || typeof modes !== 'object') continue;
      if (constructions[typeId]) {
        throw createError({ statusCode: 500, message: `construction bindings for type ${typeId} declared by two installed plugins` });
      }
      constructions[typeId] = { ...modes };
    }
  }
  return constructions;
}

// Starter constructs for an organization's initial process (SPEC §UI
// visible-by-default): the mounted packs' constructs plus the installed
// plugins' — the pack law extended across layers: one construct per type,
// a cross-layer collision is a composition error.
export async function starterConstructsForOrganization(organizationId) {
  const constructs = [];
  const seen = new Set();
  for (const install of organizationId ? await repository.listInstallsByOrganization(organizationId) : []) {
    for (const construct of install.declarations?.starterConstructs || []) {
      if (seen.has(construct.typeId)) {
        throw createError({
          statusCode: 500,
          message: `starter construct for type ${construct.typeId} declared by two installed plugins (last: ${install.pluginId})`
        });
      }
      seen.add(construct.typeId);
      constructs.push({ typeId: construct.typeId, construction: construct.construction });
    }
  }
  return constructs;
}

// Service-resolved projections (SPEC §8 p extract): the platform reads
// the target instance, and the plugin's endpoint-mode service computes
// the projected value over the instance's own values — its §3 fields and,
// when it carries one, its payload as base64; the service response is
// the projection value.
export async function resolveProjectionValue({ organizationId, commandId, typeId, instanceId }) {
  const install = await installForCommand(commandId, organizationId);
  if (!install) {
    throw createError({ statusCode: 404, message: `Projection service ${commandId} is not installed for this organization` });
  }
  const serviceId = commandId.match(PLUGIN_COMMAND_PATTERN)[2];
  const service = (install.services || []).find(item => item.id === serviceId);
  if (serviceModeOf(service) !== 'endpoint') {
    throw createError({ statusCode: 400, message: `Projection service ${serviceId} is not endpoint mode` });
  }
  const instance = await instanceServiceResolver(typeId).getById(String(instanceId)).catch(() => null);
  if (!instance) throw createError({ statusCode: 400, message: `Instance ${instanceId} not found for projection` });
  const payloadRef = instance.payload || null;
  const fileId = payloadRef?.fileId || payloadRef?.id || null;
  const buffer = fileId ? await filesService.getFileBuffer(fileId, 'files') : null;
  return await callEndpointService(install, serviceId, {
    typeId: String(typeId),
    instanceId: String(instanceId),
    fields: instance.fields || {},
    ...(buffer ? { payloadBase64: Buffer.from(buffer).toString('base64') } : {})
  });
}

// Attachment export bindings (installed plugins): the plugin services
// that generate export files for the plugin's own types.
export async function exportersForOrganization(organizationId) {
  const installs = organizationId ? await repository.listInstallsByOrganization(organizationId) : [];
  const exporters = [];
  for (const install of installs) {
    for (const exporter of install.declarations?.exports || []) {
      if (exporter?.typeId && exporter?.kind && exporter?.service) exporters.push({ ...exporter });
    }
  }
  return exporters;
}

export async function commandDefinitionFor(commandId, auth = {}) {
  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId || null;
  const install = await installForCommand(commandId, organizationId);
  if (!install) return null;
  return {
    id: commandId,
    service: `plugin.${install.pluginId}`,
    action: 'run',
    plugin: true
  };
}

// The executor file-output contract (SPEC §24) lives in
// ./executor-payload.js; re-exported for the service-module surface.
export { executorPayload } from './executor-payload.js';

export async function executeConnectorService(command, { parameters, auth = {} } = {}) {
  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId || null;
  const install = await installForCommand(command.id, organizationId);
  if (!install) {
    throw createError({ statusCode: 404, message: `Command ${command.id} is not installed for this organization` });
  }
  const serviceId = command.id.match(PLUGIN_COMMAND_PATTERN)[2];
  const service = (install.services || []).find(item => item.id === serviceId);

  // Endpoint mode: call the configured executor URL directly (the
  // nesting-worker shape — self-hosted or cloud-hosted); the JSON body is
  // the service input value and the JSON response is the service output.
  if (serviceModeOf(service) === 'endpoint') {
    return await callEndpointService(install, serviceId, parameters);
  }

  const run = await enqueueTask(command.id, {
    parameters: { value: parameters ?? null }
  }, auth, {
    definition: taskContractFor(command.id, install, String(organizationId)),
    workerType: `plugin.${install.pluginId}@${organizationId}`
  });
  // The async boundary: the command result carries the enqueued run, so
  // a waiting process invocation parks until the connector completes it.
  return { tasks: [run] };
}

export async function taskDefinitionFor(taskId, organizationId) {
  if (!organizationId) return null;
  const install = await installForCommand(taskId, organizationId);
  if (!install) return null;
  return taskContractFor(taskId, install, String(organizationId));
}

function taskContractFor(taskId, install, organizationId) {
  return {
    id: taskId,
    service: `plugin.${install.pluginId}`,
    executor: { workerType: `plugin.${install.pluginId}@${organizationId}` },
    input: {
      entities: [],
      // The whole service input record rides one passthrough parameter;
      // the task runtime validates only declared parameter fields.
      parameters: [{ name: 'value' }]
    },
    output: {}
  };
}

async function installForCommand(commandId, organizationId) {
  const match = String(commandId || '').match(PLUGIN_COMMAND_PATTERN);
  if (!match || !organizationId) return null;
  const install = await repository.findInstall(organizationId, match[1]);
  if (!install) return null;
  return (install.services || []).some(service => service.id === match[2]) ? install : null;
}

// The one endpoint-mode call: the configured URL, optional executor key,
// 60 s budget, JSON in/out — shared by connector commands and projection
// reads.
async function callEndpointService(install, serviceId, body) {
  const endpoint = install.endpoints?.[serviceId];
  if (!endpoint) {
    throw createError({
      statusCode: 400,
      message: `Service ${serviceId} has no endpoint — configure it in the plugin settings`
    });
  }
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(install.authToken ? { authorization: `Bearer ${install.authToken}` } : {})
      },
      body: JSON.stringify(body ?? null),
      signal: AbortSignal.timeout(60000)
    });
  } catch (error) {
    if (error?.name === 'TimeoutError') {
      throw createError({ statusCode: 504, message: `Service ${serviceId} endpoint timed out` });
    }
    throw createError({ statusCode: 502, message: `Service ${serviceId} endpoint failed: ${error?.message || error}` });
  }
  if (!response.ok) {
    const text = await response.text();
    throw createError({ statusCode: 502, message: `Service ${serviceId} endpoint failed: ${text || response.statusText}` });
  }
  return await response.json();
}

// The connector panel data: the token authorizes the publisher's
// executor to claim and complete this install's runs only.
export async function connectorInfo({ organizationId, pluginId, auth = {} }) {
  assertSameOrganization(organizationId, auth);
  assertOrganizationPermission(auth, 'admin');
  const install = await repository.findInstall(organizationId, pluginId);
  if (!install) throw createError({ statusCode: 404, message: 'Plugin is not installed' });
  return {
    pluginId: install.pluginId,
    token: install.connectorToken || null,
    workerType: `plugin.${install.pluginId}@${organizationId}`,
    endpoints: {
      claim: '/api/tasks/claim',
      heartbeat: '/api/tasks/{runId}/heartbeat',
      complete: '/api/tasks/{runId}/complete',
      fail: '/api/tasks/{runId}/fail'
    }
  };
}


export async function regenerateConnectorToken({ organizationId, pluginId, auth = {} }) {
  assertSameOrganization(organizationId, auth);
  assertOrganizationPermission(auth, 'admin');
  const install = await repository.findInstall(organizationId, pluginId);
  if (!install) throw createError({ statusCode: 404, message: 'Plugin is not installed' });
  const token = mintConnectorToken();
  await repository.setConnectorToken(organizationId, pluginId, token);
  return { pluginId: install.pluginId, token };
}

// --- Upgrades (marketplace SPEC: pinned versions, explicit diff +
// migration apply, the plugin twin of a local process Apply) ---

export async function upgradePreview({ organizationId, pluginId, auth = {} }) {
  assertSameOrganization(organizationId, auth);
  assertOrganizationPermission(auth, 'admin');
  const { install, listing } = await loadUpgradePair(organizationId, pluginId);
  return await buildUpgradePlan(install, listing, organizationId);
}

export async function applyUpgrade({ organizationId, pluginId, auth = {} }) {
  assertSameOrganization(organizationId, auth);
  assertOrganizationPermission(auth, 'admin');
  const { install, listing } = await loadUpgradePair(organizationId, pluginId);
  const layer = parseListingOr400(listing);
  assertInstallableDependencies(layer.dependencies);
  // Surface modules target a mount-contract major; the upgrade re-checks
  // the same law the install gate enforced.
  for (const surface of layer.surfaces) {
    if (!isSupportedSurfaceContract(surface.surfaceContract)) {
      throw createError({
        statusCode: 409,
        message: `Upgrade surface ${surface.id} targets contract version ${surface.surfaceContract}, which this platform does not support`
      });
    }
  }
  // The upgraded pin's requirements must still hold — the same law the
  // install gate enforces, re-checked against the world as it is now.
  const otherInstalls = (await repository.listInstallsByOrganization(organizationId))
    .filter(other => String(other.pluginId) !== String(install.pluginId));
  const installedPluginIds = new Set(otherInstalls.map(other => String(other.pluginId)));
  for (const requirementId of layer.requires) {
    if (!installedPluginIds.has(requirementId)) {
      throw createError({ statusCode: 409, message: `Upgrade requires plugin ${requirementId}, which is not installed` });
    }
  }
  const plan = await buildUpgradePlan(install, listing, organizationId);
  if (plan.blocked.length) {
    throw createError({
      statusCode: 409,
      message: 'Upgrade is blocked — resolve the reported types first',
      data: { blocked: plan.blocked }
    });
  }

  // Trial composition on the org view WITHOUT this plugin's old layer:
  // every kept/added type must define cleanly and introduce no compile
  // errors before anything persists.
  const emptyTypeIds = new Set(plan.changed.filter(change => change.instances === 0).map(change => change.typeId));
  const registry = await compileRegistryForOrganization(organizationId, {
    emptyTypeIds,
    excludePluginId: install.pluginId
  });
  const baseline = registry.compile(organizationId);
  const baselineErrors = new Set(baseline.ok ? [] : baseline.errors);
  const versionedTypes = [];
  for (const type of layer.types) {
    if (registry.getType(type.id, organizationId)) {
      throw createError({
        statusCode: 400,
        message: `Plugin type ${type.id} is not installable: type id already declared in this organization`
      });
    }
    try {
      versionedTypes.push(registry.defineType(type));
    } catch (error) {
      throw createError({
        statusCode: 400,
        message: `Plugin type ${type.id} is not installable: ${error?.message || error}`
      });
    }
  }
  const compiled = registry.compile(organizationId);
  const introduced = (compiled.errors || []).filter(error => !baselineErrors.has(error));
  if (introduced.length) {
    throw createError({ statusCode: 400, message: introduced.join('; ') });
  }

  await repository.updateInstallSnapshot(organizationId, pluginId, {
    version: listing.version,
    declarations: {
      types: versionedTypes.map(withoutMigrateSteps),
      editors: layer.editors,
      constructions: layer.constructions,
      starterConstructs: layer.starterConstructs,
      dependencies: layer.dependencies,
      exports: layer.exports,
      surfaces: layer.surfaces,
      previews: layer.previews
    },
    services: layer.services,
    requires: layer.requires,
    endpoints: upgradedEndpointsFor(install, layer.services)
  });

  // Covered breaking changes execute against live instances (SPEC §11
  // machinery, same as an org type edit): steps come from the new
  // declaration's transient `migrate` key.
  const changedById = new Map(plan.changed.map(change => [change.typeId, change]));
  for (const versioned of versionedTypes) {
    const change = changedById.get(versioned.id);
    if (change?.instances > 0 && change.covered && change.steps.length) {
      await applyTypeMigrationSteps({
        declaration: versioned,
        organizationId,
        steps: change.steps,
        toVersion: versioned.version,
        actor: auth.userId
      });
    }
  }

  invalidateInstanceDeclarations(String(organizationId));
  await ensureInstanceIndexes(registry.resolveView(organizationId));
  publishOrgContractChanged(String(organizationId), 'registry', {
    pluginId: String(pluginId),
    upgradedTo: listing.version
  });
  return {
    pluginId: String(pluginId),
    version: listing.version,
    types: versionedTypes.map(typeSummary),
    services: (listing.declarations.services || []).map(serviceSummary)
  };
}

async function loadUpgradePair(organizationId, pluginId) {
  const install = await repository.findInstall(organizationId, pluginId);
  if (!install) throw createError({ statusCode: 404, message: 'Plugin is not installed' });
  const listing = await repository.findCatalogByPluginId(pluginId);
  if (!listing) throw createError({ statusCode: 404, message: 'Plugin is not in the catalog' });
  if (listing.version === install.version) {
    throw createError({ statusCode: 409, message: 'Plugin is already at the pinned catalog version' });
  }
  const types = listing.declarations?.types || [];
  if (!types.length) throw createError({ statusCode: 400, message: 'Plugin declares no types' });
  return { install, listing };
}

// Upgrades inherit connection settings: a newly declared endpoint-mode
// service derives its URL from the origin the install already
// configured for the plugin's other services.
function upgradedEndpointsFor(install, services = []) {
  const endpoints = { ...(install.endpoints || {}) };
  const origin = Object.values(endpoints)[0]?.replace(/\/[^/]+$/, '') || null;
  for (const service of services) {
    if (serviceModeOf(service) === 'endpoint' && !endpoints[service.id] && origin) {
      endpoints[service.id] = `${origin}/${service.id}`;
    }
  }
  return endpoints;
}

// The diff before the apply: additions, removals (drain-gated), and
// changed types through the SPEC §11 planner — uncovered breaking
// changes on types with live instances block the upgrade.
async function buildUpgradePlan(install, listing, organizationId) {
  const oldTypes = new Map((install.declarations?.types || []).map(type => [type.id, type]));
  const newTypes = new Map((listing.declarations?.types || []).map(type => [type.id, type]));

  const added = [...newTypes.keys()].filter(id => !oldTypes.has(id)).map(id => typeSummary(newTypes.get(id)));
  const removed = [];
  const changed = [];
  const blocked = [];

  for (const [id, oldType] of oldTypes) {
    const instances = await countInstancesOfType(id, organizationId);
    if (!newTypes.has(id)) {
      if (instances > 0) {
        blocked.push({ typeId: id, instances, reason: 'removed with live instances — delete or migrate them first' });
      } else {
        removed.push(typeSummary(oldType));
      }
      continue;
    }
    const plan = planTypeMigration(oldType, newTypes.get(id));
    if (plan.breaking.length && instances === 0) {
      changed.push({ typeId: id, name: oldType.name || null, instances: 0, changes: plan.diff.changes, breaking: plan.breaking, covered: true, steps: [] });
      continue;
    }
    if (plan.breaking.length && !plan.covered) {
      blocked.push({
        typeId: id,
        instances,
        reason: plan.errors.join('; ') || 'breaking change without a covering migration step'
      });
    }
    changed.push({
      typeId: id,
      name: (newTypes.get(id).name || oldType.name || null),
      instances,
      changes: plan.diff.changes,
      breaking: plan.breaking,
      covered: plan.covered,
      steps: plan.steps.map(step => ({ ...step }))
    });
  }

  return { pluginId: install.pluginId, from: install.version, to: listing.version, added, removed, changed, blocked };
}

// Steps are one-time (SPEC §11): the persisted pin never carries `migrate`.
function withoutMigrateSteps(declaration = {}) {
  const next = { ...declaration };
  delete next.migrate;
  return next;
}

function parseListingOr400(listing) {
  try {
    return parseListing(listing);
  } catch (error) {
    throw createError({ statusCode: 400, message: `Invalid plugin listing: ${error.message}` });
  }
}

function assertSameOrganization(organizationId, auth = {}) {
  const activeOrgId = auth.organizationId || auth.memberships?.[0]?.organizationId;
  if (!auth.userId || !activeOrgId || String(activeOrgId) !== String(organizationId)) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
}

function assertOrganizationPermission(auth = {}, level) {
  if (!hasPermission(auth, 'organizations', level)) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }
}
