import { defineEventHandler, readBody, createError } from 'h3';
import * as usersService from '../../features/users/service.js';
import * as organizationsService from '../../features/organizations/service.js';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    
    if (!body?.email || !body?.password || !body?.name) {
      throw createError({ statusCode: 400, message: 'Missing required fields' });
    }

    const user = await usersService.register(body, null, null, null, null);
    const organizationName = body.organizationName || body.organization?.name;
    const organizationType = body.organizationType || body.organization?.type || 'Contractor';
    const organization = organizationName
      ? await organizationsService.createInitialForUser(user.id, {
        name: organizationName,
        type: organizationType
      })
      : null;
    
    return { 
      success: true, 
      userId: user._id,
      organizationId: organization?._id || null
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
