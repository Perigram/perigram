import { defineEventHandler, getQuery, getRouterParam } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as graphExecutionsService from '~/server/features/graph-executions/service.js';

export default defineEventHandler(async event => {
  const auth = await requireAuth(event);
  return graphExecutionsService.resolveCollectionOutput(
    getRouterParam(event, 'executionInstanceId') || '',
    getRouterParam(event, 'outputId') || '',
    auth,
    getQuery(event)
  );
});
