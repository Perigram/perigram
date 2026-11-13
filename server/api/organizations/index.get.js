import { defineEventHandler, getQuery } from 'h3';
import { requireAuth } from '../../utils/permissions';
import * as organizationsService from '../../features/organizations/service';
import { serializeManyForAccess } from '../../utils/entity-redaction.js';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const query = getQuery(event);
  
  const organizations = await organizationsService.list(auth, query);
  return serializeManyForAccess('organization', organizations, auth);
});
