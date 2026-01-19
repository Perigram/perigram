import { defineEventHandler } from 'h3';
import { requireAuth } from '~/server/utils/permissions';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  return event.context.auth;
});