import { createError, defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { assertValidGraphExecutionRecord } from '#packages/core';
import { getAppRegistry } from '~/server/runtime/app-registry.js';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const body = await readBody(event);
  const graphDocumentInstanceId = String(body?.graphDocumentInstanceId || '');
  if (!graphDocumentInstanceId) throw createError({ statusCode: 400, message: 'Graph document instance is required' });
  let record;
  try {
    record = assertValidGraphExecutionRecord(body?.record);
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid graph execution record', data: { message: error.message, problems: error.problems || [] } });
  }

  const registry = getAppRegistry();
  const graphService = registry.getInstanceService('graph-document');
  const graphDocument = await graphService.processGetById(graphDocumentInstanceId, auth);
  if (!graphDocument) throw createError({ statusCode: 404, message: 'Graph document not found' });
  if (String(graphDocument.fields?.graphId || '') !== record.graph.id) {
    throw createError({ statusCode: 409, message: 'Execution graph identity does not match the source document' });
  }

  const organizationId = graphDocument.organizationId || auth.organizationId || null;
  const executionService = registry.getInstanceService('graph-execution');
  return await executionService.createForHttp({
    name: `Execution ${record.id}`,
    fields: {
      executionId: record.id,
      graphId: record.graph.id,
      graphRevision: record.graph.revision,
      graphDocument: { type: 'graph-document', id: String(graphDocument._id) },
      profile: record.profile,
      status: record.status,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      actorId: String(auth.userId),
      inputs: record.inputs,
      outputs: record.outputs,
      nodeOutputs: record.nodeOutputs,
      diagnostics: record.diagnostics,
      provenance: record.provenance,
      readSet: record.readSet,
      artifacts: record.artifacts
    }
  }, { auth, organizationId });
});
