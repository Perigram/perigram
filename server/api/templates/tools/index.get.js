import { service } from '../../../features/tool-profiles/index.js';
import { serializeManyForAccess } from '../../../utils/entity-redaction.js';

export default defineEventHandler(async (event) => {
  const auth = event.context.auth || null;
  const tools = await service.listAll(auth?.userId || null);
  return serializeManyForAccess('toolProfile', tools, auth);
});
