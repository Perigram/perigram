import * as overlaysService from '~/server/features/instance-overlays/service.js';

export default defineEventHandler(async event => {
  const auth = event.context?.auth;
  if (!auth?.userId) {
    setResponseStatus(event, 401);
    return;
  }
  return overlaysService.remove(
    getRouterParam(event, 'type') || '',
    getRouterParam(event, 'id') || '',
    auth
  );
});
