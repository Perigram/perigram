import { defineEventHandler, getRouterParam } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import * as service from '~/server/features/process-definitions/service.js';

// Activation carries no request payload: the migration decision is a
// declaration on the definition (see the Apply migration contract in the
// feature README), and everything else activation needs is server-derived.
export default defineEventHandler(async (event) => {
  return await service.activate(getRouterParam(event, 'id'), requireAuth(event));
});
