import { defineEventHandler, getRouterParam } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import * as service from '~/server/features/process-definitions/service.js';

// The migration decision remains a declaration on the definition.
export default defineEventHandler(async (event) => {
  return await service.activate(getRouterParam(event, 'id'), requireAuth(event));
});
