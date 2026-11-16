import { defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as graphExecutionsService from '~/server/features/graph-executions/index.js';

export default defineEventHandler(async event => {
  const auth = await requireAuth(event);
  const body = await readBody(event) || {};
  return await graphExecutionsService.commitProposal({
    graphDocumentInstanceId: body.graphDocumentInstanceId,
    record: body.record,
    proposal: body.proposal
  }, auth);
});
