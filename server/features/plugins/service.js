// Plugin marketplace service: catalog publication, organization installs,
// declaration composition, managed execution, and remote service adapters.
import { createError } from 'h3';
import { PLUGIN_RUNTIME_WORKER_TYPE, PLUGIN_RUNTIME_MAX_EXECUTION_MS } from '#shared/plugin-runtime.js';
import { createHash, randomBytes } from 'node:crypto';
import * as repository from './repository.js';
import { runOrganizationChange } from '../instances/index.js';
import { compileRegistryForOrganization } from '../cts-types/service.js';
import { instanceServiceResolver, invalidateInstanceDeclarations } from '../instances/service.js';
import { ensureInstanceIndexes } from '../instances/indexes.js';
import { countInstancesOfType } from '../instances/count.js';
import { applyTypeMigrationSteps } from '../instances/migrations.js';
import { planTypeMigration } from '#packages/cts';
import { findTypeReferences, resolveRunActor } from '../process-definitions/service.js';
import { applyTypeRename } from './type-rename.js';
import { publishOrgContractChanged } from '../instance-events/service.js';
import { hasPermission } from '../../utils/auth-helpers.js';
import { enqueueTask, getTaskRunById, cancelTaskRun } from '../../core/tasks/service.js';
import * as filesService from '../files/service.js';
import { parseListing, normalizeListing } from '#packages/plugin-sdk/listing';
import { isSupportedSurfaceContract, endpointOriginOf } from '#shared/plugin-surfaces.js';

// Connector command ids: plugin.<pluginId>.<serviceId>; the install's
// claim queue is plugin.<pluginId>@<organizationId>.
const PLUGIN_COMMAND_PATTERN = /^plugin\.([a-z0-9-]+)\.([a-z0-9-]+)$/;

// Execution kinds the managed server path may execute and retry.
const MANAGED_EXECUTION_KINDS = Object.freeze(['pure', 'read']);

const BUILTIN_EXECUTORS = Object.freeze({
  documents: ['DOCUMENTS_EXECUTOR_URL', 'http://documents-executor:8791'],
  facade: ['FACADE_EXECUTOR_URL', 'http://facade-executor:8790'],
  'tech-drawing': ['TECH_DRAWING_EXECUTOR_URL', 'http://tech-drawing-executor:8792'],
  build123d: ['BUILD123D_EXECUTOR_URL', 'http://build123d-executor:8793']
});

function builtinExecutorOrigin(pluginId) {
  const entry = BUILTIN_EXECUTORS[pluginId];
  return entry ? (process.env[entry[0]] || entry[1]) : null;
}


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

// A client-carried package asset (SPEC §20): engine modules and pinned
// runtime files ship beside the listing, keyed by plugin id and version.
// Operator-gated at the route; the listing must already exist.
export async function publishPluginAsset({ pluginId = '', version = '', path = '', body, contentType = '' } = {}) {
  if (!/^[a-z0-9-]+$/.test(pluginId)) {
    throw createError({ statusCode: 400, message: 'pluginId must be a slug' });
  }
  if (!String(version).trim()) {
    throw createError({ statusCode: 400, message: 'A version query parameter keys the asset to its package' });
  }
  const segments = String(path || '').split('/')
    .map(segment => { try { return decodeURIComponent(segment); } catch { return null; } })
    .filter(Boolean);
  if (!segments.length || segments.some(segment => segment === '.' || segment === '..' || /[\\/]/.test(segment))) {
    throw createError({ statusCode: 400, message: 'Invalid asset path' });
  }
  if (!body?.length) {
    throw createError({ statusCode: 400, message: 'Asset body is empty' });
  }
  const listing = await repository.findCatalogByPluginId(pluginId);
  if (!listing) throw createError({ statusCode: 404, message: 'Plugin not found' });
  return await repository.storePluginAsset({
    pluginId,
    version: String(version),
    path: segments.join('/'),
    buffer: Buffer.from(body),
    contentType: contentType || 'application/octet-stream'
  });
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
  await repository.deletePluginAssets(pluginId);
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
// owns caller authority. `executorOrigin` configures one provider-level
// executor base; operation paths derive from their stable service ids.
export async function installFromCatalog({ organizationId, pluginId, executorOrigin = null, endpoints = {}, surfaceOrigin = null }) {
  const listing = await repository.findCatalogByPluginId(pluginId);
  if (!listing) throw createError({ statusCode: 404, message: 'Plugin not found' });
  if (await repository.findInstall(organizationId, pluginId)) {
    throw createError({ statusCode: 409, message: 'Plugin already installed' });
  }
  const layer = parseListingOr400(listing);
  const { types, services, editors, constructions, starterConstructs, dependencies, runtimes, exports: exportBindings, surfaces, engine, requires } = layer;
  assertSupportedRuntimeDeclarations(runtimes);
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

  const legacyMap = configuredEndpointsFor(services, endpoints);
  const inferredLegacyOrigin = legacyExecutorOrigin({ services, endpoints: legacyMap });
  if (Object.keys(legacyMap).length && !inferredLegacyOrigin) {
    throw createError({ statusCode: 400, message: 'Plugin installs accept one provider-level executor origin, not per-service endpoint URLs' });
  }
  const platformManaged = listing.builtin === true;
  if (platformManaged && executorOrigin) {
    throw createError({ statusCode: 400, message: 'Built-in plugin executor origins are managed by the platform' });
  }
  const hasEndpointServices = services.some(item => serviceModeOf(item) === 'endpoint');
  const configuredOrigin = platformManaged && hasEndpointServices
    ? configuredExecutorOriginFor(services, builtinExecutorOrigin(pluginId))
    : (executorOrigin
      ? configuredExecutorOriginFor(services, executorOrigin)
      : inferredLegacyOrigin);
  let configuredSurfaceOrigin = null;
  let packageAssets = null;
  try {
    await runOrganizationChange(organizationId, {
      kind: 'plugin-installed',
      typeId: null,
      instanceId: String(listing.pluginId),
      paths: ['plugin-declarations', 'plugin-services'],
      actorId: null
    }, async () => {
      packageAssets = await repository.materializePluginAssets(organizationId, listing.pluginId, listing.version || '1');
      configuredSurfaceOrigin = Number(packageAssets?.count) > 0
        ? null
        : configuredSurfaceOriginFor(surfaces, surfaceOrigin);
      for (const runtime of runtimes) {
        const asset = await repository.findOrganizationPluginAssetMeta(organizationId, listing.pluginId, listing.version || '1', runtime.entry.slice(1));
        if (!asset) throw createError({ statusCode: 400, message: `Runtime ${runtime.id} entry ${runtime.entry} is missing from the published package assets` });
      }
      await repository.createInstall({
        organizationId: String(organizationId),
      pluginId: String(listing.pluginId),
      name: listing.name || listing.pluginId,
      version: listing.version || '1',
      declarations: { types, editors, constructions, starterConstructs, dependencies, runtimes, exports: exportBindings, surfaces, previews: layer.previews, previewChannels: layer.previewChannels, ...(engine ? { engine } : {}) },
      services,
      requires,
      platformManaged,
      executorOrigin: configuredOrigin,
      packageAssets,
      assetStorage: { kind: 'organization', materializedAt: new Date() },
      ...(configuredSurfaceOrigin ? { surfaceOrigin: configuredSurfaceOrigin } : {}),
      connectorToken: services.some(service => serviceModeOf(service) === 'claim') ? mintConnectorToken() : null
    });
      invalidateInstanceDeclarations(String(organizationId));
    });
  } catch (error) {
    if (packageAssets?.count) {
      await repository.deleteOrganizationPluginAssets(organizationId, listing.pluginId, listing.version || '1').catch(() => {});
    }
    throw error;
  }
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

  await runOrganizationChange(organizationId, {
    kind: 'plugin-uninstalled',
    typeId: null,
    instanceId: String(pluginId),
    paths: ['plugin-declarations', 'plugin-services'],
    actorId: auth.userId
  }, async () => {
    for (const id of removing) {
      await repository.deleteInstall(organizationId, id);
    }
    invalidateInstanceDeclarations(String(organizationId));
  });
  for (const id of removing) {
    await repository.deleteOrganizationPluginAssets(organizationId, id);
  }
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
    platformManaged: install.platformManaged === true || install.builtin === true,
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

// Plugin service execution modes: managed package runtime, remote endpoint/
// claim adapters, and the transitional browser-local engine.

export function serviceModeOf(service = {}) {
  // An explicit transport mode is authoritative. Some listing compilers
  // attach execution metadata for shared/browser-server implementations;
  // that metadata must not hide a declared remote endpoint from plugin
  // settings (or from the provider-level executor-origin configuration).
  if (service.mode === 'endpoint') return 'endpoint';
  if (service.mode === 'local') return 'local';
  if (service.execution) return 'managed';
  return 'claim';
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
// The plugin-module proxy resolves the caller's installed package asset
// first, with the configured external integration origin as a migration
// fallback. Browsers load modules through the same-origin route.
export async function fetchSurfaceModule({ organizationId, pluginId, modulePath = '', auth = {} }) {
  assertSameOrganization(organizationId, auth);
  const install = await repository.findInstall(organizationId, pluginId);
  if (!install) throw createError({ statusCode: 404, message: 'Plugin not installed' });
  const segments = String(modulePath || '').split('/')
    .map(segment => { try { return decodeURIComponent(segment); } catch { return null; } })
    .filter(Boolean);
  if (!segments.length || segments.some(segment => segment === '.' || segment === '..' || /[\\/]/.test(segment))) {
    throw createError({ statusCode: 400, message: 'Invalid module path' });
  }

  // Installed package assets are organization data. The global catalog
  // remains the distribution source; installed reads resolve the caller's
  // materialized organization/version copy.
  if (Number(install.packageAssets?.count) > 0 || install.declarations?.engine || install.declarations?.runtimes?.length) {
    const organizationOwned = Number(install.packageAssets?.count) > 0;
    const asset = organizationOwned
      ? await repository.findOrganizationPluginAssetMeta(organizationId, pluginId, install.version, segments.join('/'))
      : await repository.findPluginAssetMeta(pluginId, install.version, segments.join('/'));
    if (!asset) throw createError({ statusCode: 404, message: `Plugin ${pluginId} package does not carry ${segments.join('/')}` });
    const isJsModule = /\.[cm]?js$/.test(segments[segments.length - 1] || '');
    const raw = organizationOwned
      ? await repository.readOrganizationPluginAsset(asset)
      : await repository.readPluginAsset(asset);
    if (organizationOwned) {
      const manifestAsset = (install.packageAssets?.assets || []).find(item => item.path === segments.join('/'));
      if (!manifestAsset || !manifestAsset.contentHash
        || filesService.contentHash(raw) !== manifestAsset.contentHash) {
        throw createError({ statusCode: 409, message: `Installed package asset ${segments.join('/')} failed its content digest check` });
      }
    }
    const body = isJsModule
      ? Buffer.from(rewriteDeclaredImports(raw.toString('utf8'), pluginId, install.declarations?.dependencies || []), 'utf8')
      : raw;
    return {
      contentType: asset.contentType || 'application/octet-stream',
      body,
      etag: `"${createHash('sha1').update(body).digest('hex')}"`
    };
  }

  const origin = install.executorOrigin || endpointOriginOf(install);
  if (!origin) throw createError({ statusCode: 503, message: `Plugin ${pluginId} has no connected executor endpoint` });
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
  const body = isJsModule
    ? Buffer.from(rewriteDeclaredImports(
        await response.text(),
        pluginId,
        install.declarations?.dependencies || []
      ), 'utf8')
    : Buffer.from(await response.arrayBuffer());
  // Revalidation identity for the browser cache: every load reaches the
  // executor, and an unchanged body answers 304 instead of transferring
  // the module again.
  return {
    contentType,
    body,
    etag: `"${createHash('sha1').update(body).digest('hex')}"`
  };
}

function rewriteDeclaredImports(source, pluginId, dependencies = []) {
  if (!dependencies.length) return source;
  // A cross-plugin dependency (plugin:<id><path>) resolves to the
  // required plugin's proxied scope; own-scope dependencies to this
  // plugin's.
  const targets = new Map(dependencies.map(dependency => {
    const crossPlugin = String(dependency.module || '').match(/^plugin:([a-z0-9-]+)(\/[a-z0-9/._-]+\.m?js)$/);
    const scope = crossPlugin ? crossPlugin[1] : pluginId;
    const path = crossPlugin ? crossPlugin[2] : dependency.module;
    return [dependency.name, `/api/plugins/${encodeURIComponent(scope)}/module${path}`];
  }));
  return source.replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"]+)\2/g, (whole, prefix, quote, specifier) => {
    const target = targets.get(specifier);
    return target ? `${prefix}${quote}${target}${quote}` : whole;
  });
}

function legacyExecutorOrigin(install) {
  const entries = Object.entries(install?.endpoints || {});
  if (!entries.length) return null;
  const services = new Map((install.services || []).map(service => [service.id, service]));
  const bases = new Set();
  for (const [serviceId, raw] of entries) {
    const service = services.get(serviceId);
    if (!service || serviceModeOf(service) !== 'endpoint') return null;
    try {
      const url = new URL(String(raw));
      const suffix = serviceId;
      if (url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/' + suffix)) return null;
      url.pathname = url.pathname.slice(0, -suffix.length).replace(/\/$/, '');
      bases.add(url.toString().replace(/\/$/, ''));
    } catch { return null; }
  }
  return bases.size === 1 ? [...bases][0] : null;
}

function endpointUrlFor(install, service) {
  // Built-in catalog seeds predate the persisted platformManaged flag on
  // install records. The allowlisted plugin id is the authority here: only
  // platform-shipped executors have an entry in BUILTIN_EXECUTORS.
  return install.executorOrigin || legacyExecutorOrigin(install)
    || builtinExecutorOrigin(install.pluginId);
}

export async function settingsFor({ organizationId, pluginId, auth = {} }) {
  assertSameOrganization(organizationId, auth);
  assertOrganizationPermission(auth, 'admin');
  const install = await repository.findInstall(organizationId, pluginId);
  if (!install) throw createError({ statusCode: 404, message: 'Plugin is not installed' });
  const packageOwned = Number(install.packageAssets?.count) > 0 || Boolean(install.declarations?.engine) || Boolean(install.declarations?.runtimes?.length);
  const platformManaged = install.platformManaged === true || install.builtin === true;
  const endpointServices = (install.services || []).filter(service => serviceModeOf(service) === 'endpoint');
  const inferredOrigin = endpointUrlFor(install, endpointServices[0]);
  return {
    pluginId: install.pluginId,
    platformManaged,
    authToken: platformManaged ? null : (endpointServices.length ? (install.authToken || null) : null),
    executorOrigin: inferredOrigin || '',
    legacyEndpointConflict: !install.executorOrigin && Object.keys(install.endpoints || {}).length > 0 && !inferredOrigin,
    surfaceOrigin: packageOwned || platformManaged ? null : (install.surfaceOrigin || null),
    surfaces: !packageOwned && !platformManaged && (install.declarations?.surfaces || []).length > 0,
    hasEndpointServices: endpointServices.length > 0,
    services: (install.services || []).map(service => ({ id: service.id, label: serviceSummary(service).label, mode: serviceModeOf(service) }))
  };
}
// Legacy endpoint-map validator used only to collapse old installs into
// one provider origin. New writes persist executorOrigin, never this map.
function configuredEndpointsFor(services = [], endpoints = {}) {
  const serviceById = new Map((services || []).map(service => [service.id, service]));
  const configured = {};
  for (const [serviceId, raw] of Object.entries(endpoints || {})) {
    const service = serviceById.get(serviceId);
    if (!service) throw createError({ statusCode: 400, message: `Unknown service ${serviceId}` });
    if (serviceModeOf(service) !== 'endpoint') {
      throw createError({ statusCode: 400, message: `Service ${serviceId} is ${serviceModeOf(service)} mode — no endpoint applies` });
    }
    if (raw) {
      const url = String(raw);
      if (!/^https?:\/\//.test(url)) throw createError({ statusCode: 400, message: `Endpoint for ${serviceId} must be an http(s) URL` });
      configured[serviceId] = url;
    }
  }
  return configured;
}

function configuredExecutorOriginFor(services = [], executorOrigin = null) {
  if (!executorOrigin) return null;
  if (!(services || []).some(service => serviceModeOf(service) === 'endpoint')) {
    throw createError({ statusCode: 400, message: 'This plugin has no remote endpoint services' });
  }
  let parsed;
  try { parsed = new URL(String(executorOrigin)); } catch {
    throw createError({ statusCode: 400, message: 'Executor origin must be an absolute http(s) URL' });
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw createError({ statusCode: 400, message: 'Executor origin must be an http(s) URL without credentials, query, or fragment' });
  }
  return parsed.toString().replace(/\/$/, '');
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

export async function updateSettings({ organizationId, pluginId, executorOrigin = undefined, endpoints = undefined, authToken = null, surfaceOrigin = undefined, auth = {} }) {
  assertSameOrganization(organizationId, auth);
  assertOrganizationPermission(auth, 'admin');
  const install = await repository.findInstall(organizationId, pluginId);
  if (!install) throw createError({ statusCode: 404, message: 'Plugin is not installed' });
  if ((install.platformManaged === true || install.builtin === true)
    && (executorOrigin !== undefined || endpoints !== undefined || authToken || surfaceOrigin !== undefined)) {
    throw createError({ statusCode: 400, message: 'This plugin executor is managed by the platform and cannot be changed in organization settings' });
  }
  let requestedOrigin = executorOrigin;
  if (requestedOrigin === undefined && endpoints !== undefined) {
    const legacyMap = configuredEndpointsFor(install.services, endpoints);
    const candidate = legacyExecutorOrigin({ ...install, endpoints: legacyMap });
    if (Object.keys(legacyMap).length && !candidate) throw createError({ statusCode: 400, message: 'Per-service endpoints cannot be saved. Configure one provider-level executor origin.' });
    requestedOrigin = candidate;
  }
  if (!requestedOrigin && Object.keys(install.endpoints || {}).length && !legacyExecutorOrigin(install)) {
    throw createError({ statusCode: 400, message: 'Legacy operation URLs do not share one provider base. Set the provider executor origin explicitly before saving.' });
  }
  let configuredOrigin = install.executorOrigin || legacyExecutorOrigin(install);
  if (requestedOrigin !== undefined) {
    if (!requestedOrigin) configuredOrigin = null;
    else configuredOrigin = configuredExecutorOriginFor(install.services, requestedOrigin);
  }
  const packageOwned = Number(install.packageAssets?.count) > 0
    || Boolean(install.declarations?.engine)
    || Boolean(install.declarations?.runtimes?.length);
  const hasEndpointServices = (install.services || []).some(service => serviceModeOf(service) === 'endpoint');
  if (authToken && !hasEndpointServices) {
    throw createError({ statusCode: 400, message: 'An API key applies only to external endpoint services' });
  }
  if (packageOwned && surfaceOrigin) {
    throw createError({ statusCode: 400, message: 'Organization-owned package surfaces use the installed package assets' });
  }
  const configuredSurfaceOrigin = packageOwned ? null : (surfaceOrigin === undefined
    ? (install.surfaceOrigin || null)
    : configuredSurfaceOriginFor(install.declarations?.surfaces || [], surfaceOrigin));
  await repository.updateSettings(organizationId, pluginId, {
    executorOrigin: configuredOrigin,
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
        plugin: install.pluginId,
        pluginLabel: install.name,
        group: service.palette?.group || install.pluginId,
        ...((service.palette?.label || (!service.palette?.group && install.name)) ? {
          groupLabel: service.palette?.label || install.name
        } : {}),
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

// Resolve and verify the immutable package snapshot for a claimed managed
// runtime task. The API route owns worker authentication and claim lookup;
// repository access and package integrity remain behind this feature service.
const GRAPH_NODE_SEMANTIC_KEYS = [
  'kind', 'nominal', 'provider', 'schema', 'entityType', 'identity', 'constraints', 'unit'
];

function graphNodePortContract(schema = {}) {
  const shape = ['list', 'tree', 'map', 'tuple', 'stream'].includes(schema.base)
    ? schema.base
    : 'item';
  const semanticSource = shape === 'item' ? schema : (schema.itemType || { base: 'json' });
  const semantic = { base: semanticSource.base || 'json' };
  for (const key of GRAPH_NODE_SEMANTIC_KEYS) {
    if (Object.hasOwn(semanticSource.semantic || {}, key)) semantic[key] = semanticSource.semantic[key];
    if (Object.hasOwn(semanticSource, key)) semantic[key] = semanticSource[key];
  }
  if (schema.nullable === true || semanticSource.nullable === true) semantic.nullable = true;
  return { shape, semantic };
}

// Resolve provider metadata only from the caller's installed package snapshot.
// The returned packagePin is carried into execution provenance by the graph host.
export async function resolveInstalledGraphNodeDefinition({
  provider = '',
  id = '',
  version = '',
  auth = {}
} = {}) {
  const match = /^plugin\.([a-z0-9-]+)$/.exec(String(provider));
  const organizationId = String(auth.organizationId || auth.memberships?.[0]?.organizationId || '');
  if (!match || !organizationId || !id || !version) {
    throw createError({ statusCode: 400, message: 'Installed graph node identity is incomplete' });
  }
  const pluginId = match[1];
  await resolveRunActor(auth, organizationId);
  const install = await repository.findInstall(organizationId, pluginId);
  if (!install) {
    throw createError({ statusCode: 404, message: `Graph provider ${provider} is not installed for this organization` });
  }
  const service = (install.services || []).find(item => String(item.id) === String(id));
  const runtimeId = String(service?.execution?.runtime || '');
  const runtime = (install.declarations?.runtimes || []).find(item => String(item.id) === runtimeId);
  if (!service || serviceModeOf(service) !== 'managed'
    || service.palette?.visible === false || !service.palette?.group
    || !runtime || runtime.language !== 'javascript'
    || !service.execution?.targets?.includes('server')
    || !runtime.targets?.includes('server')) {
    throw createError({ statusCode: 409, message: `Graph node ${provider}/${id} is not available for managed server execution` });
  }
  const definitionVersion = String(service.nodeVersion || '1');
  if (definitionVersion !== String(version)) {
    throw createError({ statusCode: 409, message: `Graph node ${provider}/${id}@${version} does not match the installed definition version ${definitionVersion}` });
  }
  const definition = {
    provider: String(provider),
    id: String(id),
    version: definitionVersion,
    label: service.label || service.id,
    ...(service.description ? { description: service.description } : {}),
    palette: {
      group: service.palette.group,
      ...(service.palette.label ? { label: service.palette.label } : {}),
      keywords: service.palette.keywords || []
    },
    inputs: Object.entries(service.signature?.input?.fields || {}).map(([portId, field]) => ({
      id: portId,
      label: field.label || portId,
      ...graphNodePortContract(field),
      required: field.nullable !== true,
      ...(Object.hasOwn(field, 'default') ? { default: field.default } : {}),
      ...(field.description ? { description: field.description } : {})
    })),
    outputs: [{
      id: 'value',
      label: service.signature?.output?.label || 'Value',
      ...graphNodePortContract(service.signature?.output || {}),
      required: true
    }],
    ...(service.configuration ? { configuration: service.configuration } : {}),
    execution: {
      runtime: runtimeId,
      kind: service.execution.kind,
      targets: service.execution.targets,
      capabilities: service.execution.capabilities || [],
      deterministic: service.execution.deterministic === true,
      idempotent: service.execution.idempotent === true
    },
    packagePin: {
      pluginId,
      version: String(install.version),
      runtimeId,
      operationId: String(id)
    }
  };
  return definition;
}

// Every installed graph-node definition the server evaluator can resolve
// for this caller: each candidate passes resolveInstalledGraphNodeDefinition's
// own gate, so discovery and execution share the one resolution path.
// Services the gate refuses are not server-authorable and stay unlisted.
export async function listInstalledGraphNodeDefinitions({ provider = null, auth = {} } = {}) {
  const organizationId = String(auth.organizationId || auth.memberships?.[0]?.organizationId || '');
  if (!organizationId) return [];
  const installs = await repository.listInstallsByOrganization(organizationId);
  const definitions = [];
  for (const install of installs) {
    const installProvider = `plugin.${install.pluginId}`;
    if (provider && installProvider !== String(provider)) continue;
    for (const service of install.services || []) {
      if (!service?.id) continue;
      try {
        definitions.push(await resolveInstalledGraphNodeDefinition({
          provider: installProvider,
          id: service.id,
          version: String(service.nodeVersion || '1'),
          auth
        }));
      } catch (error) {
        // 409 (and 404) name services the resolution gate refuses — not
        // server-authorable, so unlisted. Auth and actor refusals propagate.
        if (![400, 404, 409].includes(Number(error?.statusCode))) throw error;
      }
    }
  }
  return definitions;
}

function managedNodeAbortError(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  const error = new Error(signal?.reason == null ? 'Managed graph node execution was cancelled' : String(signal.reason));
  error.name = 'AbortError';
  error.code = 'PLUGIN_EXECUTION_ABORTED';
  return error;
}

async function waitForManagedNodeTask(run, { signal, timeoutMs = PLUGIN_RUNTIME_MAX_EXECUTION_MS + 10000 } = {}) {
  const deadline = Date.now() + Math.max(1, Number(timeoutMs) || PLUGIN_RUNTIME_MAX_EXECUTION_MS + 10000);
  while (true) {
    if (signal?.aborted) {
      await cancelTaskRun(run._id, 'Graph execution was cancelled').catch(() => {});
      throw managedNodeAbortError(signal);
    }
    const current = await getTaskRunById(run._id);
    if (!current) throw createError({ statusCode: 404, message: 'Managed graph node task disappeared' });
    if (current.status === 'SUCCEEDED') {
      if (current.output?.ok === false) {
        throw createError({ statusCode: 502, message: current.output?.error?.message || 'Managed graph node failed' });
      }
      const data = current.output?.data;
      if (!data || !Object.hasOwn(data, 'output')) {
        throw createError({ statusCode: 502, message: 'Managed graph node completed without an output value' });
      }
      return {
        output: data.output,
        capabilityEvidence: Array.isArray(data.capabilityEvidence) ? data.capabilityEvidence : []
      };
    }
    if (['FAILED', 'CANCELLED'].includes(current.status)) {
      throw createError({
        statusCode: current.status === 'CANCELLED' ? 409 : 502,
        message: current.error?.message || current.output?.error?.message || `Managed graph node ended in ${current.status}`
      });
    }
    if (Date.now() >= deadline) {
      await cancelTaskRun(run._id, 'Managed graph node deadline exceeded').catch(() => {});
      const error = createError({ statusCode: 504, message: 'Managed graph node execution deadline exceeded' });
      error.name = 'TimeoutError';
      error.code = 'PLUGIN_EXECUTION_TIMEOUT';
      throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

// Execute one pure/read graph node through the same isolated platform worker
// used by plugin services. Each child task carries the parent graph execution
// id and the installed package pin; no user-supplied executor URL is involved.
export async function executeManagedGraphNode(definition, invocation = {}, auth = {}) {
  const pin = definition?.packagePin || {};
  const organizationId = String(auth.organizationId || auth.memberships?.[0]?.organizationId || '');
  const pluginId = String(pin.pluginId || '');
  const version = String(pin.version || '');
  const runtimeId = String(pin.runtimeId || '');
  const operationId = String(pin.operationId || definition?.id || '');
  if (!organizationId || !pluginId || !version || !runtimeId || !operationId
    || operationId !== String(definition.id || '')
    || String(definition.provider || '') !== `plugin.${pluginId}`) {
    throw createError({ statusCode: 400, message: 'Managed graph node package pin does not match its provider operation' });
  }
  if (!MANAGED_EXECUTION_KINDS.includes(definition.execution?.kind)) {
    throw createError({ statusCode: 403, message: `Graph preview cannot execute ${definition.execution?.kind || 'unclassified'} operation ${definition.id}` });
  }
  if (invocation.context?.signal?.aborted) throw managedNodeAbortError(invocation.context.signal);
  await resolveRunActor(auth, organizationId);
  const install = await repository.findInstall(organizationId, pluginId);
  if (!install || String(install.version) !== version) {
    throw createError({ statusCode: 409, message: 'Installed plugin package changed after graph provider resolution' });
  }
  const service = (install.services || []).find(item => String(item.id) === operationId);
  const runtime = (install.declarations?.runtimes || []).find(item => String(item.id) === runtimeId);
  if (!service || serviceModeOf(service) !== 'managed' || service.execution?.runtime !== runtimeId
    || !service.execution?.targets?.includes('server')
    || !runtime?.targets?.includes('server')
    || runtime.language !== 'javascript'
    || String(service.nodeVersion || '1') !== String(definition.version)) {
    throw createError({ statusCode: 409, message: 'Installed graph node declaration changed after provider resolution' });
  }

  const taskId = `plugin.${pluginId}.${operationId}`;
  const executionId = String(invocation.context?.executionId || '');
  const nodeId = String(invocation.node?.id || operationId);
  const invocationPath = Array.isArray(invocation.invocationPath) ? invocation.invocationPath : [];
  const invocationKey = createHash('sha256').update(JSON.stringify(invocationPath)).digest('hex').slice(0, 24);
  const taskInput = {
    parameters: {
      value: {
        pluginId,
        version,
        runtimeId,
        operationId,
        input: {
          mode: 'preview',
          config: invocation.config || {},
          inputs: invocation.inputs || {},
          nodeId,
          executionId,
          invocationPath
        }
      }
    }
  };
  const run = await enqueueTask(taskId, taskInput, { ...auth, organizationId }, {
    definition: taskContractFor(taskId, install, organizationId),
    workerType: PLUGIN_RUNTIME_WORKER_TYPE,
    maxAttempts: 1,
    parentRunId: invocation.context?.parentRunId || null,
    idempotencyKey: executionId
      ? `graph-node:${executionId}:${invocationKey}`
      : null
  });
  const evidence = {
    taskRunId: String(run._id),
    nodeId,
    invocationPath,
    operation: {
      provider: definition.provider,
      id: definition.id,
      version: definition.version
    },
    packagePin: pin
  };
  try {
    const remainingExecutionMs = typeof invocation.context?.remainingExecutionMs === 'function'
      ? invocation.context.remainingExecutionMs()
      : invocation.context?.remainingExecutionMs;
    if (Number.isFinite(remainingExecutionMs) && remainingExecutionMs <= 0) {
      await cancelTaskRun(run._id, 'Graph execution deadline exceeded').catch(() => {});
      const error = new Error('Server graph execution deadline exceeded');
      error.name = 'TimeoutError';
      error.code = 'GRAPH_EXECUTION_TIMEOUT';
      throw error;
    }
    const taskResult = await waitForManagedNodeTask(run, {
      signal: invocation.context?.signal,
      timeoutMs: Math.min(
        Number.isFinite(remainingExecutionMs) ? remainingExecutionMs : PLUGIN_RUNTIME_MAX_EXECUTION_MS + 10000,
        PLUGIN_RUNTIME_MAX_EXECUTION_MS + 10000
      )
    });
    for (const capability of taskResult.capabilityEvidence) {
      const capabilityRecord = {
        ...capability,
        nodeId,
        operation: evidence.operation,
        packagePin: pin
      };
      invocation.context?.capabilityEvidence?.push(capabilityRecord);
      const readSet = capability.readSet;
      const recorder = invocation.context?.readSet;
      if (capability.name === 'files.read' && recorder
        && capability.input?.fileId && capability.contentHash) {
        recorder.recordFile({
          fileId: capability.input.fileId,
          contentHash: capability.contentHash,
          organizationId: capability.organizationId ?? null
        });
      }
      if (readSet && recorder) {
        if (readSet.consistency) {
          recorder.setConsistency({
            consistency: readSet.consistency,
            snapshotId: readSet.snapshotId,
            organizationSequenceStart: readSet.organizationSequenceStart,
            organizationSequenceEnd: readSet.organizationSequenceEnd
          });
        }
        for (const instance of readSet.instances || []) recorder.recordInstance(instance);
        for (const relation of readSet.relations || []) recorder.recordRelation(relation);
        for (const query of readSet.queries || []) recorder.recordQuery(query);
      }
    }
    invocation.context?.nodeInvocations?.push({
      ...evidence,
      status: 'succeeded',
      capabilities: taskResult.capabilityEvidence.map(item => item.name)
    });
    return taskResult.output;
  } catch (error) {
    invocation.context?.nodeInvocations?.push({
      ...evidence,
      status: error?.name === 'AbortError' ? 'cancelled' : error?.name === 'TimeoutError' ? 'timed-out' : 'failed',
      error: String(error?.message || error)
    });
    throw error;
  }
}

export async function managedRuntimePackageForTask(run = {}) {
  const taskInput = run.input?.parameters?.value || {};
  const organizationId = String(run.auth?.organizationId || '');
  const pluginId = String(taskInput.pluginId || '');
  const version = String(taskInput.version || '');
  const runtimeId = String(taskInput.runtimeId || '');
  const operationId = String(taskInput.operationId || '');
  if (!organizationId || !pluginId || !version || !runtimeId || !operationId) {
    throw createError({ statusCode: 400, message: 'Managed runtime task package identity is incomplete' });
  }

  await resolveRunActor(run.auth || {}, organizationId);
  const install = await repository.findInstall(organizationId, pluginId);
  if (!install || String(install.version) !== version) {
    throw createError({ statusCode: 409, message: 'The installed plugin version changed before execution' });
  }
  if (String(run.taskId) !== `plugin.${pluginId}.${operationId}`) {
    throw createError({ statusCode: 403, message: 'Managed runtime task identity does not match its package input' });
  }
  const service = (install.services || []).find(item => item.id === operationId);
  const runtime = (install.declarations?.runtimes || []).find(item => item.id === runtimeId);
  if (!service?.execution || service.execution.runtime !== runtimeId
    || !service.execution.targets?.includes('server')
    || !runtime?.targets?.includes('server')
    || runtime.language !== 'javascript') {
    throw createError({ statusCode: 409, message: 'Managed runtime declaration changed or is unsupported' });
  }

  const manifest = install.packageAssets?.assets || [];
  if (!manifest.length) {
    throw createError({ statusCode: 409, message: 'Installed package assets are unavailable; reinstall or upgrade this plugin' });
  }
  const assets = [];
  for (const item of manifest) {
    const path = String(item.path || '');
    if (!path || path.startsWith('/') || path.split('/').includes('..')) {
      throw createError({ statusCode: 500, message: 'Installed package asset manifest contains an unsafe path' });
    }
    const meta = await repository.findOrganizationPluginAssetMeta(organizationId, pluginId, version, path);
    if (!meta) throw createError({ statusCode: 409, message: `Installed package asset ${path} is missing` });
    const buffer = await repository.readOrganizationPluginAsset(meta);
    const digest = filesService.contentHash(buffer);
    if (item.contentHash && digest !== item.contentHash) {
      throw createError({ statusCode: 409, message: `Installed package asset ${path} failed its content digest check` });
    }
    assets.push({
      path,
      contentType: meta.contentType || '',
      contentHash: meta.contentHash || item.contentHash || '',
      base64: buffer.toString('base64')
    });
  }

  const entry = String(runtime.entry || '').replace(/^\//, '');
  if (!assets.some(asset => asset.path === entry)) {
    throw createError({ statusCode: 409, message: `Runtime entry ${runtime.entry} is missing from installed package assets` });
  }
  return {
    success: true,
    package: {
      pluginId,
      version,
      runtime: { ...runtime },
      execution: { ...service.execution },
      operationId,
      input: taskInput.input ?? null,
      dependencies: install.declarations?.dependencies || [],
      assets
    }
  };
}

export async function executeConnectorService(command, { parameters, auth = {}, valueOnly = false } = {}) {
  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId || null;
  const install = await installForCommand(command.id, organizationId);
  if (!install) {
    throw createError({ statusCode: 404, message: `Command ${command.id} is not installed for this organization` });
  }
  const serviceId = command.id.match(PLUGIN_COMMAND_PATTERN)[2];
  const service = (install.services || []).find(item => item.id === serviceId);

  if (serviceModeOf(service) === 'local') {
    throw createError({ statusCode: 400, message: `Service ${serviceId} runs in the transitional client engine — server execution does not apply` });
  }
  if (serviceModeOf(service) === 'managed') {
    const runtime = (install.declarations?.runtimes || []).find(item => item.id === service.execution.runtime);
    if (!runtime) throw createError({ statusCode: 500, message: `Service ${serviceId} references a missing runtime ${service.execution.runtime}` });
    if (!service.execution.targets?.includes('server') || !runtime.targets?.includes('server')) {
      throw createError({ statusCode: 400, message: `Service ${serviceId} does not support server execution` });
    }
    if (runtime.language !== 'javascript') {
      throw createError({ statusCode: 501, message: `Server runtime ${runtime.language} is not available yet` });
    }
    const run = await enqueueTask(command.id, {
      parameters: { value: {
        pluginId: install.pluginId,
        version: install.version,
        runtimeId: runtime.id,
        operationId: service.id,
        input: parameters ?? null
      } }
    }, { ...auth, organizationId: String(organizationId) }, {
      definition: taskContractFor(command.id, install, String(organizationId)),
      workerType: PLUGIN_RUNTIME_WORKER_TYPE,
      maxAttempts: MANAGED_EXECUTION_KINDS.includes(service.execution.kind) || service.execution.idempotent === true ? 3 : 1
    });
    return { tasks: [run] };
  }

  // Endpoint mode: call the configured executor URL directly (the
  // nesting-worker shape — self-hosted or cloud-hosted); the JSON body is
  // the service input value and the JSON response is the service output.
  // A service declaring `cache: 'deterministic'` replays through the
  // service cache (SPEC §28): the key covers the service identity, the
  // installed version, and the canonical input — same inputs, same
  // output, no executor call.
  if (serviceModeOf(service) === 'endpoint') {
    const value = await invokeEndpointValueService(command.id, parameters, auth);
    // The command runner consumes this private envelope to keep plugin
    // values separate from platform-owned CommandResult control fields.
    return valueOnly ? { __perigramPluginValue: true, value } : value;
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

// The synchronous endpoint dispatch shared by connector commands and
// draft preview (SPEC §28 preview law): the configured URL, the
// deterministic-cache replay, and the claim-mode refusal — a preview
// is a pure read and parks on no queue.
export async function invokeEndpointValueService(commandId, parameters, auth = {}) {
  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId || null;
  const install = await installForCommand(commandId, organizationId);
  if (!install) {
    throw createError({ statusCode: 404, message: `Command ${commandId} is not installed for this organization` });
  }
  const serviceId = commandId.match(PLUGIN_COMMAND_PATTERN)[2];
  const service = (install.services || []).find(item => item.id === serviceId);
  if (serviceModeOf(service) !== 'endpoint') {
    throw createError({ statusCode: 400, message: `Service ${serviceId} is ${serviceModeOf(service)} mode — server preview evaluates endpoint services only` });
  }
  if (service?.cache === 'deterministic') {
    // The cache keys the raw parameters: a blob field's handle names
    // its storage content, the hydrated bytes add nothing.
    const cacheKey = deterministicServiceKey(install, serviceId, parameters);
    const cached = await repository.findCachedServiceResult(cacheKey);
    if (cached) return cached.result;
    const result = await callEndpointService(install, serviceId, await hydrateBlobParameters(service, parameters));
    await repository.storeCachedServiceResult(cacheKey, result);
    return result;
  }
  return await callEndpointService(install, serviceId, await hydrateBlobParameters(service, parameters));
}

// Preview dispatch for value services: endpoint adapters keep their synchronous
// endpoint path, while pure/read managed services execute through the installed,
// version-pinned runtime worker. Managed services must never be sent through the
// legacy endpoint-only preview adapter.
export async function invokePreviewValueService(commandId, parameters, auth = {}, context = {}) {
  const match = String(commandId || '').match(PLUGIN_COMMAND_PATTERN);
  if (!match) throw createError({ statusCode: 404, message: `Command ${commandId} is not an installed plugin service` });
  const [, pluginId, serviceId] = match;
  const organizationId = String(auth.organizationId || auth.memberships?.[0]?.organizationId || '');
  const install = organizationId ? await repository.findInstall(organizationId, pluginId) : null;
  const service = (install?.services || []).find(item => String(item.id) === serviceId);
  if (!install || !service) throw createError({ statusCode: 404, message: `Service ${serviceId} is not installed for this organization` });
  const mode = serviceModeOf(service);
  if (mode === 'endpoint') return await invokeEndpointValueService(commandId, parameters, auth);
  if (mode !== 'managed') {
    throw createError({ statusCode: 400, message: `Service ${serviceId} is ${mode} mode and cannot run in preview` });
  }
  if (!MANAGED_EXECUTION_KINDS.includes(service.execution?.kind)) {
    throw createError({ statusCode: 403, message: `Preview cannot execute ${service.execution?.kind || 'unclassified'} service ${serviceId}` });
  }
  const definition = await resolveInstalledGraphNodeDefinition({
    provider: `plugin.${pluginId}`,
    id: serviceId,
    version: String(service.nodeVersion || '1'),
    auth
  });
  const executionId = String(context.executionId || `process-preview-${randomBytes(12).toString('hex')}`);
  const output = await executeManagedGraphNode(definition, {
    node: { id: String(context.nodeId || serviceId) },
    config: {},
    inputs: parameters && typeof parameters === 'object' ? parameters : {},
    invocationPath: context.invocationPath || [],
    context: {
      executionId,
      signal: context.signal,
      remainingExecutionMs: context.remainingExecutionMs
    }
  }, auth);
  // The shared Documents runtime uses the graph invocation envelope so the
  // same operation implementation serves browser and managed graph hosts.
  return output && typeof output === 'object' && Object.hasOwn(output, 'value')
    ? output.value
    : output;
}

// A service input field declared with base `blob` receives a payload
// handle `{ fileId, mime, size, name? }` on the wire; the dispatch
// hydrates the handle with its bytes so the executor reads
// `payloadBase64` and reaches no storage. Declaration-driven — the
// service's own signature names which fields carry handles.
async function hydrateBlobParameters(service = {}, parameters = null) {
  const fields = service.signature?.input?.base === 'record' ? service.signature.input.fields || {} : {};
  const blobFields = Object.entries(fields)
    .filter(([, descriptor]) => descriptor?.base === 'blob')
    .map(([name]) => name);
  if (!blobFields.length || !parameters || typeof parameters !== 'object') return parameters;
  const hydrated = { ...parameters };
  for (const name of blobFields) {
    const handle = hydrated[name];
    if (!handle || typeof handle !== 'object' || !handle.fileId || handle.payloadBase64) continue;
    const buffer = await filesService.getFileBuffer(String(handle.fileId), 'files');
    if (!buffer) {
      throw createError({ statusCode: 400, message: `Service input ${name}: file ${handle.fileId} has no stored payload` });
    }
    hydrated[name] = { ...handle, payloadBase64: Buffer.from(buffer).toString('base64') };
  }
  return hydrated;
}

// One canonical serialization for cache keys: sorted keys at every depth,
// so structurally equal inputs hash equal.
function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = canonicalValue(value[key]);
      return acc;
    }, {});
  }
  return value === undefined ? null : value;
}

function deterministicServiceKey(install, serviceId, parameters) {
  return `${install.pluginId}@${install.version}:${serviceId}:${createHash('sha256')
    .update(JSON.stringify(canonicalValue({ serviceId, parameters: parameters ?? null })))
    .digest('hex')}`;
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
  const service = (install.services || []).find(item => item.id === String(serviceId));
  if (!service || serviceModeOf(service) !== 'endpoint') {
    throw createError({ statusCode: 400, message: `Service ${serviceId} is not an endpoint-mode service` });
  }
  const endpoint = endpointUrlFor(install, service);
  if (!endpoint) {
    throw createError({
      statusCode: 400,
      message: `Plugin ${install.pluginId} has no provider executor origin — configure it once in plugin settings`
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
      body: JSON.stringify({ operationId: serviceId, input: body ?? null }),
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
  if (!(install.services || []).some(service => serviceModeOf(service) === 'claim')) {
    throw createError({ statusCode: 409, message: 'This plugin has no external claim-mode services' });
  }
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
  if (!(install.services || []).some(service => serviceModeOf(service) === 'claim')) {
    throw createError({ statusCode: 409, message: 'This plugin has no external claim-mode services' });
  }
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
  assertSupportedRuntimeDeclarations(layer.runtimes);
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

  const packageAssets = await repository.materializePluginAssets(organizationId, pluginId, listing.version);
  let migrationError = null;
  await runOrganizationChange(organizationId, {
    kind: 'plugin-upgraded',
    typeId: null,
    instanceId: String(pluginId),
    paths: ['plugin-declarations', 'plugin-services', 'instance-migrations'],
    actorId: auth.userId
  }, async () => {
    await repository.updateInstallSnapshot(organizationId, pluginId, {
      version: listing.version,
      declarations: {
        types: versionedTypes.map(withoutMigrateSteps),
        editors: layer.editors,
        constructions: layer.constructions,
        starterConstructs: layer.starterConstructs,
        dependencies: layer.dependencies,
        runtimes: layer.runtimes,
        exports: layer.exports,
        surfaces: layer.surfaces,
        previews: layer.previews,
        previewChannels: layer.previewChannels,
        ...(layer.engine ? { engine: layer.engine } : {})
      },
      services: layer.services,
      requires: layer.requires,
      executorOrigin: install.executorOrigin || legacyExecutorOrigin(install),
      packageAssets
    });
    invalidateInstanceDeclarations(String(organizationId));
    try {
      for (const rename of plan.renamed || []) {
        await applyTypeRename(rename, organizationId);
      }
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
    } catch (error) {
      migrationError = error;
    }
  });
  if (migrationError) throw migrationError;
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

// The diff before the apply: additions, removals (drain-gated), and
// changed types through the SPEC §11 planner — uncovered breaking
// changes on types with live instances block the upgrade.
async function buildUpgradePlan(install, listing, organizationId) {
  const oldTypes = new Map((install.declarations?.types || []).map(type => [type.id, type]));
  const newTypes = new Map((listing.declarations?.types || []).map(type => [type.id, type]));
  const renameSuccessors = new Map(
    [...newTypes.values()].filter(type => type.renameFrom).map(type => [type.renameFrom, type])
  );
  const successorIds = new Set([...renameSuccessors.values()].map(type => type.id));

  const added = [...newTypes.keys()]
    .filter(id => !oldTypes.has(id) && !successorIds.has(id))
    .map(id => typeSummary(newTypes.get(id)));
  const removed = [];
  const changed = [];
  const blocked = [];
  const renamed = [];

  for (const [id, oldType] of oldTypes) {
    const instances = await countInstancesOfType(id, organizationId);
    if (!newTypes.has(id)) {
      const successor = renameSuccessors.get(id);
      if (successor) {
        renamed.push({ from: id, to: successor.id, instances });
        const successorInstances = await countInstancesOfType(successor.id, organizationId);
        const plan = planTypeMigration(oldType, successor);
        const total = instances + successorInstances;
        if (plan.breaking.length && total === 0) {
          changed.push({ typeId: successor.id, name: successor.name || null, instances: 0, changes: plan.diff.changes, breaking: plan.breaking, covered: true, steps: [] });
          continue;
        }
        if (plan.breaking.length && !plan.covered) {
          blocked.push({
            typeId: id,
            instances,
            reason: plan.errors.join('; ') || 'breaking change without a covering migration step'
          });
          continue;
        }
        changed.push({
          typeId: successor.id,
          name: (successor.name || oldType.name || null),
          instances: total,
          changes: plan.diff.changes,
          breaking: plan.breaking,
          covered: plan.covered,
          steps: plan.steps.map(step => ({ ...step }))
        });
        continue;
      }
      const boundBy = await findTypeReferences(organizationId, id);
      if (instances > 0) {
        blocked.push({ typeId: id, instances, reason: 'removed with live instances — delete or migrate them first' });
      } else if (boundBy.length) {
        blocked.push({
          typeId: id,
          instances,
          reason: `removed while bound by ${boundBy.map(binding => binding.name || binding.id).join(', ')} — re-author or migrate the definition first`
        });
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

  return { pluginId: install.pluginId, from: install.version, to: listing.version, added, removed, changed, renamed, blocked };
}

// Steps are one-time (SPEC §11): the persisted pin never carries `migrate`
// or `renameFrom`.
function withoutMigrateSteps(declaration = {}) {
  const next = { ...declaration };
  delete next.migrate;
  delete next.renameFrom;
  return next;
}

function assertSupportedRuntimeDeclarations(runtimes = []) {
  for (const runtime of runtimes) {
    if (runtime.language !== 'javascript') {
      throw createError({
        statusCode: 400,
        message: `Runtime language ${runtime.language} is not available for installation yet`
      });
    }
  }
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
