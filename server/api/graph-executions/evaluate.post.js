import { createError, defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as graphExecutionsService from '~/server/features/graph-executions/index.js';

export default defineEventHandler(async event => {
  const auth = await requireAuth(event);
  const body = await readBody(event) || {};
  const graphDocumentInstanceId = String(body.graphDocumentInstanceId || '').trim();
  const inputBindings = body.inputBindings == null ? {} : body.inputBindings;
  if (!graphDocumentInstanceId) {
    throw createError({ statusCode: 400, message: 'Graph document instance is required' });
  }
  if (!inputBindings || typeof inputBindings !== 'object' || Array.isArray(inputBindings)) {
    throw createError({ statusCode: 400, message: 'Graph input bindings must be an object' });
  }
  return await graphExecutionsService.evaluateAndRecordSavedGraphPreview({
    graphDocumentInstanceId,
    inputBindings
  }, auth);
});
