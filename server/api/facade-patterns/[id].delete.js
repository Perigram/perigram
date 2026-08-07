import { defineEventHandler } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import * as service from '~/server/features/facade-patterns/service.js';
export default defineEventHandler(async event => { const auth = await requireAuth(event); return await service.remove(event.context.params.id, auth.userId, auth.organizationId, auth.role, auth); });
