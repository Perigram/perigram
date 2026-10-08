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
import * as repository from './repository.js';
import { compileRegistryForOrganization } from '../cts-types/service.js';
import { invalidateInstanceDeclarations } from '../instances/service.js';
import { ensureInstanceIndexes } from '../instances/indexes.js';
import { countInstancesOfType } from '../instances/count.js';
import { findTypeReferences } from '../process-definitions/service.js';
import { publishOrgContractChanged } from '../instance-events/service.js';
import { hasPermission } from '../../utils/auth-helpers.js';

export async function listCatalog() {
  const listings = await repository.listCatalog();
  return listings.map(serializeListing);
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
    declarations: { types }
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
    types: types.map(typeSummary)
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
    types: (listing.declarations?.types || []).map(typeSummary)
  };
}

function serializeInstall(install = {}) {
  return {
    pluginId: install.pluginId,
    name: install.name || install.pluginId,
    version: install.version || '1',
    installedAt: install.installedAt,
    types: (install.declarations?.types || []).map(typeSummary)
  };
}

function typeSummary(type = {}) {
  return { id: type.id, label: type.label || null, class: type.class || null };
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
