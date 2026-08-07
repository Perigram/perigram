import { defineEventHandler } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import { serializeForAccess } from '~/server/utils/entity-redaction.js';
import * as service from '~/server/features/facades/service.js';
export default defineEventHandler(async event => { const auth = await requireAuth(event); return serializeForAccess('facade', await service.getById(event.context.params.id, auth.userId, auth.organizationId, auth.role, auth), auth); });
