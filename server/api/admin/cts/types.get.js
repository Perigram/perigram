import { requireAuth } from '~/server/utils/permissions';
import { cncEntities, cncWorkflows, cncContainment, cncAttachmentKinds } from '~/packages/domain-cnc/src/index.js';
import { createTypeRegistry, convertCncDomain, convertAttachmentKinds, compileClientBundle } from '~/packages/cts/src/index.js';

// Strangler endpoint (packages/cts TODO): the process designer's types pane
// reads the compiled CTS view of the live CNC domain — types, states,
// operators, render policy, and JSON Schemas in one bundle. Read-only until
// the designer authors types directly.
export default defineEventHandler((event) => {
  requireAuth(event);
  const registry = createTypeRegistry({ id: 'designer-types' });
  for (const declaration of convertCncDomain({
    entities: cncEntities,
    workflows: cncWorkflows,
    containment: cncContainment
  })) {
    registry.defineType(declaration);
  }
  const bundle = compileClientBundle(registry);
  return {
    success: bundle.ok,
    errors: bundle.errors,
    registry: { source: '@perigram/cts strangler conversion', typeCount: bundle.types.length },
    attachmentKinds: convertAttachmentKinds(cncAttachmentKinds),
    types: bundle.types
  };
});
