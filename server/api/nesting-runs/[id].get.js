import { defineEventHandler, getRouterParam } from 'h3';
import { requireAuth } from '../../utils/permissions.js';
import * as nestingRunsService from '../../features/nesting-runs/service.js';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  return await nestingRunsService.getById(getRouterParam(event, 'id'));
});
