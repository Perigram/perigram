import { defineEventHandler } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { serializeForAccess } from '~/server/utils/entity-redaction.js';
import * as cassetteService from '~/server/packs/facade/cassettes/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const id = event.context.params.id;
  
  const cassette = await cassetteService.getById(
    id,
    auth.userId,
    auth.organizationId,
    auth.role,
    auth
  );
  return serializeForAccess('cassette', cassette, auth);
});
