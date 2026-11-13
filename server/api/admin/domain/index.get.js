import { requireAuth } from '~/server/utils/permissions';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import { projectDomainFromView } from '~/packages/cts/src/index.js';
import { projectedDomainsForOrganization } from '~/server/features/plugins/service.js';
import { projectedServicesForOrganization } from '~/server/features/plugins/service.js';
import { compileRegistryForOrganization } from '~/server/features/cts-types/service.js';
import { projectEntityProcessCapabilities } from '~/packages/processes/src/index.js';

function resolveOrganizationId(auth = {}) {
  return auth.organizationId || auth.memberships?.[0]?.organizationId || null;
}

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const registry = getAppRegistry();

  // The domain served here is the caller's projected registry view — the
  // same single source the designer and the compiler consume (SPEC §19
  // after the cut). The mounted pack domain contributes only operator
  // contracts, the block vocabulary, and UI metadata; its legacy entity
  // tables are not projected.
  const organizationId = resolveOrganizationId(auth);
  const view = await compileRegistryForOrganization(organizationId);
  const domain = projectDomainFromView(view, organizationId, await projectedDomainsForOrganization(organizationId), {
    packServices: await projectedServicesForOrganization(organizationId)
  });

  // Resolver-aware bindings: every entity in the projected view resolves
  // through getInstanceService (explicit framework services AND the generic
  // instance services for pack/org types — SPEC §13).
  const bindings = {};
  for (const entity of domain?.entities || []) {
    const service = registry.getInstanceService(entity.type);
    if (!service) continue;
    bindings[entity.type] = {
      list: service.processList,
      getById: service.processGetById,
      processUpdate: service.processUpdate,
      delete: service.processCapabilities?.delete,
      archive: service.processCapabilities?.archive,
      constructionHandlers: service.constructionHandlers
    };
  }

  return {
    success: true,
    registry: {
      id: registry.id,
      domainId: 'framework',
      entityCount: (domain?.entities || []).length,
      workflowCount: Object.keys(domain?.workflows || {}).length,
      commandCount: registry.listCommandDefinitions().length,
      taskCount: registry.listTaskDefinitions().length
    },
    domain,
    entities: domain?.entities || [],
    workflows: domain?.workflows || {},
    processCapabilities: projectEntityProcessCapabilities(domain, bindings),
    // The one service list (mounted packs + installed plugins) and the
    // command definitions — the designer consumes these instead of
    // importing pack modules.
    services: await projectedServicesForOrganization(organizationId),
    commands: registry.listCommandDefinitions()
  };
});
