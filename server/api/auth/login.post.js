import { defineEventHandler, readBody, setCookie, createError } from 'h3';
import * as usersService from '../../features/users/service.js';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  if (!body?.email || !body?.password) {
    throw createError({ statusCode: 400, message: 'Missing credentials' });
  }

  const { email, password } = body;
  
  try {
    const result = await usersService.login(email, password);
    
    setCookie(event, 'sessionId', result.sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60
    });
    
    return {
      user: result.user.toJSON(),
      accessToken: result.accessToken
    };
  } catch (err) {
    if (err.statusCode) throw err;
    throw createError({ 
      statusCode: 500, 
      message: `Internal Server Error: ${err.message}`, 
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined 
    });
  }
});