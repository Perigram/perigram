import { readBody } from 'h3';
import { requireAuth } from '~/server/utils/auth.js';
import * as service from '~/server/features/process-definitions/service.js';

export default defineEventHandler(async event => await service.preview(await readBody(event), requireAuth(event)));
