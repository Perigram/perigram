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
import { invalidateInstanceDeclarations } from '../instances/service.js';
import { ensureInstanceIndexes } from '../instances/indexes.js';
import { countInstancesOfType } from '../instances/count.js';
import { applyTypeMigrationSteps } from '../instances/migrations.js';
import { planTypeMigration } from '~/packages/cts/src/index.js';
import { findTypeReferences } from '../process-definitions/service.js';
import { publishOrgContractChanged } from '../instance-events/service.js';
import { hasPermission } from '../../utils/auth-helpers.js';
import { enqueueTask } from '../../core/tasks/service.js';
import { composePackServices, composePackDomains, composePackAttachmentKinds, orderedMountedPacks } from '~/server/packs/declarations.js';
import { parseListing, normalizeListing } from '#packages/plugin-sdk/src/listing.js';
import { isSupportedSurfaceContract } from '#shared/plugin-surfaces.js';

function packById(packId) {
  return orderedMountedPacks().find(pack => pack.id === String(packId)) || null;
}

// Connector command ids: plugin.<pluginId>.<serviceId>; the install's
// claim queue is plugin.<pluginId>@<organizationId>.
const PLUGIN_COMMAND_PATTERN = /^plugin\.([a-z0-9-]+)\.([a-z0-9-]+)$/;

export async function listCatalog() {
  const listings = await repository.listCatalog();
  return listings.map(serializeListing);
}

// Platform-side publishing (the publish API's body): one parser with the
// install gate — @perigram/plugin-sdk's listing contract — and the
// normalized catalog document the install snapshots.
export async function publishListing(listing = {}) {
  const normalized = normalizeListing(listing);
  await repository.upsertCatalogListing({ ...normalized, publishedAt: new Date() });
  return serializeListing(normalized);
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

  const listing = await repository.findCatalogByPluginId(pluginId);
  if (!listing) throw createError({ statusCode: 404, message: 'Plugin not found' });
  if (await repository.findInstall(organizationId, pluginId)) {
    throw createError({ statusCode: 409, message: 'Plugin already installed' });
  }
  const layer = parseListingOr400(listing);
  const { types, services, editors, attachmentKinds, conversions, constructions, exports: exportBindings, surfaces, requires } = layer;
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
  // The plugin's packs must exist and stay enabled under it — a disabled
  // requirement would strand the plugin's types the same way a disabled
  // dependent pack would.
  const disabledPacks = new Set(await repository.listDisabledPacks(organizationId).catch(() => []));
  for (const packId of requires) {
    if (!packById(packId)) {
      throw createError({ statusCode: 400, message: `Plugin requires unknown pack ${packId}` });
    }
    if (disabledPacks.has(packId)) {
      throw createError({ statusCode: 400, message: `Plugin requires pack ${packId}, which is disabled for this organization — enable it first` });
    }
  }
  // Attachment kinds are global upload vocabulary: a kind id held by an
  // enabled pack or another installed plugin is not claimable.
  const heldKinds = composePackAttachmentKinds(orderedMountedPacks().filter(pack => !disabledPacks.has(pack.id)));
  for (const install of await repository.listInstallsByOrganization(organizationId)) {
    for (const kind of Object.keys(install.declarations?.attachmentKinds || {})) {
      if (heldKinds[kind]) {
        throw createError({ statusCode: 400, message: `Attachment kind ${kind} is already claimed — refusing the install` });
      }
      heldKinds[kind] = `plugin ${install.pluginId}`;
    }
  }
  for (const kind of Object.keys(attachmentKinds)) {
    if (heldKinds[kind]) {
      throw createError({ statusCode: 400, message: `Attachment kind ${kind} is already declared by ${heldKinds[kind]} — plugin attachment kinds must not collide` });
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

  await repository.createInstall({
    organizationId: String(organizationId),
    pluginId: String(listing.pluginId),
    name: listing.name || listing.pluginId,
    version: listing.version || '1',
    declarations: { types, editors, attachmentKinds, conversions, constructions, exports: exportBindings, surfaces },
    services,
    requires,
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

// Block until drained: live instances of any plugin type — or live
// process definitions binding one — refuse the removal. There is no
// abandon path; the org deletes or migrates the data first.
export async function uninstall({ organizationId, pluginId, auth = {} }) {
  assertSameOrganization(organizationId, auth);
  assertOrganizationPermission(auth, 'admin');

  const install = await repository.findInstall(organizationId, pluginId);
  if (!install) throw createError({ statusCode: 404, message: 'Plugin is not installed' });
  const blocked = [];
  for (const type of install.declarations?.types || []) {
    const [instances, boundBy] = await Promise.all([
      countInstancesOfType(type.id, organizationId),
      findTypeReferences(organizationId, type.id)
    ]);
    if (instances > 0 || boundBy.length) {
      blocked.push({
        typeId: type.id,
        instances,
        boundBy: boundBy.map(binding => binding.name || binding.id)
      });
    }
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

  await repository.deleteInstall(organizationId, pluginId);
  invalidateInstanceDeclarations(String(organizationId));
  const after = await compileRegistryForOrganization(organizationId);
  await ensureInstanceIndexes(after.resolveView(organizationId));
  publishOrgContractChanged(String(organizationId), 'registry', {
    pluginId: String(pluginId),
    removed: true
  });
  return { removed: true };
}

function serializeListing(listing = {}) {
  return {
    pluginId: listing.pluginId,
    name: listing.name || listing.pluginId,
    description: listing.description || '',
    version: listing.version || '1',
    requires: listing.requires || [],
    types: (listing.declarations?.types || []).map(typeSummary),
    services: (listing.declarations?.services || []).map(serviceSummary),
    editors: (listing.declarations?.editors || []).map(editor => ({ type: editor.type, surface: editor.surface })),
    attachmentKinds: Object.keys(listing.declarations?.attachmentKinds || {}),
    conversions: (listing.declarations?.conversions || []).map(conversion => ({ id: conversion.id, label: conversion.label || conversion.id }))
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

// The plugin's connection settings: per-service endpoints for
// endpoint-mode services, and the API key sent to the publisher's
// executor when calling them.
export async function settingsFor({ organizationId, pluginId, auth = {} }) {
  assertSameOrganization(organizationId, auth);
  assertOrganizationPermission(auth, 'admin');
  const install = await repository.findInstall(organizationId, pluginId);
  if (!install) throw createError({ statusCode: 404, message: 'Plugin is not installed' });
  const endpoints = install.endpoints || {};
  return {
    pluginId: install.pluginId,
    authToken: install.authToken || null,
    services: (install.services || []).map(service => ({
      id: service.id,
      label: serviceSummary(service).label,
      mode: serviceModeOf(service),
      endpoint: endpoints[service.id] || null
    }))
  };
}

export async function updateSettings({ organizationId, pluginId, endpoints = {}, authToken = null, auth = {} }) {
  assertSameOrganization(organizationId, auth);
  assertOrganizationPermission(auth, 'admin');
  const install = await repository.findInstall(organizationId, pluginId);
  if (!install) throw createError({ statusCode: 404, message: 'Plugin is not installed' });
  const serviceById = new Map((install.services || []).map(service => [service.id, service]));
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
  await repository.updateSettings(organizationId, pluginId, {
    endpoints: configured,
    authToken: authToken ? String(authToken) : null
  });
  return settingsFor({ organizationId, pluginId, auth });
}

// Service-species records for the projected domain: the palette,
// compiler, and designer treat them exactly like pack services. The
// command id and service id are the same plugin-qualified id.
export async function servicesForOrganization(organizationId) {
  const installs = await repository.listInstallsByOrganization(organizationId);
  const services = [];
  for (const install of installs) {
    for (const service of install.services || []) {
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
export async function packServicesForOrganization(organizationId) {
  const disabled = new Set(await repository.listDisabledPacks(organizationId).catch(() => []));
  const packs = orderedMountedPacks().filter(pack => !disabled.has(pack.id));
  return [...composePackServices(packs), ...await servicesForOrganization(organizationId)];
}

// The projected-domain pack slices for an organization: enabled packs,
// with installed plugins' construction contracts merged beside them (the
// listing's service-backed constructions are the plugin layer of the same
// domain vocabulary).
export async function packDomainsForOrganization(organizationId) {
  const disabled = new Set(await repository.listDisabledPacks(organizationId).catch(() => []));
  const merged = composePackDomains(orderedMountedPacks().filter(pack => !disabled.has(pack.id)));
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
    // command runtime agree on this shape).
    for (const service of install.services || []) {
      if (!service?.id) continue;
      const commandId = `plugin.${install.pluginId}.${service.id}`;
      merged.commands[commandId] = { id: commandId, service: `plugin.${install.pluginId}`, action: 'run', plugin: true };
    }
  }
  return merged;
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

// Attachment export bindings (installed plugins): the plugin services that
// generate exportable artifacts for the plugin's own types.
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

// The org's artifact conversion catalog (installed plugins): the listing
// entries, plugin-owned. The convertArtifact command resolves its catalog
// through this — no pack code supplies conversions. Bare service refs are
// qualified to the owning install's command id.
export async function conversionsForOrganization(organizationId) {
  const installs = organizationId ? await repository.listInstallsByOrganization(organizationId) : [];
  const conversions = [];
  for (const install of installs) {
    for (const conversion of install.declarations?.conversions || []) {
      if (conversion?.id && Array.isArray(conversion.sourceKinds) && conversion.target) {
        conversions.push({
          ...conversion,
          ...(conversion.service
            ? { service: String(conversion.service).includes('.')
              ? conversion.service
              : `plugin.${install.pluginId}.${conversion.service}` }
            : {})
        });
      }
    }
  }
  return conversions;
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
        body: JSON.stringify(parameters ?? null),
        signal: AbortSignal.timeout(60000)
      });
    } catch (error) {
      if (error?.name === 'TimeoutError') {
        throw createError({ statusCode: 504, message: `Service ${serviceId} endpoint timed out` });
      }
      throw createError({ statusCode: 502, message: `Service ${serviceId} endpoint failed: ${error?.message || error}` });
    }
    if (!response.ok) {
      const body = await response.text();
      throw createError({ statusCode: 502, message: `Service ${serviceId} endpoint failed: ${body || response.statusText}` });
    }
    return await response.json();
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

// --- Mounted-pack enablement (the facade extraction's management plane):
// packs compose for an org unless a disablement record exists; enabling
// cascades over requirements, disabling is drain-gated by instances,
// process bindings, a trial compose without the pack, and enabled
// dependents ---

export async function listPackState({ organizationId, auth = {} }) {
  assertSameOrganization(organizationId, auth);
  assertOrganizationPermission(auth, 'read');
  const disabled = new Set(await repository.listDisabledPacks(organizationId));
  const installs = await repository.listInstallsByOrganization(organizationId);
  return orderedMountedPacks().map(pack => ({
    pluginId: pack.id,
    name: pack.label || pack.id,
    pack: true,
    enabled: !disabled.has(pack.id),
    types: (pack.types || []).map(type => ({ id: type.id, name: type.name || null, class: type.class || null })),
    services: (pack.services || []).map(service =>
      ({ id: service.id, label: service.render?.label || service.label || service.id }))
  })).concat(installs.map(install => ({ ...serializeInstall(install), pack: false, enabled: true })));
}

export async function enablePack({ organizationId, packId, auth = {} }) {
  assertSameOrganization(organizationId, auth);
  assertOrganizationPermission(auth, 'admin');
  const target = packById(packId);
  if (!target) throw createError({ statusCode: 404, message: 'Unknown pack' });
  // Enabling cascades: requirements come back with the pack.
  const disabled = new Set(await repository.listDisabledPacks(organizationId));
  const toEnable = [];
  const collect = pack => {
    if (!disabled.has(pack.id) || toEnable.includes(pack.id)) return;
    toEnable.push(pack.id);
    for (const requirement of pack.requires || []) collect(packById(requirement));
  };
  collect(target);
  for (const id of toEnable) await repository.enablePack(organizationId, id);
  invalidateInstanceDeclarations(String(organizationId));
  publishOrgContractChanged(String(organizationId), 'registry', { packId: String(packId), enabled: true });
  return { packId: String(packId), enabled: true, enabledPacks: toEnable };
}

export async function disablePack({ organizationId, packId, auth = {} }) {
  assertSameOrganization(organizationId, auth);
  assertOrganizationPermission(auth, 'admin');
  const target = packById(packId);
  if (!target) throw createError({ statusCode: 404, message: 'Unknown pack' });
  const disabled = new Set(await repository.listDisabledPacks(organizationId));
  if (disabled.has(packId)) {
    throw createError({ statusCode: 409, message: 'Pack is already disabled' });
  }
  // An enabled dependent keeps the requirement alive.
  for (const pack of orderedMountedPacks()) {
    if (disabled.has(pack.id)) continue;
    if ((pack.requires || []).includes(target.id)) {
      throw createError({
        statusCode: 409,
        message: `Pack ${target.id} is required by enabled pack ${pack.id} — disable it first`
      });
    }
  }
  // An installed plugin requiring the pack keeps it alive too — its types
  // resolve against the pack's declarations the same way a dependent
  // pack's do.
  for (const install of await repository.listInstallsByOrganization(organizationId)) {
    if ((install.requires || []).includes(target.id)) {
      throw createError({
        statusCode: 409,
        message: `Pack ${target.id} is required by installed plugin ${install.pluginId} — uninstall it first`
      });
    }
  }
  // Drain: live instances or process bindings on any pack type refuse.
  const blocked = [];
  for (const type of target.types || []) {
    const [instances, boundBy] = await Promise.all([
      countInstancesOfType(type.id, organizationId),
      findTypeReferences(organizationId, type.id)
    ]);
    if (instances > 0 || boundBy.length) {
      blocked.push({ typeId: type.id, instances, boundBy: boundBy.map(binding => binding.name || binding.id) });
    }
  }
  if (blocked.length) {
    const detail = blocked.map(entry =>
      entry.instances > 0
        ? `${entry.typeId}: ${entry.instances} instance(s)`
        : `${entry.typeId}: bound by ${entry.boundBy.join(', ')}`
    ).join('; ');
    throw createError({
      statusCode: 409,
      message: `Pack types still have live data (${detail}) — delete or migrate it first`,
      data: { blocked }
    });
  }
  // Trial compose without the pack: org-authored declarations referencing
  // pack types would wedge the view — refuse before writing anything.
  const trial = await compileRegistryForOrganization(organizationId, {
    disabledPackIds: new Set([...disabled, target.id])
  });
  const compiled = trial.compile(organizationId);
  if (!compiled.ok) {
    throw createError({
      statusCode: 409,
      message: `Disabling pack ${target.id} breaks the organization view: ${compiled.errors.join('; ')}`
    });
  }
  await repository.disablePack(organizationId, target.id, auth.userId);
  invalidateInstanceDeclarations(String(organizationId));
  publishOrgContractChanged(String(organizationId), 'registry', { packId: String(packId), enabled: false });
  return { packId: String(packId), enabled: false };
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
  // The upgraded pin's pack requirements must still hold, and its
  // attachment kinds must stay claimable — the same laws the install gate
  // enforces, re-checked against the world as it is now.
  const disabledPacks = new Set(await repository.listDisabledPacks(organizationId).catch(() => []));
  for (const packId of layer.requires) {
    if (!packById(packId) || disabledPacks.has(packId)) {
      throw createError({ statusCode: 409, message: `Upgrade requires pack ${packId}, which is not mounted or is disabled` });
    }
  }
  const heldKinds = composePackAttachmentKinds(orderedMountedPacks().filter(pack => !disabledPacks.has(pack.id)));
  for (const other of await repository.listInstallsByOrganization(organizationId)) {
    if (String(other.pluginId) === String(install.pluginId)) continue;
    for (const kind of Object.keys(other.declarations?.attachmentKinds || {})) {
      heldKinds[kind] = `plugin ${other.pluginId}`;
    }
  }
  for (const kind of Object.keys(layer.attachmentKinds)) {
    if (heldKinds[kind]) {
      throw createError({ statusCode: 409, message: `Upgrade declares attachment kind ${kind} already held by ${heldKinds[kind]}` });
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
      attachmentKinds: layer.attachmentKinds,
      conversions: layer.conversions,
      constructions: layer.constructions,
      exports: layer.exports,
      surfaces: layer.surfaces
    },
    services: layer.services,
    requires: layer.requires
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
