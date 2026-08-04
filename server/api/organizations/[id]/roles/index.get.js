import { defineEventHandler, getRouterParam } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import * as organizationsService from '~/server/features/organizations/service.js';

export default defineEventHandler(async event =>
  organizationsService.listRoles(getRouterParam(event, 'id'), await requireAuth(event))
);
