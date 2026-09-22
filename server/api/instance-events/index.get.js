import { defineEventHandler, getQuery } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import * as entityEventService from '~/server/features/instance-events/service.js';

export default defineEventHandler((event) => {
  const auth = requireAuth(event);
  const { after } = getQuery(event);

  return entityEventService.listEntityChanges(auth, {
    after: after === undefined ? null : Number(after)
  });
});
