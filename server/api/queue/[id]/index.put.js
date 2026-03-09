import * as queuesService from '../../../features/queues/service.js';
import { requireAuth } from '../../../utils/permissions.js';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;
  const id = event.context.params.id;
  const body = await readBody(event);
  
  return await queuesService.update(
    id, 
    body, 
    auth.userId,
    auth.organizationId,
    auth.role,
    auth
  );
});
