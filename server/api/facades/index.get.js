import { defineEventHandler, getQuery } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import { serializeManyForAccess } from '~/server/utils/entity-redaction.js';
import * as service from '~/server/features/facades/service.js';
export default defineEventHandler(async event => { const auth = await requireAuth(event); return serializeManyForAccess('facade', await service.list(auth.userId, auth.organizationId, auth.role, auth, getQuery(event)), auth); });
