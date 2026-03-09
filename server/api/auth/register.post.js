import { defineEventHandler, readBody, createError } from 'h3';
import * as usersService from '../../features/users/service.js';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    
    if (!body?.email || !body?.password || !body?.name) {
      throw createError({ statusCode: 400, message: 'Missing required fields' });
    }

    const user = await usersService.register(body, null, null, null, null);
    
    return { 
      success: true, 
      userId: user.id || user._id 
    };
  } catch (err) {
    if (err.statusCode) throw err;
    throw createError({
      statusCode: 500,
      message: `Registration failed: ${err.message}`,
      stack: err.stack
    });
  }
});