import { defineEventHandler, readBody } from 'h3';
import * as organizationsService from '../../features/organizations/service.js';
import { requireAuth } from '../../utils/permissions.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const body = await readBody(event);
  const org = await organizationsService.create(body, auth);
  return org.toJSON();
});