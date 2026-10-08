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
import { findTypeReferences } from '../process-definitions/service.js';
import { publishOrgContractChanged } from '../instance-events/service.js';
import { hasPermission } from '../../utils/auth-helpers.js';
import { enqueueTask } from '../../core/tasks/service.js';
import { composePackServices, orderedMountedPacks } from '~/server/packs/declarations.js';

// Connector command ids: plugin.<pluginId>.<serviceId>; the install's
// claim queue is plugin.<pluginId>@<organizationId>.
const PLUGIN_COMMAND_PATTERN = /^plugin\.([a-z0-9-]+)\.([a-z0-9-]+)$/;

export async function listCatalog() {
  const listings = await repository.listCatalog();
  return listings.map(serializeListing);
}

// Mounted domain packs shown as built-ins in the Plugins section: they
// ship with the platform (build-time mounts, SPEC §21), so they are
// read-only context beside the installable catalog.
export function listSystemPacks() {
  return orderedMountedPacks().map(pack => ({
    id: pack.id,
    name: pack.label || pack.id,
    types: (pack.types || []).map(typeSummary),
    services: (pack.services || []).map(service =>
      ({ id: service.id, label: service.render?.label || service.label || service.id }))
  }));
}

export async function listInstalled({ organizationId, auth = {} }) {
  assertSameOrganization(organizationId, auth);
  assertOrganizationPermission(auth, 'read');
  const installs = await repository.listInstallsByOrganization(organizationId);
  return installs.map(serializeInstall);
}

export async function install({ organizationId, pluginId, auth = {} }) {
  assertSameOrganization(organizationId, auth);
  assertOrganizationPermission(auth, 'admin');

  const listing = await repository.findCatalogByPluginId(pluginId);
  if (!listing) throw createError({ statusCode: 404, message: 'Plugin not found' });
  if (await repository.findInstall(organizationId, pluginId)) {
    throw createError({ statusCode: 409, message: 'Plugin already installed' });
  }
  const types = listing.declarations?.types || [];
  if (!types.length) throw createError({ statusCode: 400, message: 'Plugin declares no types' });
  const services = (listing.declarations?.services || []).filter(service => service?.id && service?.signature);
  for (const service of services) {
    if (!PLUGIN_COMMAND_PATTERN.test(`plugin.${listing.pluginId}.${service.id}`)) {
      throw createError({ statusCode: 400, message: `Plugin service id ${service.id} is not a slug` });
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
    declarations: { types },
    services,
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
    throw createError({
      statusCode: 409,
      message: 'Plugin types still have live data — delete or migrate it first',
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
    types: (listing.declarations?.types || []).map(typeSummary),
    services: (listing.declarations?.services || []).map(serviceSummary)
  };
}

function serializeInstall(install = {}) {
  return {
    pluginId: install.pluginId,
    name: install.name || install.pluginId,
    version: install.version || '1',
    installedAt: install.installedAt,
    types: (install.declarations?.types || []).map(typeSummary),
    services: (install.services || []).map(serviceSummary)
  };
}

function typeSummary(type = {}) {
  return { id: type.id, label: type.label || null, class: type.class || null };
}

function serviceSummary(service = {}) {
  return { id: service.id, label: service.render?.label || service.label || service.id };
}

function mintConnectorToken() {
  return randomBytes(24).toString('base64url');
}

// --- Connector services (marketplace SPEC: services execute on external
// executors through the worker claim protocol) ---

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
// pack services plus the organization's installed plugin services.
export async function packServicesForOrganization(organizationId) {
  return [...composePackServices(), ...await servicesForOrganization(organizationId)];
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

export async function regenerateConnectorToken({ organizationId, pluginId, auth = {} }) {
  assertSameOrganization(organizationId, auth);
  assertOrganizationPermission(auth, 'admin');
  const install = await repository.findInstall(organizationId, pluginId);
  if (!install) throw createError({ statusCode: 404, message: 'Plugin is not installed' });
  const token = mintConnectorToken();
  await repository.setConnectorToken(organizationId, pluginId, token);
  return { pluginId: install.pluginId, token };
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
