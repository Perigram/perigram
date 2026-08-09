import { readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import * as service from '~/server/features/process-definitions/service.js';

export default defineEventHandler(async event => await service.preview(await readBody(event), await requireAuth(event)));
