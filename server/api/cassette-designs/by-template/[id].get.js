import { defineEventHandler } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as designService from '~/server/features/cassette-designs/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const templateId = event.context.params.id;
  
  return await designService.getByTemplateId(
    templateId,
    auth.userId,
    auth.organizationId,
    auth.role,
    auth
  );
});
