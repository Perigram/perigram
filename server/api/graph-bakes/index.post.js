import { createError, defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { assertValidGraphExecutionRecord } from '#packages/core';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import * as filesService from '~/server/features/files/service.js';
import * as pagesService from '~/server/features/pages/service.js';

export default defineEventHandler(async event => {
  const auth = await requireAuth(event);
  const body = await readBody(event) || {};
  const graphDocumentInstanceId = String(body.graphDocumentInstanceId || '');
  const outputId = String(body.outputId || '');
  const destination = body.destination || {};
  if (!graphDocumentInstanceId || !outputId || destination.type !== 'page-file' || !destination.pageId) {
    throw createError({ statusCode: 400, message: 'A graph document, output, and exact page-file destination are required' });
  }

  let record;
  try {
    record = assertValidGraphExecutionRecord(body.record);
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid graph execution record',
      data: { message: error.message, problems: error.problems || [] }
    });
  }
  if (record.status !== 'succeeded' || record.profile !== 'procedural-preview') {
    throw createError({ statusCode: 409, message: 'Bake requires a successful procedural preview' });
  }
  if (!Object.hasOwn(record.outputs, outputId)) {
    throw createError({ statusCode: 400, message: `Execution has no output ${outputId}` });
  }

  const registry = getAppRegistry();
  const graphService = registry.getInstanceService('graph-document');
  const graphDocument = await graphService.processGetById(graphDocumentInstanceId, auth);
  if (!graphDocument) throw createError({ statusCode: 404, message: 'Graph document not found' });
  if (String(graphDocument.fields?.graphId || '') !== record.graph.id || !graphDocument.payload?.fileId) {
    throw createError({ statusCode: 409, message: 'Execution graph identity does not match the source document' });
  }

  const sourceFile = await filesService.findFileMeta(graphDocument.payload.fileId, 'files');
  if (!sourceFile) throw createError({ statusCode: 404, message: 'Graph payload not found' });
  filesService.assertFileReadAccess(sourceFile.metadata, auth);
  let savedGraph;
  try {
    savedGraph = JSON.parse((await filesService.getFileBuffer(graphDocument.payload.fileId, 'files')).toString('utf8'));
  } catch {
    throw createError({ statusCode: 409, message: 'Stored graph payload is not valid JSON' });
  }
  if (savedGraph.id !== record.graph.id || savedGraph.revision !== record.graph.revision) {
    throw createError({ statusCode: 409, message: 'Bake requires a preview of the exact saved graph revision; save the graph and preview again' });
  }
  if (!(savedGraph.interface?.outputs || []).some(port => port.id === outputId)) {
    throw createError({ statusCode: 400, message: `Graph revision does not declare output ${outputId}` });
  }

  const value = record.outputs[outputId];
  const isText = typeof value === 'string';
  const content = isText ? value : JSON.stringify(value, null, 2);
  if (content === undefined) throw createError({ statusCode: 400, message: 'Graph output cannot be serialized as a file' });
  return await pagesService.bakeFile({
    pageId: destination.pageId,
    path: destination.path,
    buffer: Buffer.from(content, 'utf8'),
    mimeType: isText ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    conflictPolicy: destination.conflictPolicy || 'fail',
    provenance: {
      graphId: record.graph.id,
      graphRevision: record.graph.revision,
      executionId: record.id,
      outputId
    }
  }, auth);
});
