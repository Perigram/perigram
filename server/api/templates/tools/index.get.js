import { service } from '../../../features/tool-profiles/index.js';
import { requireAuth } from '../../../utils/permissions.js';
import { serializeManyForAccess } from '../../../utils/entity-redaction.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const tools = await service.listAll(auth.userId);
  return serializeManyForAccess('toolProfile', tools, auth);
});
