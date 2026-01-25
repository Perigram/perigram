import { defineEventHandler, readBody, setCookie, createError } from 'h3';
import * as usersService from '~/server/features/users/service';
import { generateAccessToken } from '~/server/utils/auth-helpers';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    if (!body?.email || !body?.password) {
      throw createError({ statusCode: 400, message: 'Missing credentials' });
    }

    const { email, password } = body;
    const result = await usersService.login(email, password);
    
    setCookie(event, 'sessionId', result.sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60
    });
    
    // Also return JWT for API clients
    const accessToken = generateAccessToken(result.user.id);
    
    return {
      user: result.user,
      accessToken
    };
  } catch (err) {
    console.error('[API] Login Error:', err);
    throw err;
  }
});