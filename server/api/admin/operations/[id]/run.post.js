import { readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { executeServiceAction } from '~/server/core/operations/service.js';
import '~/server/features/nesting/operations.js';
import '~/server/features/artifacts/operations.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const body = await readBody(event);
  const result = await executeServiceAction(event.context.params.id, body, auth);
  return {
    success: true,
    result
  };
});
