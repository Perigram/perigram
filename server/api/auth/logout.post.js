import { defineEventHandler, parseCookies, deleteCookie } from 'h3';
import * as usersService from '~/server/features/users/service';

export default defineEventHandler(async (event) => {
  const cookie = parseCookies(event);
  const sessionId = cookie.sessionId;
  
  if (sessionId) {
    await usersService.logout(sessionId);
  }
  
  deleteCookie(event, 'sessionId');
  
  return { success: true };
});