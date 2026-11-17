import { randomUUID } from 'node:crypto';
import { createError } from 'h3';
import { connectDB } from '~/server/db/mongo';
import { assertValidGraphDocument, assertValidGraphExecutionRecord, createGraphExecutionRecord, createGraphReadSetRecorder } from '#packages/core';
import { withOrganizationChangeSequence, withOrganizationDataSnapshot } from '../instances/index.js';
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

async function withMongoWriteTransaction(callback) {
  const db = await connectDB();
  const client = db.client;
  if (!client?.startSession) {
    throw createError({ statusCode: 503, message: 'Atomic graph commits require MongoDB transaction support' });
  }
  const session = client.startSession();
  try {
    let value;
    await session.withTransaction(async () => {
      value = await callback(session);
      return value;
    }, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary'
    });
    return value;
  } catch (error) {
    if ([20, 303].includes(Number(error?.code))
      || ['IllegalOperation', 'OperationNotSupportedInTransaction'].includes(error?.codeName)
      || /transactions are not supported|transaction numbers are only allowed on a replica set/i.test(error?.message || '')) {
      throw createError({ statusCode: 503, message: 'Atomic graph commits require MongoDB transaction support' });
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

function expectedSequenceForReadSet(readSet) {
  const start = readSet?.organizationSequenceStart;
  const end = readSet?.organizationSequenceEnd;
  return Number.isSafeInteger(start) && start >= 0 && start === end ? end : null;
}

async function persistRecord(record, graphDocument, organizationId, auth, session = null) {
  const service = getAppRegistry().getInstanceService('graph-execution');
  const draft = {
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
  };
  return session
    ? await service.create(draft, auth.userId, organizationId, { session })
    : await service.create(draft, auth.userId, organizationId);
}


function stalePreviewError(message = 'Graph preview data is stale; evaluate again before materializing output') {
  return createError({ statusCode: 409, message });
}

function relationContains(value, targetTypeId, targetId) {
  const values = Array.isArray(value) ? value : [value];
  return values.some(candidate => {
    if (candidate == null) return false;
    if (typeof candidate !== 'object') return String(candidate) === targetId;
    const typeId = candidate.type == null ? targetTypeId : String(candidate.type);
    const id = candidate.id ?? candidate._id;
    return typeId === targetTypeId && id != null && String(id) === targetId;
  });
}

async function assertPreviewReadSetCurrent(readSet = {}, organizationId, auth, sourceGraphDocument, { session = null } = {}) {
  const instances = Array.isArray(readSet.instances) ? readSet.instances : [];
  const relations = Array.isArray(readSet.relations) ? readSet.relations : [];
  const queries = Array.isArray(readSet.queries) ? readSet.queries : [];
  const start = readSet.organizationSequenceStart;
  const end = readSet.organizationSequenceEnd;
  const hasStableSequence = Number.isSafeInteger(start) && start >= 0 && start === end;
  const supportedBoundary = readSet.consistency === 'snapshot' || readSet.consistency === 'sequence-bracketed';

  if (queries.length) {
    if (!organizationId || !hasStableSequence || !supportedBoundary
      || (readSet.consistency === 'snapshot' && !readSet.snapshotId)
      || queries.some(query => query.sequence !== end
        || (query.organizationId != null && String(query.organizationId) !== String(organizationId)))) {
      throw stalePreviewError('Graph preview has no verifiable organization query boundary; evaluate again');
    }
  }

  const validate = async () => {
    const registry = getAppRegistry();
    const graphService = registry.getInstanceService('graph-document');
    const currentGraphDocument = await graphService?.processGetById?.(String(sourceGraphDocument._id), auth, { session });
    if (!currentGraphDocument
      || String(currentGraphDocument.fields?.graphId || '') !== String(sourceGraphDocument.fields?.graphId || '')
      || String(currentGraphDocument.payload?.fileId || '') !== String(sourceGraphDocument.payload?.fileId || '')
      || (sourceGraphDocument.revision != null && String(currentGraphDocument.revision) !== String(sourceGraphDocument.revision))
      || (sourceGraphDocument.revision == null && sourceGraphDocument.updatedAt != null
        && currentGraphDocument.updatedAt !== sourceGraphDocument.updatedAt)) {
      throw stalePreviewError('Saved graph document changed after preview; evaluate the current revision again');
    }

    const cache = new Map();
    const readInstance = async (typeId, instanceId) => {
      const key = typeId + ':' + instanceId;
      if (cache.has(key)) return cache.get(key);
      const instanceService = registry.getInstanceService(typeId);
      if (typeof instanceService?.processGetById !== 'function') {
        throw stalePreviewError('A graph data dependency can no longer be read');
      }
      const current = await instanceService.processGetById(instanceId, auth, { session });
      if (!current) throw stalePreviewError('A graph data dependency was deleted');
      cache.set(key, current);
      return current;
    };

    for (const dependency of instances) {
      const current = await readInstance(dependency.typeId, dependency.instanceId);
      if (dependency.revision != null) {
        if (current.revision == null || String(current.revision) !== String(dependency.revision)) {
          throw stalePreviewError('A graph data dependency changed after preview');
        }
      } else if (dependency.updatedAt != null) {
        if (current.updatedAt !== dependency.updatedAt) {
          throw stalePreviewError('A graph data dependency changed after preview');
        }
      } else {
        throw stalePreviewError('A graph data dependency has no verifiable revision');
      }
      if (dependency.typeVersion != null && current.typeVersion !== dependency.typeVersion) {
        throw stalePreviewError('A graph data dependency changed type version after preview');
      }
      if (dependency.organizationId != null
        && String(current.organizationId ?? '') !== String(dependency.organizationId)) {
        throw stalePreviewError('A graph data dependency changed organization after preview');
      }
    }

    for (const relation of relations) {
      const source = await readInstance(relation.sourceTypeId, relation.sourceId);
      const target = await readInstance(relation.targetTypeId, relation.targetId);
      if (relation.revision != null
        && (target.revision == null || String(target.revision) !== String(relation.revision))) {
        throw stalePreviewError('A graph relationship target changed after preview');
      }
      const currentRelation = source.relations?.[relation.key] ?? source.fields?.[relation.key];
      if (!relationContains(currentRelation, String(relation.targetTypeId), String(relation.targetId))) {
        throw stalePreviewError('A graph relationship changed after preview');
      }
    }
    return true;
  };

  if (!organizationId) {
    if (queries.length) throw stalePreviewError('Organization query dependencies cannot be validated without an organization');
    await validate();
    return;
  }

  const { boundary } = await withOrganizationChangeSequence(organizationId, validate, { retries: 2 });
  if (hasStableSequence && (boundary.organizationSequenceStart !== end || boundary.organizationSequenceEnd !== end)) {
    throw stalePreviewError('Organization data changed after preview; evaluate again before materializing output');
  }
}

async function materializeOutput(output, auth, graph, outputId, requestedFilename = null) {
  let buffer;
  let mimeType;
  let sourceFilename = null;
  if (output && typeof output === 'object' && output.fileId) {
    const bucket = output.bucket || 'files';
    const file = await filesService.findFileMeta(output.fileId, bucket);
    if (!file) throw createError({ statusCode: 404, message: 'Graph output file not found' });
    filesService.assertFileReadAccess(file.metadata, auth);
    buffer = await filesService.getFileBuffer(output.fileId, bucket);
    mimeType = normalizeOutputMimeType(output.mime || file.contentType);
    sourceFilename = output.name || file.filename || file.metadata?.name || null;
  } else if (typeof output === 'string') {
    buffer = Buffer.from(output, 'utf8');
    mimeType = 'text/plain; charset=utf-8';
  } else {
    const serialized = JSON.stringify(output, null, 2);
    if (serialized === undefined) throw createError({ statusCode: 400, message: 'Graph output cannot be serialized as a file' });
    buffer = Buffer.from(serialized, 'utf8');
    mimeType = 'application/json; charset=utf-8';
  }
  const extension = outputExtension(mimeType);
  const fallback = String(graph.name || graph.id) + '-' + outputId + extension;
  const filename = normalizeOutputFilename(requestedFilename || sourceFilename || fallback, fallback, extension);
  return { buffer, mimeType, filename };
}

function normalizeOutputMimeType(value) {
  const mime = String(value || 'application/octet-stream').trim();
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+(?:\s*;\s*charset=[a-z0-9._-]+)?$/i.test(mime)
    ? mime
    : 'application/octet-stream';
}

function outputExtension(mimeType) {
  const mime = String(mimeType).split(';', 1)[0].toLowerCase();
  if (mime === 'text/plain') return '.txt';
  if (mime === 'application/json' || mime.endsWith('+json')) return '.json';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/svg+xml') return '.svg';
  if (mime === 'application/pdf') return '.pdf';
  return '.bin';
}

function normalizeOutputFilename(value, fallback, extension) {
  let filename = String(value || fallback)
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '-')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 180);
  if (!filename) filename = fallback;
  if (!/\.[a-z0-9]{1,10}$/i.test(filename)) filename += extension;
  return filename;
}

export async function queryOrganizationData(query = {}, auth = {}) {
  const typeId = String(query.typeId || '').trim();
  if (!typeId) throw createError({ statusCode: 400, message: 'A CTS typeId is required' });
  if (typeId.length > 128) throw createError({ statusCode: 400, message: 'CTS typeId is too long' });
  const filters = query.filters == null ? {} : query.filters;
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
    throw createError({ statusCode: 400, message: 'Graph query filters must be an object' });
  }
  const instanceId = query.instanceId == null ? '' : String(query.instanceId).trim();
  if (instanceId.length > 256) throw createError({ statusCode: 400, message: 'Graph query instanceId is too long' });
  if (instanceId && Object.keys(filters).length) {
    throw createError({ statusCode: 400, message: 'Exact-instance graph queries cannot also specify filters' });
  }
  const projection = normalizeProjection(query.projection);
  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId || null;
  const instanceService = getAppRegistry().getInstanceService(typeId);
  if (!instanceService) {
    throw createError({ statusCode: 404, message: 'CTS instance query service is unavailable' });
  }

  let queryShape;
  let read;
  if (instanceId) {
    if (typeof instanceService.processGetById !== 'function') {
      throw createError({ statusCode: 404, message: 'CTS instance detail query service is unavailable' });
    }
    queryShape = { typeId, instanceId, projection };
    read = async session => {
      const item = await instanceService.processGetById(instanceId, auth, { session });
      return item ? [item] : [];
    };
  } else {
    if (typeof instanceService.processList !== 'function') {
      throw createError({ statusCode: 404, message: 'CTS instance list query service is unavailable' });
    }
    const limit = boundedQueryInteger(query.limit, 50, 1, 200, 'limit');
    const offset = boundedQueryInteger(query.offset, 0, 0, 10000, 'offset');
    const sortBy = query.sortBy == null ? 'createdAt' : String(query.sortBy);
    const sortDirection = query.sortDirection == null ? 'desc' : String(query.sortDirection);
    if (!['asc', 'desc'].includes(sortDirection)) {
      throw createError({ statusCode: 400, message: 'Graph query sortDirection must be asc or desc' });
    }
    queryShape = { typeId, filters, sortBy, sortDirection, limit, offset, projection };
    read = session => instanceService.processList({
      ...filters,
      sortBy,
      sortDirection,
      limit,
      offset
    }, auth, { session });
  }

  const { value: items, boundary } = await withOrganizationDataSnapshot(
    organizationId,
    read,
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
  const allowed = /^(?:_id|type|typeVersion|revision|organizationId|name|state|createdAt|updatedAt|payload|provenance|fields\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*|lineage\.[A-Za-z0-9_-]+|relations\.[A-Za-z0-9_-]+)$/;
  const paths = [...new Set(value.map(String))];
  if (paths.some(path => !allowed.test(path) || path.split('.').some(part => ['__proto__', 'prototype', 'constructor'].includes(part)))) {
    throw createError({ statusCode: 400, message: 'Graph query projection contains an unsupported path' });
  }
  return paths;
}

function projectGraphQueryItem(item, projection) {
  if (!projection) return item;
  const result = {};
  for (const key of ['_id', 'type', 'typeVersion', 'revision', 'organizationId']) {
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


export async function commitProposal({ graphDocumentInstanceId, record: value, proposal = {} } = {}, auth = {}) {
  const preview = parseRecord(value);
  if (preview.profile !== 'procedural-preview' || preview.status !== 'succeeded') {
    throw createError({ statusCode: 409, message: 'Commit requires a successful procedural preview' });
  }
  if (proposal.kind !== 'cts.instance.patch' || proposal.conflictPolicy !== 'fail') {
    throw createError({ statusCode: 400, message: 'Commit supports only fail-on-conflict CTS instance patches' });
  }
  const typeId = String(proposal.typeId || '').trim();
  const instanceId = String(proposal.instanceId || '').trim();
  const expectedRevision = proposal.expectedRevision == null ? '' : String(proposal.expectedRevision);
  const patch = proposal.patch;
  if (!typeId || !instanceId || !expectedRevision || !patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw createError({ statusCode: 400, message: 'Commit proposal requires a type, instance, expected revision, and patch' });
  }
  const fieldKeys = patch.fields && typeof patch.fields === 'object' && !Array.isArray(patch.fields)
    ? Object.keys(patch.fields)
    : [];
  if (Object.keys(patch).some(key => !['name', 'fields'].includes(key))
    || (patch.fields != null && (typeof patch.fields !== 'object' || Array.isArray(patch.fields)))
    || (!Object.hasOwn(patch, 'name') && !Object.hasOwn(patch, 'fields'))
    || (fieldKeys.length === 0 && !Object.hasOwn(patch, 'name'))
    || fieldKeys.some(key => !/^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(key)
      || ['__proto__', 'prototype', 'constructor'].includes(key))
    || (Object.hasOwn(patch, 'name') && typeof patch.name !== 'string')) {
    throw createError({ statusCode: 400, message: 'Commit patch supports a string name and declared flat field ids only' });
  }

  const instances = preview.readSet?.instances || [];
  const relations = preview.readSet?.relations || [];
  const queries = preview.readSet?.queries || [];
  if (instances.length !== 1 || relations.length !== 0) {
    throw stalePreviewError('Commit requires a read set containing exactly the target instance and no relation dependencies');
  }
  const dependency = instances[0];
  if (String(dependency.typeId) !== typeId || String(dependency.instanceId) !== instanceId
    || dependency.revision == null || String(dependency.revision) !== expectedRevision) {
    throw stalePreviewError('Commit proposal does not match the preview instance revision');
  }
  if (queries.some(query => String(query.typeId) !== typeId
    || String(query.query?.instanceId || '') !== instanceId
    || query.resultIds?.length !== 1
    || String(query.resultIds[0]) !== instanceId)) {
    throw stalePreviewError('Commit permits only exact-instance query observations for its target');
  }

  const { graphDocument, graph, organizationId } = await sourceFor(graphDocumentInstanceId, preview, auth);
  const instanceService = getAppRegistry().getInstanceService(typeId);
  if (typeof instanceService?.patch !== 'function') {
    throw createError({ statusCode: 404, message: 'CTS instance write service is unavailable' });
  }
  try {
    return await withMongoWriteTransaction(async session => {
      await assertPreviewReadSetCurrent(preview.readSet, organizationId, auth, graphDocument, { session });
      const updated = await instanceService.patch(instanceId, patch, {
        auth,
        organizationId,
        expectedRevision,
        expectedOrganizationSequence: expectedSequenceForReadSet(preview.readSet),
        session
      });
      const timestamp = new Date().toISOString();
      const commitId = randomUUID();
      const commitRecord = createGraphExecutionRecord({
        ...preview,
        id: commitId,
        profile: 'procedural-commit',
        status: 'succeeded',
        startedAt: timestamp,
        completedAt: timestamp,
        artifacts: [...(preview.artifacts || []), {
          kind: 'cts.instance',
          typeId,
          instanceId,
          revision: updated?.revision == null ? null : String(updated.revision),
          sourceExecutionId: preview.id,
          conflictPolicy: 'fail'
        }]
      });
      const execution = await persistRecord(commitRecord, graphDocument, organizationId, auth, session);
      return { instance: updated, execution };
    });
  } catch (error) {
    if (error?.statusCode) throw error;
    throw createError({
      statusCode: 500,
      message: 'CTS proposal and execution evidence could not be committed atomically',
      data: { instanceId, typeId, cause: error?.message || String(error) }
    });
  }
}

function isPlainRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null));
}

function validateInstancePatchProposal(value, readSet) {
  if (!isPlainRecord(value) || value.kind !== 'cts.instance.patch') {
    throw createError({ statusCode: 400, message: 'Selected output is not a supported CTS instance patch proposal' });
  }
  const typeId = String(value.typeId || '').trim();
  const instanceId = String(value.instanceId || '').trim();
  const expectedRevision = String(value.expectedRevision ?? '').trim();
  if (!typeId || !instanceId || !expectedRevision || value.conflictPolicy !== 'fail') {
    throw createError({ statusCode: 400, message: 'CTS patch proposal requires an exact target, expected revision, and fail conflict policy' });
  }
  const patch = value.patch;
  if (!isPlainRecord(patch)
    || Object.keys(patch).some(key => !['name', 'fields'].includes(key))
    || (patch.name !== undefined && typeof patch.name !== 'string')
    || (patch.fields !== undefined && !isPlainRecord(patch.fields))
    || (patch.fields && Object.keys(patch.fields).some(key => ['__proto__', 'prototype', 'constructor'].includes(key)))
    || (!Object.hasOwn(patch, 'name') && !Object.hasOwn(patch, 'fields'))
    || (patch.fields && Object.keys(patch.fields).length === 0 && patch.name === undefined)) {
    throw createError({ statusCode: 400, message: 'CTS patch proposal contains an invalid or empty field patch' });
  }

  const instances = Array.isArray(readSet?.instances) ? readSet.instances : [];
  const relations = Array.isArray(readSet?.relations) ? readSet.relations : [];
  const queries = Array.isArray(readSet?.queries) ? readSet.queries : [];
  if (instances.length !== 1 || relations.length !== 0) {
    throw stalePreviewError('Commit requires a read set containing only the exact target instance');
  }
  const target = instances[0];
  if (String(target.typeId) !== typeId || String(target.instanceId) !== instanceId
    || target.revision == null || String(target.revision) !== expectedRevision) {
    throw stalePreviewError('Commit target revision does not match the preview read set');
  }
  const exactQueries = queries.every(query => (
    String(query.typeId) === typeId
    && String(query.query?.typeId || '') === typeId
    && String(query.query?.instanceId || '') === instanceId
    && Array.isArray(query.resultIds)
    && query.resultIds.length === 1
    && String(query.resultIds[0]) === instanceId
    && query.observedTotal === 1
  ));
  if (!exactQueries) {
    throw stalePreviewError('Commit read set contains a broad query dependency');
  }
  return { typeId, instanceId, expectedRevision, patch };
}

export async function commitOutput({ graphDocumentInstanceId, record: value, outputId } = {}, auth = {}) {
  const preview = parseRecord(value);
  if (preview.profile !== 'procedural-preview' || preview.status !== 'succeeded') {
    throw createError({ statusCode: 409, message: 'Commit requires a successful procedural preview' });
  }
  const selectedOutputId = String(outputId || '');
  if (!Object.hasOwn(preview.outputs || {}, selectedOutputId)) {
    throw createError({ statusCode: 400, message: 'Selected graph output is unavailable' });
  }
  const { graphDocument, graph, organizationId } = await sourceFor(graphDocumentInstanceId, preview, auth);
  if (!(graph.interface?.outputs || []).some(port => String(port.id) === selectedOutputId)) {
    throw createError({ statusCode: 400, message: `Graph revision does not declare output ${selectedOutputId}` });
  }
  const proposal = validateInstancePatchProposal(preview.outputs[selectedOutputId], preview.readSet);
  const instanceService = getAppRegistry().getInstanceService(proposal.typeId);
  if (typeof instanceService?.patch !== 'function') {
    throw createError({ statusCode: 404, message: 'CTS instance update service is unavailable' });
  }
  try {
    return await withMongoWriteTransaction(async session => {
      await assertPreviewReadSetCurrent(preview.readSet, organizationId, auth, graphDocument, { session });
      const startedAt = new Date().toISOString();
      const updated = await instanceService.patch(proposal.instanceId, proposal.patch, {
        auth,
        organizationId,
        expectedRevision: proposal.expectedRevision,
        expectedOrganizationSequence: expectedSequenceForReadSet(preview.readSet),
        session
      });
      const completedAt = new Date().toISOString();
      const committedRevision = String(updated?.revision ?? '');
      const commitId = randomUUID();
      const commitRecord = createGraphExecutionRecord({
        id: commitId,
        graph: preview.graph,
        profile: 'procedural-commit',
        status: 'succeeded',
        startedAt,
        completedAt,
        inputs: preview.inputs,
        outputs: {
          [selectedOutputId]: {
            kind: 'cts.instance.patch',
            typeId: proposal.typeId,
            instanceId: proposal.instanceId,
            expectedRevision: proposal.expectedRevision,
            committedRevision,
            conflictPolicy: 'fail'
          }
        },
        nodeOutputs: preview.nodeOutputs,
        diagnostics: [],
        provenance: {
          nodes: preview.provenance.nodes,
          invocations: [...preview.provenance.invocations, {
            kind: 'commit',
            provider: 'perigram.cts',
            operation: 'instance.patch',
            outputId: selectedOutputId,
            typeId: proposal.typeId,
            instanceId: proposal.instanceId,
            expectedRevision: proposal.expectedRevision,
            committedRevision
          }]
        },
        readSet: preview.readSet,
        artifacts: [...preview.artifacts, {
          kind: 'cts.instance',
          typeId: proposal.typeId,
          instanceId: proposal.instanceId,
          revision: committedRevision,
          outputId: selectedOutputId,
          sourceExecutionId: preview.id,
          conflictPolicy: 'fail'
        }]
      });
      const execution = await persistRecord(commitRecord, graphDocument, organizationId, auth, session);
      return { instance: updated, execution: commitRecord, persisted: execution };
    });
  } catch (error) {
    if (error?.statusCode) throw error;
    throw createError({
      statusCode: 500,
      message: 'CTS update and graph execution evidence could not be committed atomically',
      data: {
        typeId: proposal.typeId,
        instanceId: proposal.instanceId,
        cause: error?.message || String(error)
      }
    });
  }
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
  const isPageFile = destination.type === 'page-file';
  const isInstancePayload = destination.type === 'instance-payload';
  const isInstanceCreate = destination.type === 'instance-create';
  if (isPageFile && (!destination.pageId || !destination.path)) {
    throw createError({ statusCode: 400, message: 'Page-file Bake requires an exact Page and relative file path' });
  }
  if (isInstancePayload && (!destination.typeId || !destination.instanceId || destination.expectedRevision == null)) {
    throw createError({ statusCode: 400, message: 'Instance-payload Bake requires an exact type, instance, and expected revision' });
  }
  if (isInstanceCreate && (!destination.typeId || !destination.draft || typeof destination.draft !== 'object' || Array.isArray(destination.draft) || destination.draft.payload != null)) {
    throw createError({ statusCode: 400, message: 'New-instance Bake requires a typed instance draft without a caller-supplied payload' });
  }
  if (!isPageFile && !isInstancePayload && !isInstanceCreate) {
    throw createError({ statusCode: 400, message: 'Bake destination must be page-file, instance-payload, or instance-create' });
  }
  if ((isInstancePayload || isInstanceCreate) && destination.conflictPolicy != null && destination.conflictPolicy !== 'fail') {
    throw createError({ statusCode: 400, message: 'Instance Bake supports only fail-on-conflict semantics' });
  }
  const { graphDocument, graph, organizationId } = await sourceFor(graphDocumentInstanceId, preview, auth);
  if (!(graph.interface?.outputs || []).some(port => String(port.id) === selectedOutputId)) {
    throw createError({ statusCode: 400, message: `Graph revision does not declare output ${selectedOutputId}` });
  }

  const { buffer, mimeType, filename: materializedFilename } = await materializeOutput(preview.outputs[selectedOutputId], auth, graph, selectedOutputId,
    (isInstancePayload || isInstanceCreate) ? destination.filename || null : null);

  if (isInstancePayload || isInstanceCreate) {
    const instanceService = getAppRegistry().getInstanceService(String(destination.typeId));
    if (isInstancePayload && typeof instanceService?.replacePayload !== 'function') {
      throw createError({ statusCode: 404, message: 'CTS payload replacement service is unavailable' });
    }
    if (isInstanceCreate && typeof instanceService?.createForHttp !== 'function') {
      throw createError({ statusCode: 404, message: 'CTS instance creation service is unavailable' });
    }
    const filename = materializedFilename;
    const stored = await filesService.uploadFile(buffer, filename, {
      userId: auth.userId,
      organizationId,
      type: String(destination.typeId)
    }, 'files', mimeType || 'application/octet-stream');
    try {
      return await withMongoWriteTransaction(async session => {
        await assertPreviewReadSetCurrent(preview.readSet, organizationId, auth, graphDocument, { session });
        const updated = isInstancePayload
          ? await instanceService.replacePayload(destination.instanceId, {
              buffer,
              filename,
              mimeType
            }, {
              auth,
              userId: auth.userId,
              organizationId,
              session,
              expectedRevision: destination.expectedRevision,
              expectedOrganizationSequence: expectedSequenceForReadSet(preview.readSet),
              storedFile: stored
            })
          : await instanceService.createForHttp({
              ...destination.draft,
              payload: {
                fileId: stored.id,
                mime: mimeType || null,
                size: buffer.length,
                name: filename
              }
            }, { auth, userId: auth.userId, organizationId, session });
        const timestamp = new Date().toISOString();
        const bakeId = randomUUID();
        const bakeRecord = createGraphExecutionRecord({
          ...preview,
          id: bakeId,
          profile: 'procedural-bake',
          status: 'succeeded',
          startedAt: timestamp,
          completedAt: timestamp,
          artifacts: [...(preview.artifacts || []), {
            kind: 'instance-payload',
            typeId: String(destination.typeId),
            instanceId: String(updated._id ?? updated.id),
            created: isInstanceCreate,
            revision: updated.revision == null ? null : String(updated.revision),
            fileId: stored.id,
            filename,
            mime: mimeType || null,
            size: buffer.length,
            outputId: selectedOutputId,
            sourceExecutionId: preview.id,
            conflictPolicy: 'fail',
            bucket: 'files'
          }]
        });
        const persisted = await persistRecord(bakeRecord, graphDocument, organizationId, auth, session);
        return { instance: updated, execution: bakeRecord, persisted };
      });
    } catch (error) {
      try {
        await filesService.deleteFile(stored.id, 'files');
      } catch (rollbackError) {
        throw createError({
          statusCode: 500,
          message: 'Instance-payload Bake failed and its uploaded file could not be removed',
          data: { bakeError: error?.message || String(error), rollbackError: rollbackError?.message || String(rollbackError), fileId: stored.id }
        });
      }
      if (error?.statusCode) throw error;
      throw createError({
        statusCode: 500,
        message: 'CTS payload and graph execution evidence could not be committed atomically',
        data: { typeId: String(destination.typeId), instanceId: String(destination.instanceId), cause: error?.message || String(error) }
      });
    }
  }

  await assertPreviewReadSetCurrent(preview.readSet, organizationId, auth, graphDocument);
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

export async function exportOutput({ graphDocumentInstanceId, record: value, outputId, filename = null } = {}, auth = {}) {
  const preview = parseRecord(value);
  if (preview.profile !== 'procedural-preview' || preview.status !== 'succeeded') {
    throw createError({ statusCode: 409, message: 'Export requires a successful procedural preview' });
  }
  const selectedOutputId = String(outputId || '');
  if (!Object.hasOwn(preview.outputs || {}, selectedOutputId)) {
    throw createError({ statusCode: 400, message: 'Selected graph output is unavailable' });
  }
  const { graphDocument, graph, organizationId } = await sourceFor(graphDocumentInstanceId, preview, auth);
  if (!(graph.interface?.outputs || []).some(port => String(port.id) === selectedOutputId)) {
    throw createError({ statusCode: 400, message: `Graph revision does not declare output ${selectedOutputId}` });
  }
  await assertPreviewReadSetCurrent(preview.readSet, organizationId, auth, graphDocument);

  const materialized = await materializeOutput(preview.outputs[selectedOutputId], auth, graph, selectedOutputId, filename);
  const exportId = randomUUID();
  const timestamp = new Date().toISOString();
  const exportRecord = createGraphExecutionRecord({
    ...preview,
    id: exportId,
    profile: 'procedural-export',
    status: 'succeeded',
    startedAt: timestamp,
    completedAt: timestamp,
    artifacts: [...(preview.artifacts || []), {
      kind: 'download',
      filename: materialized.filename,
      mime: materialized.mimeType,
      size: materialized.buffer.length,
      outputId: selectedOutputId,
      sourceExecutionId: preview.id
    }]
  });
  const execution = await persistRecord(exportRecord, graphDocument, organizationId, auth);
  return { ...materialized, execution };
}
