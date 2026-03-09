import { service } from '../../../features/tool-profiles/index.js';

export default defineEventHandler(async (event) => {
  const userId = event.context.auth.userId;
  return await service.listAll(userId);
});
