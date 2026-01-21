import { defineEventHandler, parseCookies, getHeader } from 'h3';
import { verifyAccessToken } from '~/server/utils/auth-helpers';
import { getUserBySessionId } from '~/server/features/users/service';
import * as usersRepository from '~/server/features/users/repository';
import * as organizationsRepository from '~/server/features/organizations/repository';

export default defineEventHandler(async (event) => {
  let user = null;

  // 1. Try JWT from Authorization header first
  const authHeader = getHeader(event, 'authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const payload = verifyAccessToken(token); // { userId }
      
      // Validate userId before lookup
      if (payload && payload.userId && /^[0-9a-fA-F]{24}$/.test(payload.userId)) {
        // FETCH USER FRESH (permissions may have changed)
        user = await usersRepository.findById(payload.userId);
      }
    } catch (err) {
      // Token invalid or user not found, ignore and try cookie
      console.warn('Auth middleware: JWT verification failed:', err.message);
    }
  }
  
  // 2. Fallback to session cookie
  if (!user) {
    const cookie = parseCookies(event);
    const sessionId = cookie.sessionId;
    if (sessionId) {
      try {
        user = await getUserBySessionId(sessionId);
      } catch (err) {
        console.warn('Auth middleware: Session verification failed:', err.message);
      }
    }
  }

  // 3. Populate Context if user found
  if (user && user.isActive) {
    const authContext = {
      userId: user._id.toString(),
      organizationId: user.organizationId?.toString(),
      role: user.role,
      permissions: user.permissions,
      memberships: user.memberships || [],
      restrictedTo: user.restrictedTo
    };

    // Attach Organization Data if available
    // Critical for permission checks in services (Manufacturer vs Contractor logic)
    if (user.organizationId) {
      const org = await organizationsRepository.findById(user.organizationId);
      if (org) {
        authContext.organizationData = {
          _id: org._id.toString(),
          name: org.name,
          type: org.type
        };
      }
    }

    event.context.auth = authContext;
  }
});
