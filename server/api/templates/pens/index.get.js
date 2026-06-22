import { service } from '~/server/features/pen-templates';
import { serializeManyForAccess } from '~/server/utils/entity-redaction.js';

export default defineEventHandler(async (event) => {
  const auth = event.context.auth || null;
  const pens = await service.listAll(auth?.userId || null);
  return serializeManyForAccess('penTemplate', pens, auth);
});
