import { defineEventHandler, readBody } from 'h3';
import * as usersService from '~/server/features/users/service';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  
  // For now, open registration (add invitation tokens later)
  const user = await usersService.register(body, null, null);
  
  return { success: true, userId: user._id };
});