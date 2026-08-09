import { defineEventHandler, parseCookies, getHeader } from 'h3';
import { verifyAccessToken } from '../utils/auth-helpers.js';
import { getUserBySessionId } from '../features/users/service.js';
import * as usersRepository from '../features/users/repository.js';
import * as organizationsRepository from '../features/organizations/repository.js';
import { resolveProcessAuth } from '../features/process-definitions/runtime.js';
import { User } from '../features/users/model.js';

export default defineEventHandler(async (event) => {
  let user = null;

  // 1. Try JWT from Authorization header first
  const authHeader = getHeader(event, 'authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const payload = verifyAccessToken(token); // { userId }
      if (payload?.userId) {
        const raw = await usersRepository.findById(payload.userId);
        if (raw) user = new User(raw);
      }
    } catch (err) {
      console.warn('[AUTH] JWT failed:', err.message);
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
        console.warn('[AUTH] Session failed:', err.message);
      }
    }
  }

  // 3. Populate Context
  if (user && user.isActive) {
    const userDto = user.toJSON();
    const authContext = {
      userId: user.id,
      name: user.identity?.name || '',
      email: user.data?.email || '',
      avatarUrl: userDto.data?.avatarUrl || null,
      organizationId: user.organizationId?.toString() || null,
      role: user.role,
      permissions: user.permissions,
      memberships: user.memberships || [],
      restrictedTo: user.restrictedTo
    };

    if (user.organizationId) {
      const org = await organizationsRepository.findById(user.organizationId);
      if (org) {
        authContext.organizationData = {
          _id: org._id.toString(),
          name: org.identity?.name || 'Unnamed Organization',
          type: org.data?.type || 'Customer'
        };
      }
    }

    event.context.auth = await resolveProcessAuth(authContext);
  }
});
