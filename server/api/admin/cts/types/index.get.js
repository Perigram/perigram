import { requireLineagePermission } from '~/server/utils/permissions';
import { describeOrganizationTypes } from '~/server/features/cts-types/service.js';

// Compiled CTS view of one organization: system types (strangler-converted
// from the domain packs) overlaid with the org's authored declarations,
// payload-trait data, pack editor bindings, and compile diagnostics. Read
// by the designer types pane and the language tester.
export default defineEventHandler(async (event) => {
  const auth = requireLineagePermission(event, { organizationId: event.context.auth?.organizationId }, 'organizations', 'read');
  const { bundle, attachmentKinds, editors, surfaces, previews, previewChannels, clientEngines, clientRuntimes } = await describeOrganizationTypes(auth.organizationId);
  return {
    success: bundle.ok,
    errors: bundle.errors,
    registry: {
      source: '@perigram/cts org view',
      typeCount: bundle.types.length
    },
    attachmentKinds,
    editors,
    surfaces,
    previews,
    previewChannels,
    clientEngines,
    clientRuntimes,
    types: bundle.types
  };
});
