import { createCutkitRegistry, registerServiceActionHandler } from '~/server/core/blocks/index.js';
import { cncDomain } from '~/packages/domain-cnc/src/index.js';
import { saveCassetteTemplate } from '~/server/features/cassettes/operations.js';
import { solveNesting } from '~/server/features/nesting/operations.js';
import { generateArtifact } from '~/server/features/artifacts/operations.js';
import { hooks } from '~/server/core/machines/hooks.js';

export function bindCncDomainAdapter(registry) {
  if (!registry) throw new Error('CNC domain adapter requires a registry');
  registry.defineDomain(cncDomain);
  registry.registerServiceActionHandler('saveCassetteTemplate', saveCassetteTemplate);
  registry.registerServiceActionHandler('solveNesting', solveNesting);
  registry.registerServiceActionHandler('generateArtifact', generateArtifact);
  for (const [hookId, handler] of Object.entries(hooks)) registry.registerHookHandler(hookId, handler);
  return registry;
}

export function registerCncDomainAdapter(registry = null) {
  if (registry) return bindCncDomainAdapter(registry);
  const compatRegistry = createCutkitRegistry({ id: 'cnc-compat' });
  bindCncDomainAdapter(compatRegistry);
  registerServiceActionHandler('saveCassetteTemplate', saveCassetteTemplate);
  registerServiceActionHandler('solveNesting', solveNesting);
  registerServiceActionHandler('generateArtifact', generateArtifact);
  return cncDomain;
}

registerCncDomainAdapter();
