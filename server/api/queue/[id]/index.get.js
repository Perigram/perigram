import * as queuesService from '../../../features/queues/service.js';
import { requireAuth } from '../../../utils/permissions.js';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;
  const id = event.context.params.id;
  
  return await queuesService.getById(
    id, 
    auth.userId,
    auth.organizationId,
    auth.role,
    auth
  );
});
