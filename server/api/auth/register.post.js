import { defineEventHandler, readBody, createError } from 'h3';
import * as usersService from '../../features/users/service.js';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);

    if (!body?.email || !body?.password || !body?.name) {
      throw createError({ statusCode: 400, message: 'Missing required fields' });
    }

    // Registration creates the account only. Organizations are joined by
    // invitation or created from the profile page after signing in.
    const user = await usersService.register({
      name: body.name,
      email: body.email,
      password: body.password
    });

    return {
      success: true,
      userId: user._id
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
