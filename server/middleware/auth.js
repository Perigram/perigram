import { defineEventHandler, parseCookies, getHeader } from 'h3';
import { verifyAccessToken } from '~/server/utils/auth-helpers';
import { getUserBySessionId } from '~/server/features/users/service';
import * as usersRepository from '~/server/features/users/repository';

export default defineEventHandler(async (event) => {
  // Try JWT from Authorization header first
  const authHeader = getHeader(event, 'authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const payload = verifyAccessToken(token); // { userId }
      
      // FETCH USER FRESH (permissions may have changed)
      const user = await usersRepository.findById(payload.userId);
      if (user && user.isActive) {
        event.context.auth = {
          userId: user._id.toString(),
          organizationId: user.organizationId?.toString(),
          role: user.role,
          permissions: user.permissions,
          restrictedTo: user.restrictedTo
        };
      }
      return;
    } catch {
      // Token invalid, try cookie
    }
  }
  
  // Fallback to session cookie
  const cookie = parseCookies(event);
  const sessionId = cookie.sessionId;
  if (sessionId) {
    const user = await getUserBySessionId(sessionId);
    if (user && user.isActive) {
      event.context.auth = {
        userId: user._id.toString(),
        organizationId: user.organizationId?.toString(),
        role: user.role,
        permissions: user.permissions,
        restrictedTo: user.restrictedTo
      };
    }
  }
});