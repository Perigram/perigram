import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import * as organizationsService from '~/server/features/organizations/service.js';

export default defineEventHandler(async event =>
  organizationsService.createRole(getRouterParam(event, 'id'), await readBody(event), await requireAuth(event))
);
