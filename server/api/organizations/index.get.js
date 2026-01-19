import { defineEventHandler, getQuery } from 'h3';
import * as organizationsService from '~/server/features/organizations/service';
import { requireAuth } from '~/server/utils/permissions';

export default defineEventHandler(async (event) => {
  const user = requireAuth(event);
  const query = getQuery(event);
  return await organizationsService.list(user, query);
});