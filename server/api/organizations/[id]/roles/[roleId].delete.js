import { defineEventHandler, getRouterParam } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import * as organizationsService from '~/server/features/organizations/service.js';

export default defineEventHandler(async event =>
  organizationsService.deleteRole(
    getRouterParam(event, 'id'),
    getRouterParam(event, 'roleId'),
    await requireAuth(event)
  )
);
