import { defineEventHandler, readBody, setCookie } from 'h3';
import * as usersService from '~/server/features/users/service';
import { generateAccessToken } from '~/server/utils/auth-helpers';

export default defineEventHandler(async (event) => {
  const { email, password } = await readBody(event);
  
  const result = await usersService.login(email, password);
  
  // Set session cookie
  setCookie(event, 'sessionId', result.sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 // 30 days
  });
  
  // Also return JWT for API clients
  const accessToken = generateAccessToken(result.user.id);
  
  return {
    user: result.user,
    accessToken
  };
});