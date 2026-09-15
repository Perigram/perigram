import { defineEventHandler, readBody, createError } from 'h3';
import * as usersService from '../../features/users/service.js';
import * as organizationsService from '../../features/organizations/service.js';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    
    if (!body?.email || !body?.password || !body?.name) {
      throw createError({ statusCode: 400, message: 'Missing required fields' });
    }

    const organizationName = body.organizationName || body.organization?.name;
    let recoveredExistingUser = false;
    let user;

    try {
      user = await usersService.register(body, null, null, null, null);
    } catch (err) {
      if (err.statusCode !== 409 || !organizationName) throw err;
      user = await usersService.recoverSignupWithoutOrganization(body.email, body.password);
      recoveredExistingUser = true;
    }

    const organization = organizationName
      ? await organizationsService.createInitialForUser(user.id, {
        name: organizationName
      })
      : null;
    
    return { 
      success: true, 
      userId: user._id,
      organizationId: organization?._id || null,
      recoveredExistingUser
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
