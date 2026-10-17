// Default plugin installs for new organizations (SPEC §Plugin
// marketplace): the demo deployment's exercised plugins install beside
// every new org so their types resolve from the first login — tech-drawing
// (the retired pack, owner decision 2026-10-17) before the facade, whose
// `requires` names it. Installs ride the plugins feature's gated install
// seam (installFromCatalog); endpoint-mode services carry the deployment's
// configured executor URLs and surface-bearing plugins their surface
// origin. Orgs rewire or remove the installs from the Plugins section.
import { installFromCatalog } from '../plugins/service.js';

// tech-drawing first: the facade listing requires it (plugin-on-plugin
// requires), and install order is the default-install chain's order.
const DEFAULT_PLUGINS = ['tech-drawing', 'documents', 'facade'];

// Endpoint-mode services under one base URL (the demo deployment's
// executor wiring).
function endpointsFor(base, services = []) {
  const endpoints = {};
  for (const service of services) {
    if (service?.mode === 'endpoint' && service.id && base) {
      endpoints[service.id] = `${base.replace(/\/+$/, '')}/${service.id}`;
    }
  }
  return endpoints;
}

// The demo deployment's executor connections.
function connectionFor(pluginId, services = []) {
  if (pluginId === 'tech-drawing') {
    // Declarations-only plugin: no services, the executor serves its
    // editor surface module — the module proxy loads from the surface
    // origin.
    const origin = process.env.TECH_DRAWING_EXECUTOR_URL || 'http://tech-drawing-executor:8792';
    return { surfaceOrigin: origin };
  }
  if (pluginId === 'documents') {
    const base = process.env.DOCUMENTS_EXECUTOR_URL || 'http://documents-executor:8791';
    return { endpoints: endpointsFor(base, services) };
  }
  if (pluginId === 'facade') {
    return { endpoints: endpointsFor(process.env.FACADE_EXECUTOR_URL, services) };
  }
  return {};
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
        ...connectionFor(pluginId, listing.declarations.services || [])
      });
    } catch (error) {
      if (error?.statusCode === 409) continue;
      throw error;
    }
  }
}
