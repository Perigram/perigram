import * as overlaysService from '~/server/features/instance-overlays/service.js';

// One overlay per instance (SPEC §26), keyed by the instance: `null` is
// the honest answer for a record nobody customized.
export default defineEventHandler(async event => {
  const auth = event.context?.auth;
  if (!auth?.userId) {
    setResponseStatus(event, 401);
    return;
  }
  return {
    overlay: await overlaysService.getOverlay(
      getRouterParam(event, 'type') || '',
      getRouterParam(event, 'id') || '',
      auth
    )
  };
});
