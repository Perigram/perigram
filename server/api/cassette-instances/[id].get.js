import { defineEventHandler } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { serializeForAccess } from '~/server/utils/entity-redaction.js';
import * as instanceService from '~/server/features/cassette-instances/service';

export default defineEventHandler(async (event) => {
  const auth = event.context.auth;
  requireAuth(event);
  
  const id = event.context.params.id;
  
  const instance = await instanceService.getById(
    id,
    auth.userId,
    auth.organizationId,
    auth.role,
    auth
  );
  return serializeForAccess('cassetteInstance', instance, auth);
});
