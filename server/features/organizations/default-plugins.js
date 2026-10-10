// Default plugin installs for new organizations (SPEC §Plugin
// marketplace): the facade domain — the demo deployment's exercised
// example — installs beside every new org so its types resolve from the
// first login, exactly as the pack composed for every org before the
// extraction. Endpoint-mode services carry the demo deployment's
// configured executor URL (FACADE_EXECUTOR_URL); orgs rewire or remove
// the install from the Plugins section.
import { randomBytes } from 'node:crypto';

const DEFAULT_PLUGINS = ['facade'];

function defaultExecutorUrl() {
  return process.env.FACADE_EXECUTOR_URL || null;
}

function endpointsFor(services = []) {
  const base = defaultExecutorUrl();
  if (!base) return {};
  const endpoints = {};
  for (const service of services) {
    if (service?.mode === 'endpoint' && service.id) {
      endpoints[service.id] = `${base.replace(/\/+$/, '')}/${service.id}`;
    }
  }
  return endpoints;
}

export async function installDefaultPlugins(db, organizationId) {
  for (const pluginId of DEFAULT_PLUGINS) {
    const existing = await db.collection('plugin_installs').findOne({
      organizationId: String(organizationId),
      pluginId
    });
    if (existing) continue;
    const listing = await db.collection('plugin_catalog').findOne({ pluginId });
    if (!listing?.declarations?.types?.length) continue;
    const services = listing.declarations.services || [];
    await db.collection('plugin_installs').insertOne({
      organizationId: String(organizationId),
      pluginId,
      name: listing.name || pluginId,
      version: listing.version || '1',
      declarations: listing.declarations,
      services,
      requires: listing.requires || [],
      endpoints: endpointsFor(services),
      connectorToken: randomBytes(24).toString('base64url'),
      installedAt: new Date(),
      defaultInstall: true
    });
  }
}
