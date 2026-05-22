import { requireAuth } from '~/server/utils/permissions';
import { getAppRegistry } from '~/server/runtime/app-registry.js';

export default defineEventHandler((event) => {
  requireAuth(event);
  const registry = getAppRegistry();
  const domain = registry.getDomain('cnc') || registry.listDomains()[0] || null;

  return {
    success: true,
    registry: {
      id: registry.id,
      domainId: domain?.id || null,
      entityCount: registry.listEntityDefinitions().length,
      workflowCount: registry.listWorkflowDefinitions().length,
      commandCount: registry.listCommandDefinitions().length,
      taskCount: registry.listTaskDefinitions().length,
      hookCount: registry.listHookDefinitions().length,
      attachmentKindCount: registry.listAttachmentKindDefinitions().length
    },
    domain,
    entities: registry.listEntityDefinitions(),
    workflows: Object.fromEntries(registry.listWorkflowDefinitions().map(({ entityType, ...workflow }) => [entityType, workflow])),
    hooks: Object.fromEntries(registry.listHookDefinitions().map(hook => [hook.id, hook])),
    attachmentKinds: Object.fromEntries(registry.listAttachmentKindDefinitions().map(kind => [kind.kind, kind]))
  };
});
