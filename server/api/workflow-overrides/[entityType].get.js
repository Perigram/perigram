import { defineEventHandler, getRouterParam } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import * as workflowOverridesService from '~/server/features/workflow-overrides/service.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const entityType = getRouterParam(event, 'entityType');
  return await workflowOverridesService.getByEntity(entityType, auth);
});
