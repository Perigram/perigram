import * as overlaysService from '~/server/features/instance-overlays/service.js';

// The whole-document upsert (SPEC §26): one PATCH creates or replaces the
// instance's overlay — blocks and the section order together, the document
// model the client authors.
export default defineEventHandler(async event => {
  const auth = event.context?.auth;
  if (!auth?.userId) {
    setResponseStatus(event, 401);
    return;
  }
  const body = await readBody(event) || {};
  return overlaysService.upsert(
    getRouterParam(event, 'type') || '',
    getRouterParam(event, 'id') || '',
    body,
    auth
  );
});
