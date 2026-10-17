// Default plugin installs for new organizations (SPEC §Plugin
// marketplace): the facade domain — the demo deployment's exercised
// example — installs beside every new org so its types resolve from the
// first login, exactly as the pack composed for every org before the
// extraction. Installs ride the plugins feature's gated install seam
// (installFromCatalog); endpoint-mode services carry the demo
// deployment's configured executor URL (FACADE_EXECUTOR_URL). Orgs
// rewire or remove the install from the Plugins section.
import { installFromCatalog } from '../plugins/service.js';

const DEFAULT_PLUGINS = ['facade'];

function endpointsFor(base, services = []) {
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
    try {
      const listing = await db.collection('plugin_catalog').findOne({ pluginId });
      if (!listing?.declarations?.types?.length) {
        // A fresh environment without its built-ins seeded: the catalog
        // is empty and orgs would silently lose their default plugins.
        // Say it — the seed runbook is scripts/seed-plugin-catalog.js.
        console.error(`[Default Plugins] ${pluginId} is not in the catalog — run server/scripts/seed-plugin-catalog.js`);
        continue;
      }
      await installFromCatalog({
        organizationId,
        pluginId,
        endpoints: endpointsFor(process.env.FACADE_EXECUTOR_URL, listing.declarations.services || [])
      });
    } catch (error) {
      if (error?.statusCode === 409) continue;
      throw error;
    }
  }
}
