import * as queuesService from '~/server/features/queues/service';
import { requireAuth } from '~/server/utils/permissions';

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
