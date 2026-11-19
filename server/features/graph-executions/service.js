import { randomUUID } from 'node:crypto';
import { createError } from 'h3';
import { withMongoSnapshotTransaction } from '~/server/db/transactions.js';
import { assertValidGraphDocument, assertValidGraphExecutionRecord, createGraphExecutionRecord, createGraphReadSetRecorder, evaluateProceduralGraph, lowerGraphToTypedIR, createCoreGraphDataProvider, CORE_DATA_PROVIDER } from '#packages/core';
import { createPortCompatibilityRegistry } from '#packages/plugin-sdk/nodes';
import { registerProcessPortCompatibilityProfile } from '#packages/processes';
import { ensureOrganizationChangeIndexes, withOrganizationChangeSequence, withOrganizationDataSnapshot } from '../instances/index.js';
import { declarationForType } from '../instances/service.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import * as filesService from '../files/service.js';
import * as pagesService from '../pages/service.js';
import * as instanceRevisionsService from '../instance-revisions/service.js';
import { assertRevisionSourceReadable } from '~/server/utils/revision-access.js';
import { resolveInstalledGraphNodeDefinition, executeManagedGraphNode } from '../plugins/service.js';
import { PLUGIN_RUNTIME_CAPABILITIES } from '#shared/plugin-runtime.js';

function parseRecord(value) {
  try {
    return assertValidGraphExecutionRecord(value);
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid graph execution record', data: { message: error.message, problems: error.problems || [] } });
  }
}

export async function readSavedGraph(graphDocument, auth) {
  if (!graphDocument?.payload?.fileId) {
    throw createError({ statusCode: 409, message: 'Graph document has no saved payload' });
  }
  const file = await filesService.findFileMeta(graphDocument.payload.fileId, 'files');
  if (!file) throw createError({ statusCode: 404, message: 'Graph payload not found' });
  filesService.assertFileReadAccess(file.metadata, auth);
  try {
    return assertValidGraphDocument(JSON.parse(
      (await filesService.getFileBuffer(graphDocument.payload.fileId, 'files')).toString('utf8')
    ));
  } catch (error) {
    throw createError({
      statusCode: 409,
      message: 'Saved graph payload is unavailable or invalid',
      data: { message: error.message }
    });
  }
}

// Resolve a Use Graph pin only from graph documents readable in the caller's
// organization. Graph ids are not unique across revisions, so the immutable
// revision is verified against each authorized document's actual payload.
export async function resolvePinnedGraph(graphId, revision, auth = {}) {
  const id = String(graphId || '').trim();
  const pinnedRevision = String(revision || '').trim();
  if (!id || !pinnedRevision) {
    throw createError({ statusCode: 400, message: 'Pinned graph resolution requires graphId and revision' });
  }
  const service = getAppRegistry().getInstanceService('graph-document');
  if (typeof service?.processList !== 'function') {
    throw createError({ statusCode: 503, message: 'Graph document listing is unavailable' });
  }
  const candidates = await service.processList({ graphId: id, limit: 1000 }, auth);
  if ((candidates || []).length >= 1000) {
    throw createError({ statusCode: 409, message: 'Too many graph revisions to resolve this pin safely' });
  }
  const matches = [];
  for (const candidate of candidates || []) {
    if (String(candidate.fields?.graphId || '') !== id) continue;
    const graph = await readSavedGraph(candidate, auth);
    if (graph.id === id && String(graph.revision) === pinnedRevision) {
      matches.push({ graphDocument: candidate, graph });
    }
  }
  if (!matches.length) {
    throw createError({ statusCode: 404, message: `Pinned graph ${id}@${pinnedRevision} is unavailable to this organization` });
  }
  if (matches.length !== 1) {
    throw createError({ statusCode: 409, message: `Pinned graph ${id}@${pinnedRevision} is ambiguous` });
  }
  return matches[0];
}

export async function savedGraphSource(instanceId, auth, pinnedRevision = '') {
  if (!instanceId) throw createError({ statusCode: 400, message: 'Graph document instance is required' });
  const service = getAppRegistry().getInstanceService('graph-document');
  const graphDocument = await service?.processGetById?.(String(instanceId), auth);
  if (!graphDocument) throw createError({ statusCode: 404, message: 'Graph document not found' });
  const graph = await readSavedGraph(graphDocument, auth);
  if (String(graphDocument.fields?.graphId || '') !== graph.id) {
    throw createError({ statusCode: 409, message: 'Saved graph identity does not match its graph document' });
  }
  const organizationId = graphDocument.organizationId || auth.organizationId || auth.memberships?.[0]?.organizationId || null;
  const pin = String(pinnedRevision || '').trim();
  if (!pin || String(graph.revision) === pin) {
    return { graphDocument, graph, organizationId };
  }
  const revisions = await instanceRevisionsService.list(auth.userId, auth.organizationId, auth.role, auth, {
    typeId: 'graph-document',
    instanceId: String(instanceId),
    scope: 'content'
  });
  for (const revision of revisions || []) {
    try {
      await assertRevisionSourceReadable(revision, auth);
    } catch (error) {
      if ([403, 404].includes(error?.statusCode)) continue;
      throw error;
    }
    const file = await instanceRevisionsService.pinnedRevisionFile(String(revision._id));
    if (!file) continue;
    let pinned = null;
    try {
      pinned = assertValidGraphDocument(JSON.parse(
        (await filesService.getFileBuffer(file.fileId, file.bucket)).toString('utf8')
      ));
    } catch {
      continue;
    }
    if (pinned.id === graph.id && String(pinned.revision) === pin) {
      return { graphDocument, graph: pinned, organizationId };
    }
  }
  throw createError({ statusCode: 409, message: 'Pinned graph revision is unavailable for this document' });
}

async function sourceFor(instanceId, record, auth) {
  const source = await savedGraphSource(instanceId, auth);
  if (source.graph.id !== record.graph.id || source.graph.revision !== record.graph.revision) {
    throw createError({ statusCode: 409, message: 'Execution graph revision is stale; save and preview the current revision' });
  }
  return source;
}

// Server-side saved-graph preview orchestration. Provider resolution and node
// execution are injected by the managed runtime host; graph documents and
// Use Graph revisions are always resolved through the caller's read grants.
// The server graph resolution stack shared by evaluation and authoring
// preflight: core provider definitions beside the caller's installed managed
// providers, with package pins and capability tracking.
function createServerGraphResolution(auth) {
  const coreDataProvider = createCoreGraphDataProvider();
  const coreDefinitions = new Map(coreDataProvider.definitions.map(definition => [
    `${definition.provider}/${definition.id}@${definition.version}`,
    definition
  ]));
  const providerPins = new Map();
  const providerCapabilities = new Set();
  const resolveNodeDefinition = async operation => {
    const key = `${operation.provider}/${operation.id}@${operation.version}`;
    if (operation.provider === CORE_DATA_PROVIDER) {
      const definition = coreDefinitions.get(key);
      if (!definition) throw createError({ statusCode: 409, message: `Unsupported core graph operation ${key}` });
      return definition;
    }
    const definition = await resolveInstalledGraphNodeDefinition({
      provider: operation.provider,
      id: operation.id,
      version: operation.version,
      auth
    });
    for (const capability of definition.execution?.capabilities || []) {
      // Only capabilities with host adapters can gain host-verified evidence;
      // anything else stays a permanent unverified marker (fail closed).
      if (!PLUGIN_RUNTIME_CAPABILITIES.includes(String(capability))) {
        providerCapabilities.add(String(capability));
      }
    }
    const pin = definition.packagePin;
    if (!pin?.pluginId || !pin.version || !pin.runtimeId || !pin.operationId) {
      throw createError({ statusCode: 409, message: `Installed graph provider ${key} returned no immutable package pin` });
    }
    providerPins.set(`${pin.pluginId}@${pin.version}/${pin.runtimeId}`, {
      ...pin,
      operations: [...new Set([
        ...(providerPins.get(`${pin.pluginId}@${pin.version}/${pin.runtimeId}`)?.operations || []),
        pin.operationId
      ])].sort()
    });
    return definition;
  };
  return { coreDataProvider, coreDefinitions, providerPins, providerCapabilities, resolveNodeDefinition };
}

// Lowering through the shared server stack; an unavailable pinned subgraph
// lowers to a node-mapped diagnostic (README Contract).
async function lowerGraphForServer(graph, resolution, auth) {
  const compatibilityRegistry = createPortCompatibilityRegistry();
  registerProcessPortCompatibilityProfile(compatibilityRegistry);
  return await lowerGraphToTypedIR({
    graph,
    resolveNodeDefinition: resolution.resolveNodeDefinition,
    resolveGraph: async (graphId, revision) => {
      try {
        return (await resolvePinnedGraph(graphId, revision, auth)).graph;
      } catch (error) {
        if ([400, 403, 404, 409].includes(Number(error?.statusCode))) return null;
        throw error;
      }
    },
    resolveCompatibility: (sourcePort, targetPort) => (
      sourcePort.semantic?.base && targetPort.semantic?.base
        ? compatibilityRegistry.compare(sourcePort, targetPort)
        : { status: 'exact', compatible: true, reason: 'Port contracts carry no declared semantics', conversions: [] }
    ),
    executionTarget: 'server'
  });
}

/**
 * Typed-IR preflight over a submitted canonical graph document — the
 * evaluator's own lowering (same resolution path, same compatibility
 * profile) with no execution. Invalid documents answer validation-phase
 * diagnostics; resolution, pin, and edge failures answer node/edge-mapped
 * lowering diagnostics.
 */
export async function preflightGraphForServer(graph, auth = {}) {
  return await lowerGraphForServer(graph, createServerGraphResolution(auth), auth);
}

export async function evaluateSavedGraph({
  graphDocumentInstanceId,
  graphRevision = '',
  inputBindings = {},
  executeManagedNode = executeManagedGraphNode,
  context = {}
} = {}, auth = {}) {
  if (typeof executeManagedNode !== 'function') {
    throw createError({ statusCode: 500, message: 'Managed graph node execution handler is unavailable' });
  }
  const source = await savedGraphSource(graphDocumentInstanceId, auth, graphRevision);
  const executionId = String(context.executionId || randomUUID());
  const maxExecutionMs = Math.min(Math.max(Number(context.maxExecutionMs) || 300000, 1000), 300000);
  const deadline = Date.now() + maxExecutionMs;
  const controller = new AbortController();
  const externalSignal = context.signal;
  const abortFromExternal = () => {
    if (!controller.signal.aborted) controller.abort(externalSignal.reason);
  };
  if (externalSignal?.aborted) abortFromExternal();
  else externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
  const deadlineTimer = setTimeout(() => {
    if (!controller.signal.aborted) {
      const error = new Error('Server graph execution deadline exceeded');
      error.name = 'TimeoutError';
      error.code = 'GRAPH_EXECUTION_TIMEOUT';
      controller.abort(error);
    }
  }, maxExecutionMs);
  const resolution = createServerGraphResolution(auth);
  const { coreDataProvider, resolveNodeDefinition, providerPins, providerCapabilities } = resolution;
  const capabilityEvidence = [];
  const nodeInvocations = [];
  const graphInvocations = [];
  // The evaluator abandons a node's promise when the signal aborts; the
  // in-flight registry lets the failure snapshot await those tasks so their
  // cancellation evidence and task cleanup land in the persisted record.
  const nodeTasksInFlight = new Set();
  const trackNodeTask = promise => {
    nodeTasksInFlight.add(promise);
    promise.finally(() => nodeTasksInFlight.delete(promise)).catch(() => {});
    return promise;
  };
  const executeNode = async (definition, invocation) => {
    if (definition.provider === CORE_DATA_PROVIDER) {
      return await coreDataProvider.execute(definition, invocation);
    }
    const evidenceCount = nodeInvocations.length;
    const evidence = {
      nodeId: invocation.node?.id || null,
      invocationPath: invocation.invocationPath || [],
      operation: {
        provider: definition.provider,
        id: definition.id,
        version: definition.version
      },
      executionKind: definition.execution?.kind || null,
      ...(definition.packagePin ? { packagePin: definition.packagePin } : {})
    };
    return await trackNodeTask((async () => {
      try {
        const output = await executeManagedNode(definition, invocation, auth);
        if (nodeInvocations.length === evidenceCount) {
          nodeInvocations.push({ ...evidence, status: 'succeeded' });
        }
        return output;
      } catch (error) {
        if (nodeInvocations.length === evidenceCount) {
          nodeInvocations.push({
            ...evidence,
            status: error?.name === 'AbortError' ? 'cancelled' : error?.name === 'TimeoutError' ? 'timed-out' : 'failed',
            error: String(error?.message || error)
          });
        }
        throw error;
      }
    })());
  };
  try {
    const { diagnostics: loweringDiagnostics } = await lowerGraphForServer(source.graph, resolution, auth);
    const loweringErrors = loweringDiagnostics.filter(item => item.severity === 'error');
    if (loweringErrors.length) {
      throw createError({
        statusCode: 400,
        message: `Graph does not lower for server execution: ${loweringErrors.map(item => item.message).join('; ')}`,
        data: { diagnostics: loweringErrors }
      });
    }
    const result = await evaluateProceduralGraph({
      graph: source.graph,
      inputBindings,
      resolveNodeDefinition,
      executeNode,
      resolveGraph: async (graphId, revision) => (await resolvePinnedGraph(graphId, revision, auth)).graph,
      context: {
        ...context,
        executionId,
        signal: controller.signal,
        remainingExecutionMs: () => Math.max(0, deadline - Date.now()),
        nodeInvocations,
        graphInvocations,
        capabilityEvidence,
        data: {
          ...(context.data || {}),
          queryInstances: query => queryOrganizationData(query, auth)
        }
      },
      mode: 'preview',
      executionTarget: 'server'
    });
    for (const evidence of capabilityEvidence) {
      const name = String(evidence.name || '');
      if (!name) continue;
      // Host-verified evidence relaxes the marker only when its shape carries
      // the capability's identifying proof; worker-claimed or malformed
      // evidence stays an unverified marker (fail closed).
      if (evidence.verified !== true) {
        providerCapabilities.add(name);
        continue;
      }
      if (['organization.instances.query', 'organization.instances.read'].includes(name)
        && (!evidence.readSet || !Array.isArray(evidence.readSet.queries))) {
        providerCapabilities.add(name);
      } else if (name === 'files.read'
        && (!evidence.input?.fileId || !evidence.contentHash)) {
        providerCapabilities.add('files.read');
      } else if (['organization.instances.create', 'organization.instances.update'].includes(name)
        && (!evidence.input?.typeId || !evidence.instance?.instanceId)) {
        providerCapabilities.add(name);
      } else if (name === 'organization.instances.delete'
        && (!evidence.input?.typeId || !evidence.input?.instanceId)) {
        providerCapabilities.add(name);
      }
    }
    return {
      ...source,
      ...result,
      executionId,
      providerPins: [...providerPins.values()],
      providerCapabilities: [...providerCapabilities].sort(),
      capabilityEvidence,
      nodeInvocations,
      graphInvocations,
      readSet: {
        ...result.readSet,
        unverifiedCapabilities: [...providerCapabilities].sort()
      }
    };
  } catch (error) {
    if (nodeTasksInFlight.size) {
      await Promise.allSettled([...nodeTasksInFlight]);
    }
    error.graphExecution = {
      ...source,
      executionId,
      providerPins: [...providerPins.values()],
      providerCapabilities: [...providerCapabilities].sort(),
      capabilityEvidence,
      nodeInvocations,
      graphInvocations
    };
    throw error;
  } finally {
    clearTimeout(deadlineTimer);
    externalSignal?.removeEventListener('abort', abortFromExternal);
  }
}

export async function evaluateAndRecordSavedGraphPreview(args = {}, auth = {}) {
  const executionId = randomUUID();
  const startedAt = new Date().toISOString();
  let result = null;
  let failure = null;
  try {
    result = await evaluateSavedGraph({
      ...args,
      context: { ...(args.context || {}), executionId }
    }, auth);
  } catch (error) {
    failure = error;
    result = error.graphExecution || null;
    if (!result) throw error;
  }

  const source = result;
  const completedAt = new Date().toISOString();
  const readSet = failure?.readSet || result.readSet || {
    instances: [], relations: [], queries: [], unverifiedCapabilities: []
  };
  const diagnostics = failure
    ? (Array.isArray(failure.diagnostics) ? failure.diagnostics
      : Array.isArray(failure.data?.diagnostics) ? failure.data.diagnostics
      : [{
        code: failure.code || 'graph-evaluation-failed',
        severity: 'error',
        phase: 'graph',
        graphId: source.graph.id,
        graphRevision: source.graph.revision,
        nodeId: failure.nodeId || null,
        message: String(failure.message || failure)
      }])
    : (result.diagnostics || []);
  const record = createGraphExecutionRecord({
    id: executionId,
    graph: { id: source.graph.id, revision: source.graph.revision },
    profile: 'procedural-preview',
    status: failure ? (failure.name === 'AbortError' ? 'cancelled' : 'failed') : 'succeeded',
    startedAt,
    completedAt,
    inputs: args.inputBindings || {},
    outputs: failure ? {} : result.outputs,
    nodeOutputs: failure ? {} : result.nodeOutputs,
    diagnostics,
    provenance: {
      nodes: result.nodeInvocations || [],
      invocations: result.graphInvocations || [],
      providers: result.providerPins || [],
      capabilities: result.capabilityEvidence || [],
      unverifiedCapabilities: result.providerCapabilities || []
    },
    readSet,
    artifacts: []
  });
  const instance = await persistRecord(record, source.graphDocument, source.organizationId, auth);
  return { execution: record, instance };
}

function expectedSequenceForReadSet(readSet) {
  const start = readSet?.organizationSequenceStart;
  const end = readSet?.organizationSequenceEnd;
  return Number.isSafeInteger(start) && start >= 0 && start === end ? end : null;
}

function expectedSequenceForValidation(readSet, boundary) {
  const previewSequence = expectedSequenceForReadSet(readSet);
  if (previewSequence != null) return previewSequence;
  const validatedSequence = boundary?.organizationSequenceEnd;
  return Number.isSafeInteger(validatedSequence) && validatedSequence >= 0
    ? validatedSequence
    : null;
}

function stableJson(value) {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function resolveBakeInstanceTarget(destination, readSet = {}) {
  if (destination.instanceId != null) {
    if (destination.selector != null || destination.expectedRevision == null) {
      throw createError({ statusCode: 400, message: 'Exact instance Bake requires only instanceId and expectedRevision; do not combine it with a selector' });
    }
    const instanceId = String(destination.instanceId).trim();
    const expectedRevision = String(destination.expectedRevision).trim();
    if (!instanceId || !expectedRevision) {
      throw createError({ statusCode: 400, message: 'Exact instance Bake requires a non-empty instance id and revision' });
    }
    const dependency = (readSet.instances || []).find(item =>
      String(item.typeId) === String(destination.typeId) && String(item.instanceId) === instanceId
    );
    if (dependency?.revision != null && String(dependency.revision) !== expectedRevision) {
      throw stalePreviewError('Bake target revision does not match the graph preview read set');
    }
    return { instanceId, expectedRevision };
  }

  const selector = destination.selector;
  const sourceQuery = selector?.query;
  if (!sourceQuery || typeof sourceQuery !== 'object' || Array.isArray(sourceQuery)
    || Object.keys(sourceQuery).some(key => !['typeId', 'filters', 'sortBy', 'sortDirection', 'limit', 'offset', 'projection'].includes(key))
    || (sourceQuery.filters != null && (typeof sourceQuery.filters !== 'object' || Array.isArray(sourceQuery.filters)))
    || String(sourceQuery.typeId || '') !== String(destination.typeId)
    || sourceQuery.limit !== 1 || (sourceQuery.offset != null && sourceQuery.offset !== 0)
    || (selector.resultIndex != null && selector.resultIndex !== 0)) {
    throw createError({ statusCode: 400, message: 'Instance Bake selector must identify one exact type query with limit 1, offset 0, and resultIndex 0' });
  }
  const query = {
    typeId: String(sourceQuery.typeId),
    filters: sourceQuery.filters || {},
    sortBy: sourceQuery.sortBy == null ? 'createdAt' : String(sourceQuery.sortBy),
    sortDirection: sourceQuery.sortDirection == null ? 'desc' : String(sourceQuery.sortDirection),
    limit: 1,
    offset: 0,
    projection: sourceQuery.projection ?? null
  };
  const matches = (readSet.queries || []).filter(item => stableJson(item.query) === stableJson(query));
  if (matches.length !== 1) {
    throw stalePreviewError('Bake selector must match exactly one query recorded by the successful preview');
  }
  const result = matches[0];
  if (result.resultIds?.length !== 1 || result.observedTotal !== 1) {
    throw stalePreviewError('Bake selector did not resolve exactly one instance in the preview');
  }
  const instanceId = String(result.resultIds[0]);
  const dependency = (readSet.instances || []).find(item =>
    String(item.typeId) === String(destination.typeId) && String(item.instanceId) === instanceId
  );
  if (!dependency?.revision) {
    throw stalePreviewError('Bake selector target has no revision in the preview read set');
  }
  return { instanceId, expectedRevision: String(dependency.revision) };
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

async function assertPreviewReadSetCurrent(readSet = {}, organizationId, auth, sourceGraphDocument, { session = null, requireStableReadSet = false } = {}) {
  const unverifiedCapabilities = Array.isArray(readSet.unverifiedCapabilities) ? readSet.unverifiedCapabilities : [];
  if (unverifiedCapabilities.length) {
    throw stalePreviewError(`Graph preview consumed capabilities without verifiable read evidence: ${unverifiedCapabilities.join(', ')}`);
  }
  const instances = Array.isArray(readSet.instances) ? readSet.instances : [];
  const relations = Array.isArray(readSet.relations) ? readSet.relations : [];
  const queries = Array.isArray(readSet.queries) ? readSet.queries : [];
  const files = Array.isArray(readSet.files) ? readSet.files : [];
  const start = readSet.organizationSequenceStart;
  const end = readSet.organizationSequenceEnd;
  const hasStableSequence = Number.isSafeInteger(start) && start >= 0 && start === end;
  const supportedBoundary = readSet.consistency === 'snapshot' || readSet.consistency === 'sequence-bracketed';
  if (requireStableReadSet && (instances.length || relations.length || queries.length)
    && (!organizationId || !hasStableSequence || !supportedBoundary
      || (readSet.consistency === 'snapshot' && !readSet.snapshotId))) {
    throw stalePreviewError('Durable Bake/Export requires a stable organization snapshot or sequence-bracketed read set');
  }

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

    for (const dependency of files) {
      if (!dependency.fileId || !dependency.contentHash) {
        throw stalePreviewError('A graph file dependency has no verifiable content hash');
      }
      const currentFile = await filesService.findFileMeta(dependency.fileId, 'files');
      if (!currentFile) throw stalePreviewError('A graph file dependency was deleted');
      filesService.assertFileReadAccess(currentFile.metadata, auth);
      if (dependency.organizationId != null
        && String(currentFile.metadata?.organizationId ?? '') !== String(dependency.organizationId)) {
        throw stalePreviewError('A graph file dependency changed organization after preview');
      }
      const currentBuffer = await filesService.getFileBuffer(dependency.fileId, 'files');
      if (filesService.contentHash(currentBuffer) !== dependency.contentHash) {
        throw stalePreviewError('A graph file dependency changed after preview');
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
    return { consistency: 'unverified', organizationSequenceEnd: null };
  }

  const { boundary } = await withOrganizationChangeSequence(organizationId, validate, { retries: 2 });
  if (hasStableSequence && (boundary.organizationSequenceStart !== end || boundary.organizationSequenceEnd !== end)) {
    throw stalePreviewError('Organization data changed after preview; evaluate again before materializing output');
  }
  return boundary;
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
  } else if (output && typeof output === 'object' && typeof output.payload?.base64 === 'string' && typeof output.payload?.mime === 'string') {
    const encoded = output.payload.base64.replace(/\\s/g, '');
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw createError({ statusCode: 400, message: 'Graph file payload must contain valid base64 content' });
    buffer = Buffer.from(encoded, 'base64');
    mimeType = normalizeOutputMimeType(output.payload.mime);
    sourceFilename = output.payload.name || null;
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
    return await withMongoSnapshotTransaction(async session => {
      const validationBoundary = await assertPreviewReadSetCurrent(preview.readSet, organizationId, auth, graphDocument, { session });
      const startedAt = new Date().toISOString();
      const updated = await instanceService.patch(proposal.instanceId, proposal.patch, {
        auth,
        organizationId,
        expectedRevision: proposal.expectedRevision,
        expectedOrganizationSequence: expectedSequenceForValidation(preview.readSet, validationBoundary),
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
  const isInstanceField = destination.type === 'instance-field';
  const isInstanceRelation = destination.type === 'instance-relation';
  if (isPageFile && (!destination.pageId || !destination.path)) {
    throw createError({ statusCode: 400, message: 'Page-file Bake requires an exact Page and relative file path' });
  }
  if (isInstancePayload && (!destination.typeId || !((destination.instanceId != null && destination.expectedRevision != null && destination.selector == null) || (destination.instanceId == null && destination.expectedRevision == null && destination.selector != null)))) {
    throw createError({ statusCode: 400, message: 'Instance-payload Bake requires an exact revisioned instance or a single-result preview selector' });
  }
  if (isInstanceField && (!destination.typeId || !destination.fieldId || !((destination.instanceId != null && destination.expectedRevision != null && destination.selector == null) || (destination.instanceId == null && destination.expectedRevision == null && destination.selector != null)))) {
    throw createError({ statusCode: 400, message: 'Instance-field Bake requires a declared Blob field and an exact revisioned instance or a single-result preview selector' });
  }
  if (isInstanceRelation && (!destination.typeId || !destination.fileTypeId || !destination.relationKey
    || !((destination.instanceId != null && destination.expectedRevision != null && destination.selector == null)
      || (destination.instanceId == null && destination.expectedRevision == null && destination.selector != null)))) {
    throw createError({ statusCode: 400, message: 'Instance-relation Bake requires a declared relation, revisioned owner target, and revisioned file type' });
  }
  if (isInstanceCreate && (!destination.typeId || !destination.draft || typeof destination.draft !== 'object' || Array.isArray(destination.draft)
    || Object.keys(destination.draft).some(key => !['name', 'fields', 'lineage', 'relations'].includes(key)))) {
    throw createError({ statusCode: 400, message: 'New-instance Bake requires a typed instance draft without a caller-supplied payload' });
  }
  if (!isPageFile && !isInstancePayload && !isInstanceCreate && !isInstanceField && !isInstanceRelation) {
    throw createError({ statusCode: 400, message: 'Bake destination must be page-file, instance-payload, instance-field, instance-relation, or instance-create' });
  }
  if ((isInstancePayload || isInstanceCreate || isInstanceField || isInstanceRelation) && destination.conflictPolicy != null && destination.conflictPolicy !== 'fail') {
    throw createError({ statusCode: 400, message: 'Instance Bake supports only fail-on-conflict semantics' });
  }
  const { graphDocument, graph, organizationId } = await sourceFor(graphDocumentInstanceId, preview, auth);
  const activeOrganizationId = auth.organizationId || auth.memberships?.[0]?.organizationId || null;
  if (isPageFile && graphDocument.organizationId != null && activeOrganizationId != null
    && String(graphDocument.organizationId) !== String(activeOrganizationId)) {
    throw createError({ statusCode: 403, message: 'Page-file Bake must stay within the graph document organization' });
  }
  if (!(graph.interface?.outputs || []).some(port => String(port.id) === selectedOutputId)) {
    throw createError({ statusCode: 400, message: `Graph revision does not declare output ${selectedOutputId}` });
  }

  const resolvedInstanceTarget = (isInstancePayload || isInstanceField || isInstanceRelation)
    ? resolveBakeInstanceTarget(destination, preview.readSet)
    : null;
  const { buffer, mimeType, filename: materializedFilename } = await materializeOutput(preview.outputs[selectedOutputId], auth, graph, selectedOutputId,
    (isInstancePayload || isInstanceCreate || isInstanceField || isInstanceRelation) ? destination.filename || null : null);

  if (isInstanceRelation) {
    const ownerTypeId = String(destination.typeId);
    const fileTypeId = String(destination.fileTypeId);
    const relationKey = String(destination.relationKey);
    const fileDeclaration = await declarationForType(fileTypeId, organizationId);
    if (!fileDeclaration?.payload || !fileDeclaration?.revisions) {
      throw createError({ statusCode: 400, message: `Relation attachment type ${fileTypeId} must declare a revisioned payload` });
    }
    const ownerService = getAppRegistry().getInstanceService(ownerTypeId);
    const fileService = getAppRegistry().getInstanceService(fileTypeId);
    if (typeof ownerService?.linkRelationForHttp !== 'function'
      || typeof fileService?.createForHttp !== 'function') {
      throw createError({ statusCode: 404, message: 'CTS relation attachment services are unavailable' });
    }
    const filename = materializedFilename;
    await instanceRevisionsService.ensureRevisionIndexes();
    const stored = await filesService.uploadFile(buffer, filename, {
      userId: auth.userId,
      organizationId,
      type: fileTypeId
    }, 'files', mimeType || 'application/octet-stream');
    if (!stored?.id) throw createError({ statusCode: 500, message: 'Relation attachment storage returned no file identity' });
    try {
      return await withMongoSnapshotTransaction(async session => {
        const validationBoundary = await assertPreviewReadSetCurrent(preview.readSet, organizationId, auth, graphDocument, { session, requireStableReadSet: true });
        const expectedOrganizationSequence = expectedSequenceForValidation(preview.readSet, validationBoundary);
        const attachment = await fileService.createForHttp({
          name: filename,
          payload: {
            fileId: stored.id,
            mime: mimeType || null,
            size: buffer.length,
            name: filename
          }
        }, {
          auth,
          userId: auth.userId,
          organizationId,
          session,
          expectedOrganizationSequence,
          requireRevisionedPayload: true
        });
        const attachmentId = String(attachment._id ?? attachment.id);
        const updated = await ownerService.linkRelationForHttp(
          resolvedInstanceTarget.instanceId,
          relationKey,
          { type: fileTypeId, id: attachmentId },
          {
            auth,
            organizationId,
            expectedRevision: resolvedInstanceTarget.expectedRevision,
            expectedOrganizationSequence: null,
            session
          }
        );
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
            kind: 'instance-relation',
            typeId: ownerTypeId,
            instanceId: String(updated._id ?? updated.id),
            relationKey,
            fileTypeId,
            fileInstanceId: attachmentId,
            fileRevision: attachment.revision == null ? null : String(attachment.revision),
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
        return { instance: updated, attachment, execution: bakeRecord, persisted };
      });
    } catch (error) {
      try {
        await filesService.deleteFile(stored.id, 'files');
      } catch (rollbackError) {
        throw createError({
          statusCode: 500,
          message: 'Relation Bake failed and its uploaded file could not be removed',
          data: { bakeError: error?.message || String(error), rollbackError: rollbackError?.message || String(rollbackError), fileId: stored.id }
        });
      }
      if (error?.statusCode) throw error;
      throw createError({
        statusCode: 500,
        message: 'CTS relation attachment and graph execution evidence could not be committed atomically',
        data: { ownerTypeId, instanceId: resolvedInstanceTarget.instanceId, relationKey, fileTypeId, cause: error?.message || String(error) }
      });
    }
  }

  if (isInstanceField) {
    const typeId = String(destination.typeId);
    const fieldId = String(destination.fieldId);
    const declaration = await declarationForType(typeId, organizationId);
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(fieldId)
      || ['__proto__', 'prototype', 'constructor'].includes(fieldId)
      || !Object.hasOwn(declaration?.fields || {}, fieldId)
      || declaration.fields[fieldId]?.base !== 'blob') {
      throw createError({ statusCode: 400, message: `Instance attachment field ${typeId}.${fieldId} must be declared with base blob` });
    }
    const instanceService = getAppRegistry().getInstanceService(typeId);
    if (typeof instanceService?.patch !== 'function') {
      throw createError({ statusCode: 404, message: 'CTS instance update service is unavailable' });
    }
    const filename = materializedFilename;
    const stored = await filesService.uploadFile(buffer, filename, {
      userId: auth.userId,
      organizationId,
      type: typeId
    }, 'files', mimeType || 'application/octet-stream');
    if (!stored?.id) throw createError({ statusCode: 500, message: 'Attachment file storage returned no file identity' });
    try {
      return await withMongoSnapshotTransaction(async session => {
        const validationBoundary = await assertPreviewReadSetCurrent(preview.readSet, organizationId, auth, graphDocument, { session, requireStableReadSet: true });
        const updated = await instanceService.patch(resolvedInstanceTarget.instanceId, {
          fields: {
            [fieldId]: {
              fileId: stored.id,
              mime: mimeType || null,
              size: buffer.length
            }
          }
        }, {
          auth,
          organizationId,
          expectedRevision: resolvedInstanceTarget.expectedRevision,
          expectedOrganizationSequence: expectedSequenceForValidation(preview.readSet, validationBoundary),
          session
        });
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
            kind: 'instance-field',
            typeId,
            instanceId: String(updated._id ?? updated.id),
            fieldId,
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
          message: 'Instance-field Bake failed and its uploaded file could not be removed',
          data: { bakeError: error?.message || String(error), rollbackError: rollbackError?.message || String(rollbackError), fileId: stored.id }
        });
      }
      if (error?.statusCode) throw error;
      throw createError({
        statusCode: 500,
        message: 'CTS attachment field and graph execution evidence could not be committed atomically',
        data: { typeId, instanceId: resolvedInstanceTarget.instanceId, fieldId, cause: error?.message || String(error) }
      });
    }
  }

  if (isInstancePayload || isInstanceCreate) {
    const instanceService = getAppRegistry().getInstanceService(String(destination.typeId));
    if (isInstancePayload && typeof instanceService?.replacePayload !== 'function') {
      throw createError({ statusCode: 404, message: 'CTS payload replacement service is unavailable' });
    }
    if (isInstanceCreate && typeof instanceService?.createForHttp !== 'function') {
      throw createError({ statusCode: 404, message: 'CTS instance creation service is unavailable' });
    }
    const filename = materializedFilename;
    await instanceRevisionsService.ensureRevisionIndexes();
    const stored = await filesService.uploadFile(buffer, filename, {
      userId: auth.userId,
      organizationId,
      type: String(destination.typeId)
    }, 'files', mimeType || 'application/octet-stream');
    try {
      return await withMongoSnapshotTransaction(async session => {
        const validationBoundary = await assertPreviewReadSetCurrent(preview.readSet, organizationId, auth, graphDocument, { session, requireStableReadSet: true });
        const updated = isInstancePayload
          ? await instanceService.replacePayload(resolvedInstanceTarget.instanceId, {
              buffer,
              filename,
              mimeType
            }, {
              auth,
              userId: auth.userId,
              organizationId,
              session,
              expectedRevision: resolvedInstanceTarget.expectedRevision,
              expectedOrganizationSequence: expectedSequenceForValidation(preview.readSet, validationBoundary),
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
            }, { auth, userId: auth.userId, organizationId, session, expectedOrganizationSequence: expectedSequenceForValidation(preview.readSet, validationBoundary), requireRevisionedPayload: true });
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
        data: { typeId: String(destination.typeId), instanceId: resolvedInstanceTarget.instanceId, cause: error?.message || String(error) }
      });
    }
  }

  const validationBoundary = await assertPreviewReadSetCurrent(preview.readSet, organizationId, auth, graphDocument, { requireStableReadSet: true });
  const bakeId = randomUUID();
  const timestamp = new Date().toISOString();
  const baked = await pagesService.bakeFile({
    pageId: destination.pageId,
    path: destination.path,
    buffer,
    mimeType,
    conflictPolicy: destination.conflictPolicy || 'fail',
    expectedOrganizationSequence: expectedSequenceForValidation(preview.readSet, validationBoundary),
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
    const persisted = await persistRecord(bakeRecord, graphDocument, organizationId, auth);
    return { ...baked, execution: bakeRecord, persisted };
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

export async function listCollectionOutputs(auth = {}) {
  const service = getAppRegistry().getInstanceService('graph-execution');
  if (typeof service?.processList !== 'function') return [];
  const records = await service.processList({ limit: 100, sortBy: 'createdAt', sortDirection: 'desc' }, auth);
  const options = [];
  for (const record of records || []) {
    const fields = record?.fields || {};
    const graphDocumentInstanceId = String(fields.graphDocument?.id || '');
    if (fields.status !== 'succeeded' || !graphDocumentInstanceId) continue;
    try {
      const source = await sourceFor(graphDocumentInstanceId, { graph: { id: fields.graphId, revision: fields.graphRevision } }, auth);
      for (const output of source.graph.interface?.outputs || []) {
        const outputId = String(output.id || '');
        const values = fields.outputs?.[outputId];
        if (output.contract?.shape !== 'list' || !Array.isArray(values)) continue;
        options.push({
          executionInstanceId: String(record._id),
          executionId: String(fields.executionId || ''),
          graphDocumentInstanceId,
          graphId: String(fields.graphId),
          graphRevision: String(fields.graphRevision),
          outputId,
          label: String(output.label || outputId),
          count: values.length,
          completedAt: fields.completedAt || null
        });
      }
    } catch (error) {
      if ([403, 404, 409].includes(Number(error?.statusCode || error?.status))) continue;
      throw error;
    }
  }
  return options;
}

export async function resolveCollectionOutput(executionInstanceId, outputId, auth = {}, expected = {}) {
  const service = getAppRegistry().getInstanceService('graph-execution');
  if (typeof service?.processGetById !== 'function') throw createError({ statusCode: 404, message: 'Graph execution not found' });
  const record = await service.processGetById(String(executionInstanceId), auth);
  if (!record) throw createError({ statusCode: 404, message: 'Graph execution not found' });
  const fields = record.fields || {};
  if (fields.status !== 'succeeded' || !fields.graphDocument?.id) {
    throw createError({ statusCode: 409, message: 'Pinned graph execution is unavailable' });
  }
  if ((expected.graphDocumentInstanceId && String(fields.graphDocument.id) !== String(expected.graphDocumentInstanceId))
    || (expected.graphId && String(fields.graphId) !== String(expected.graphId))
    || (expected.graphRevision && String(fields.graphRevision) !== String(expected.graphRevision))) {
    throw createError({ statusCode: 409, message: 'Pinned graph output identity does not match its execution record' });
  }
  const source = await sourceFor(String(fields.graphDocument.id), { graph: { id: fields.graphId, revision: fields.graphRevision } }, auth);
  const output = (source.graph.interface?.outputs || []).find(port => String(port.id) === String(outputId));
  const values = fields.outputs?.[String(outputId)];
  if (!output || output.contract?.shape !== 'list' || !Array.isArray(values)) {
    throw createError({ statusCode: 409, message: 'Pinned graph output is not a list in the saved graph revision' });
  }
  const items = [];
  for (const value of values.slice(0, 100)) {
    const typeId = String(value?.type || value?.typeId || '');
    const instanceId = String(value?.id || value?.instanceId || value?._id || '');
    if (!typeId || !instanceId) {
      items.push({ kind: 'value', value });
      continue;
    }
    const target = getAppRegistry().getInstanceService(typeId);
    try {
      const instance = await target?.processGetById?.(instanceId, auth);
      items.push(instance
        ? { kind: 'instance', typeId, instanceId, instance }
        : { kind: 'unavailable' });
    } catch (error) {
      if ([403, 404].includes(Number(error?.statusCode || error?.status))) items.push({ kind: 'unavailable' });
      else throw error;
    }
  }
  return {
    executionInstanceId: String(record._id),
    executionId: String(fields.executionId || ''),
    graph: { id: String(fields.graphId), revision: String(fields.graphRevision) },
    outputId: String(outputId),
    label: String(output.label || outputId),
    resultPolicy: 'pinned',
    itemCount: values.length,
    truncated: values.length > 100,
    items
  };
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
  await assertPreviewReadSetCurrent(preview.readSet, organizationId, auth, graphDocument, { requireStableReadSet: true });

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
