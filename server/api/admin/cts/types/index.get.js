import { requireAuth } from '~/server/utils/permissions';
import { describeOrganizationTypes } from '~/server/features/cts-types/service.js';

// Compiled CTS view of one organization: system types (strangler-converted
// from the domain packs) overlaid with the org's authored declarations,
// plus payload-trait data and compile diagnostics. Read by the designer
// types pane and the language tester.
export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const { bundle, attachmentKinds } = await describeOrganizationTypes(auth.organizationId);
  return {
    success: bundle.ok,
    errors: bundle.errors,
    registry: {
      source: '@perigram/cts org view',
      typeCount: bundle.types.length
    },
    attachmentKinds,
    types: bundle.types
  };
});
