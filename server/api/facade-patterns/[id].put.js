import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import * as service from '~/server/features/facade-patterns/service.js';
export default defineEventHandler(async event => { const auth = await requireAuth(event); return await service.update(event.context.params.id, await readBody(event), auth.userId, auth.organizationId, auth.role, auth); });
