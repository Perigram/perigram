import { randomUUID } from 'node:crypto';
import { createError } from 'h3';
import { assertValidGraphDocument, assertValidGraphExecutionRecord, createGraphExecutionRecord, createGraphReadSetRecorder } from '#packages/core';
import { withOrganizationChangeSequence } from '../instances/index.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import * as filesService from '../files/service.js';
import * as pagesService from '../pages/service.js';

function parseRecord(value) {
  try {
    return assertValidGraphExecutionRecord(value);
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid graph execution record', data: { message: error.message, problems: error.problems || [] } });
  }
}

async function sourceFor(instanceId, record, auth) {
  if (!instanceId) throw createError({ statusCode: 400, message: 'Graph document instance is required' });
  const registry = getAppRegistry();
  const graphDocument = await registry.getInstanceService('graph-document').processGetById(String(instanceId), auth);
  if (!graphDocument) throw createError({ statusCode: 404, message: 'Graph document not found' });
  if (String(graphDocument.fields?.graphId || '') !== record.graph.id || !graphDocument.payload?.fileId) {
    throw createError({ statusCode: 409, message: 'Execution graph identity does not match the saved source document' });
  }
  const file = await filesService.findFileMeta(graphDocument.payload.fileId, 'files');
  if (!file) throw createError({ statusCode: 404, message: 'Graph payload not found' });
  filesService.assertFileReadAccess(file.metadata, auth);
  let graph;
  try {
    graph = assertValidGraphDocument(JSON.parse((await filesService.getFileBuffer(graphDocument.payload.fileId, 'files')).toString('utf8')));
  } catch (error) {
    throw createError({ statusCode: 409, message: 'Saved graph payload is unavailable or invalid', data: { message: error.message } });
  }
  if (graph.id !== record.graph.id || graph.revision !== record.graph.revision) {
    throw createError({ statusCode: 409, message: 'Execution graph revision is stale; save and preview the current revision' });
  }
  return { graphDocument, graph, organizationId: graphDocument.organizationId || auth.organizationId || null };
}

async function persistRecord(record, graphDocument, organizationId, auth) {
  return await getAppRegistry().getInstanceService('graph-execution').create({
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
  }, auth.userId, organizationId);
}

export async function queryOrganizationData(query = {}, auth = {}) {
  const typeId = String(query.typeId || '').trim();
  if (!typeId) throw createError({ statusCode: 400, message: 'A CTS typeId is required' });
  if (typeId.length > 128) throw createError({ statusCode: 400, message: 'CTS typeId is too long' });
  const filters = query.filters == null ? {} : query.filters;
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
    throw createError({ statusCode: 400, message: 'Graph query filters must be an object' });
  }
  const limit = boundedQueryInteger(query.limit, 50, 1, 200, 'limit');
  const offset = boundedQueryInteger(query.offset, 0, 0, 10000, 'offset');
  const sortBy = query.sortBy == null ? 'createdAt' : String(query.sortBy);
  const sortDirection = query.sortDirection == null ? 'desc' : String(query.sortDirection);
  if (!['asc', 'desc'].includes(sortDirection)) {
    throw createError({ statusCode: 400, message: 'Graph query sortDirection must be asc or desc' });
  }
  const projection = normalizeProjection(query.projection);
  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId || null;
  const instanceService = getAppRegistry().getInstanceService(typeId);
  if (!instanceService || typeof instanceService.processList !== 'function') {
    throw createError({ statusCode: 404, message: 'CTS instance query service is unavailable' });
  }

  const queryShape = { typeId, filters, sortBy, sortDirection, limit, offset, projection };
  const { value: items, boundary } = await withOrganizationChangeSequence(
    organizationId,
    () => instanceService.processList({
      ...filters,
      sortBy,
      sortDirection,
      limit,
      offset
    }, auth),
    { retries: 2 }
  );
  const recorder = createGraphReadSetRecorder(boundary);
  for (const item of items || []) {
    recorder.recordInstance({
      typeId,
      instanceId: String(item?._id ?? item?.id ?? ''),
      revision: item?.revision ?? null,
      updatedAt: item?.updatedAt ?? null,
      typeVersion: item?.typeVersion,
      organizationId: item?.organizationId ?? organizationId
    });
  }
  recorder.recordQuery({
    typeId,
    organizationId,
    query: queryShape,
    resultIds: (items || []).map(item => String(item?._id ?? item?.id ?? '')),
    observedTotal: (items || []).length,
    sequence: boundary.organizationSequenceEnd
  });
  return {
    items: (items || []).map(item => projectGraphQueryItem(item, projection)),
    count: (items || []).length,
    readSet: recorder.toJSON()
  };
}

function boundedQueryInteger(value, fallback, minimum, maximum, label) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw createError({ statusCode: 400, message: 'Graph query ' + label + ' must be an integer between ' + minimum + ' and ' + maximum });
  }
  return parsed;
}

function normalizeProjection(value) {
  if (value == null) return null;
  if (!Array.isArray(value) || value.length > 50) {
    throw createError({ statusCode: 400, message: 'Graph query projection must be an array of at most 50 paths' });
  }
  const allowed = /^(?:_id|type|typeVersion|organizationId|name|state|createdAt|updatedAt|payload|provenance|fields\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*|lineage\.[A-Za-z0-9_-]+|relations\.[A-Za-z0-9_-]+)$/;
  const paths = [...new Set(value.map(String))];
  if (paths.some(path => !allowed.test(path) || path.split('.').some(part => ['__proto__', 'prototype', 'constructor'].includes(part)))) {
    throw createError({ statusCode: 400, message: 'Graph query projection contains an unsupported path' });
  }
  return paths;
}

function projectGraphQueryItem(item, projection) {
  if (!projection) return item;
  const result = {};
  for (const key of ['_id', 'type', 'typeVersion', 'organizationId']) {
    if (item?.[key] !== undefined) result[key] = item[key];
  }
  for (const path of projection) {
    const parts = path.split('.');
    let source = item;
    for (const part of parts) {
      if (!source || typeof source !== 'object' || !Object.hasOwn(source, part)) {
        source = undefined;
        break;
      }
      source = source[part];
    }
    if (source === undefined) continue;
    let target = result;
    for (const part of parts.slice(0, -1)) {
      target[part] ||= {};
      target = target[part];
    }
    target[parts.at(-1)] = source;
  }
  return result;
}

export async function recordExecution({ graphDocumentInstanceId, record: value } = {}, auth = {}) {
  const record = parseRecord(value);
  const { graphDocument, organizationId } = await sourceFor(graphDocumentInstanceId, record, auth);
  return await persistRecord(record, graphDocument, organizationId, auth);
}

export async function bakeOutput({ graphDocumentInstanceId, record: value, outputId, destination = {} } = {}, auth = {}) {
  const preview = parseRecord(value);
  if (preview.profile !== 'procedural-preview' || preview.status !== 'succeeded') {
    throw createError({ statusCode: 409, message: 'Bake requires a successful procedural preview' });
  }
  const selectedOutputId = String(outputId || '');
  if (!Object.hasOwn(preview.outputs || {}, selectedOutputId)) {
    throw createError({ statusCode: 400, message: 'Selected graph output is unavailable' });
  }
  if (destination.type !== 'page-file' || !destination.pageId || !destination.path) {
    throw createError({ statusCode: 400, message: 'Bake requires an exact Page and relative file path' });
  }
  const { graphDocument, graph, organizationId } = await sourceFor(graphDocumentInstanceId, preview, auth);
  if (!(graph.interface?.outputs || []).some(port => String(port.id) === selectedOutputId)) {
    throw createError({ statusCode: 400, message: `Graph revision does not declare output ${selectedOutputId}` });
  }

  const output = preview.outputs[selectedOutputId];
  let buffer;
  let mimeType;
  if (output && typeof output === 'object' && output.fileId) {
    const bucket = output.bucket || 'files';
    const file = await filesService.findFileMeta(output.fileId, bucket);
    if (!file) throw createError({ statusCode: 404, message: 'Graph output file not found' });
    filesService.assertFileReadAccess(file.metadata, auth);
    buffer = await filesService.getFileBuffer(output.fileId, bucket);
    mimeType = output.mime || file.contentType || 'application/octet-stream';
  } else if (typeof output === 'string') {
    buffer = Buffer.from(output, 'utf8');
    mimeType = 'text/plain; charset=utf-8';
  } else {
    const serialized = JSON.stringify(output, null, 2);
    if (serialized === undefined) throw createError({ statusCode: 400, message: 'Graph output cannot be serialized as a file' });
    buffer = Buffer.from(serialized, 'utf8');
    mimeType = 'application/json; charset=utf-8';
  }

  const bakeId = randomUUID();
  const timestamp = new Date().toISOString();
  const baked = await pagesService.bakeFile({
    pageId: destination.pageId,
    path: destination.path,
    buffer,
    mimeType,
    conflictPolicy: destination.conflictPolicy || 'fail',
    provenance: { graphId: preview.graph.id, graphRevision: preview.graph.revision, executionId: bakeId, outputId: selectedOutputId }
  }, auth);
  const bakeRecord = createGraphExecutionRecord({
    ...preview,
    id: bakeId,
    profile: 'procedural-bake',
    status: 'succeeded',
    startedAt: timestamp,
    completedAt: timestamp,
    artifacts: [...(preview.artifacts || []), {
      kind: 'page-file',
      pageId: String(destination.pageId),
      path: baked.file.path,
      fileId: baked.file.fileId,
      mime: baked.file.mime,
      size: baked.file.size,
      revision: baked.file.revision,
      outputId: selectedOutputId,
      sourceExecutionId: preview.id,
      conflictPolicy: destination.conflictPolicy || 'fail'
    }]
  });
  try {
    const execution = await persistRecord(bakeRecord, graphDocument, organizationId, auth);
    return { ...baked, execution };
  } catch (error) {
    try {
      const rollback = await pagesService.retractBakedFile({ pageId: destination.pageId, fileId: baked.file.fileId }, auth);
      if (!rollback?.success) throw new Error('Baked file remains referenced by the Page and requires manual provenance repair');
    } catch (rollbackError) {
      throw createError({ statusCode: 500, message: 'Bake artifact could not be rolled back after execution recording failed', data: { executionError: error.message, rollbackError: rollbackError.message, fileId: baked.file.fileId } });
    }
    throw error;
  }
}
