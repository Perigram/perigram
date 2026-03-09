import { defineEventHandler } from 'h3';
import { requireAuth } from '../../utils/permissions.js';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  return event.context.auth;
});