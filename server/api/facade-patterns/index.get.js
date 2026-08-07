import { defineEventHandler, getQuery } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import { serializeManyForAccess } from '~/server/utils/entity-redaction.js';
import * as service from '~/server/features/facade-patterns/service.js';
export default defineEventHandler(async event => { const auth = await requireAuth(event); return serializeManyForAccess('facade_pattern', await service.list(auth.userId, auth.organizationId, auth.role, auth, getQuery(event)), auth); });
