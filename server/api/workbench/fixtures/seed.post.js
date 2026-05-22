import { readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { seedScenario } from '~/server/core/workbench-fixtures/service.js';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const body = await readBody(event);
  const result = await seedScenario(body);
  return {
    success: true,
    ...result
  };
});
