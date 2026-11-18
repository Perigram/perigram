import { createGraphReadSetRecorder } from './graph-read-set.js';
import {
  assertValidGraphDocument,
  GRAPH_INPUT_OPERATION,
  GRAPH_OUTPUT_OPERATION,
  GRAPH_INVOKE_OPERATION
} from './graph.js';

let previewExecutionSequence = 0;

function executionIdFor(context = {}) {
  return String(
    context.executionId || context.runId ||
    `graph-preview-${Date.now().toString(36)}-${(++previewExecutionSequence).toString(36)}`
  );
}

export async function evaluateProceduralGraph({
  graph: source,
  inputBindings = {},
  resolveNodeDefinition,
  executeNode,
  resolveGraph,
  context = {},
  mode = 'preview',
  executionTarget = 'browser',
  maxGraphDepth = 32
} = {}) {
  if (mode !== 'preview') throw new Error('The procedural evaluator currently supports preview mode only');
  if (!['browser', 'server'].includes(executionTarget)) throw new Error(`Unsupported graph execution target: ${executionTarget}`);
  if (typeof resolveNodeDefinition !== 'function') throw new Error('resolveNodeDefinition callback is required');
  if (typeof executeNode !== 'function') throw new Error('executeNode callback is required');
  const readSetRecorder = createGraphReadSetRecorder(context?.readSetBoundary || {});
  const executionId = executionIdFor(context);
  let primaryError = null;
  try {
    throwIfAborted(context?.signal);
    return await evaluateGraph({
      source,
      inputBindings,
      resolveNodeDefinition,
      executeNode,
      resolveGraph,
      context: { ...context, executionId, readSet: readSetRecorder },
      readSetRecorder,
      stack: [],
      executionTarget,
      maxGraphDepth
    });
  } catch (error) {
    const failure = asError(error);
    primaryError = failure;
    if (!Array.isArray(failure.diagnostics)) {
      failure.diagnostics = [{
        code: typeof failure.code === 'string' ? failure.code : 'graph-evaluation-failed',
        severity: 'error',
        phase: 'graph',
        graphId: source?.id ?? null,
        graphRevision: source?.revision ?? null,
        nodeId: null,
        message: failure.message
      }];
    }
    failure.readSet = readSetRecorder.toJSON();
    throw failure;
  } finally {
    if (typeof context?.finalizeExecution === 'function') {
      try {
        await context.finalizeExecution(executionId);
      } catch (cleanupError) {
        if (primaryError) {
          primaryError.cleanupError = cleanupError?.message || String(cleanupError);
        } else {
          throw cleanupError;
        }
      }
    }
  }
}

async function evaluateGraph(options) {
  throwIfAborted(options.context?.signal);
  const graph = assertValidGraphDocument(options.source);
  const graphKey = `${graph.id}@${graph.revision}`;
  if (options.stack.includes(graphKey)) {
    throw new Error(`Recursive subgraph invocation detected: ${[...options.stack, graphKey].join(' → ')}`);
  }
  if (options.stack.length >= options.maxGraphDepth) {
    throw new Error(`Subgraph nesting exceeds maximum depth ${options.maxGraphDepth}`);
  }

  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const incoming = new Map(graph.nodes.map(node => [node.id, []]));
  const outgoing = new Map(graph.nodes.map(node => [node.id, []]));
  for (const edge of graph.edges) {
    incoming.get(edge.target.node).push(edge);
    outgoing.get(edge.source.node).push(edge);
  }

  const order = topologicalOrder(graph.nodes, graph.edges);
  const values = new Map();
  const nodeOutputs = {};
  const outputs = {};
  const inputIds = new Set(graph.interface.inputs.map(port => port.id));
  const outputIds = new Set(graph.interface.outputs.map(port => port.id));
  const seenInputs = new Set();
  const seenOutputs = new Set();

  for (const nodeId of order) {
    throwIfAborted(options.context?.signal);
    const node = nodes.get(nodeId);
    let phase = 'boundary';
    try {
    const operationId = node.operation.id;

    if (operationId === GRAPH_INPUT_OPERATION) {
      phase = 'boundary-input';
      const interfaceId = node.config.interfaceId;
      if (!inputIds.has(interfaceId)) throw new Error(`Graph Input node ${node.id} references undeclared input ${interfaceId}`);
      if (seenInputs.has(interfaceId)) throw new Error(`Graph input ${interfaceId} has more than one boundary node`);
      seenInputs.add(interfaceId);
      if (outgoing.get(node.id).some(edge => edge.source.port !== 'value')) throw new Error(`Graph Input node ${node.id} exposes only the value output`);
      const port = graph.interface.inputs.find(item => item.id === interfaceId);
      const value = Object.hasOwn(options.inputBindings, interfaceId)
        ? options.inputBindings[interfaceId]
        : (Object.hasOwn(port, 'default') ? port.default : undefined);
      if (value === undefined && port.required) throw new Error(`Required graph input ${interfaceId} was not supplied`);
      if (value === null && port.contract?.semantic?.nullable !== true) {
        throw new Error(`Graph input ${interfaceId} does not accept null`);
      }
      assertSemanticValue(node, 'value', value, port.contract?.shape || 'item', port.contract?.semantic || {});
      values.set(`${node.id}:value`, value);
      nodeOutputs[node.id] = { value };
      continue;
    }

    if (operationId === GRAPH_OUTPUT_OPERATION) {
      phase = 'boundary-output';
      const interfaceId = node.config.interfaceId;
      if (!outputIds.has(interfaceId)) throw new Error(`Graph Output node ${node.id} references undeclared output ${interfaceId}`);
      if (seenOutputs.has(interfaceId)) throw new Error(`Graph output ${interfaceId} has more than one boundary node`);
      seenOutputs.add(interfaceId);
      if (incoming.get(node.id).some(edge => edge.target.port !== 'value')) throw new Error(`Graph Output node ${node.id} accepts only the value input`);
      const outputPort = graph.interface.outputs.find(port => port.id === interfaceId);
      const value = readInput(node, 'value', incoming.get(node.id), values, true, undefined, outputPort?.contract?.shape || 'item', outputPort?.contract?.semantic || {});
      outputs[interfaceId] = value;
      nodeOutputs[node.id] = { value };
      continue;
    }

    if (operationId === GRAPH_INVOKE_OPERATION) {
      phase = 'resolve-subgraph';
      if (typeof options.resolveGraph !== 'function') throw new Error('Use Graph requires a resolveGraph callback');
      const child = await awaitWithSignal(options.resolveGraph(node.config.graphId, node.config.revision), options.context?.signal);
      throwIfAborted(options.context?.signal);
      if (!child) throw new Error(`Pinned subgraph ${node.config.graphId}@${node.config.revision} is unavailable`);
      phase = 'validate-subgraph';
      const childGraph = assertValidGraphDocument(child);
      if (childGraph.id !== node.config.graphId || childGraph.revision !== node.config.revision) {
        throw new Error(`Subgraph resolver returned the wrong graph revision for node ${node.id}`);
      }
      phase = 'map-subgraph-inputs';
      const childInputs = {};
      const childInputIds = new Set(childGraph.interface.inputs.map(port => port.id));
      const childOutputIds = new Set(childGraph.interface.outputs.map(port => port.id));
      for (const edge of incoming.get(node.id)) {
        if (!childInputIds.has(edge.target.port)) throw new Error(`Use Graph node ${node.id} has no input ${edge.target.port}`);
      }
      for (const edge of outgoing.get(node.id)) {
        if (!childOutputIds.has(edge.source.port)) throw new Error(`Use Graph node ${node.id} has no output ${edge.source.port}`);
      }
      for (const port of childGraph.interface.inputs) {
        const value = readInput(node, port.id, incoming.get(node.id), values, port.required, port.default, port.contract?.shape || 'item', port.contract?.semantic || {});
        if (value !== undefined) childInputs[port.id] = value;
      }
      phase = 'execute-subgraph';
      const childResult = await evaluateGraph({
        ...options,
        source: childGraph,
        inputBindings: childInputs,
        stack: [...options.stack, graphKey]
      });
      phase = 'map-subgraph-outputs';
      const result = childResult.outputs;
      nodeOutputs[node.id] = result;
      for (const port of childGraph.interface.outputs) {
        if (Object.hasOwn(result, port.id)) values.set(`${node.id}:${port.id}`, result[port.id]);
      }
      continue;
    }

    phase = 'resolve-definition';
    const definition = await awaitWithSignal(options.resolveNodeDefinition(node.operation, { node, config: node.config, context: options.context }), options.context?.signal);
    throwIfAborted(options.context?.signal);
    if (!definition) {
      throw new Error(`Node definition unavailable: ${node.operation.provider}/${node.operation.id}@${node.operation.version}`);
    }
    if (
      definition.provider !== node.operation.provider ||
      definition.id !== node.operation.id ||
      String(definition.version) !== String(node.operation.version)
    ) {
      throw new Error(`Node resolver returned a mismatched definition for ${node.id}`);
    }
    const declaredTargets = definition.execution?.targets;
    if (options.executionTarget === 'server' && (!Array.isArray(declaredTargets) || !declaredTargets.includes('server'))) {
      throw new Error(`Node ${node.id} does not support server execution; declare execution.targets including server`);
    }
    if (Array.isArray(declaredTargets) && !declaredTargets.includes(options.executionTarget)) {
      throw new Error(`Node ${node.id} does not support ${options.executionTarget} execution`);
    }
    const kind = definition.execution?.kind;
    if (!['pure', 'read'].includes(kind)) {
      throw new Error(`Preview cannot execute ${kind || 'unclassified'} node ${node.id}`);
    }
    phase = 'validate-inputs';
    const inputs = {};
    const declaredInputIds = new Set((definition.inputs || []).map(port => port.id));
    const declaredOutputIds = new Set((definition.outputs || []).map(port => port.id));
    for (const edge of incoming.get(node.id)) {
      if (!declaredInputIds.has(edge.target.port)) throw new Error(`Node ${node.id} has no input ${edge.target.port}`);
    }
    for (const edge of outgoing.get(node.id)) {
      if (!declaredOutputIds.has(edge.source.port)) throw new Error(`Node ${node.id} has no output ${edge.source.port}`);
    }
    for (const port of definition.inputs || []) {
      const value = readInput(node, port.id, incoming.get(node.id), values, port.required !== false, port.default, port.shape || 'item', port.semantic || {});
      if (value !== undefined) inputs[port.id] = value;
    }
    phase = 'execute';
    const result = await awaitWithSignal(options.executeNode(definition, {
      node,
      config: node.config,
      inputs,
      context: options.context,
      mode: 'preview',
      target: options.executionTarget
    }), options.context?.signal);
    throwIfAborted(options.context?.signal);
    phase = 'validate-outputs';
    if (!isRecord(result)) throw new Error(`Node ${node.id} executor must return an object keyed by output port id`);
    const declaredOutputs = new Set((definition.outputs || []).map(port => port.id));
    for (const key of Object.keys(result)) {
      if (!declaredOutputs.has(key)) throw new Error(`Node ${node.id} returned undeclared output ${key}`);
      values.set(`${node.id}:${key}`, result[key]);
    }
    for (const port of definition.outputs || []) {
      if (port.required !== false && !Object.hasOwn(result, port.id)) {
        throw new Error(`Node ${node.id} did not produce required output ${port.id}`);
      }
    }
    nodeOutputs[node.id] = result;
    } catch (error) {
      throw addNodeDiagnostic(error, {
        graph,
        node,
        phase,
        nodeOutputs,
        outputs,
        invocationPath: options.stack
      });
    }
  }

  for (const port of graph.interface.inputs) {
    if (!seenInputs.has(port.id)) throw new Error(`Graph input ${port.id} has no Graph Input boundary node`);
  }
  for (const port of graph.interface.outputs) {
    if (!seenOutputs.has(port.id)) throw new Error(`Graph output ${port.id} has no Graph Output boundary node`);
  }

  return {
    graphId: graph.id,
    graphRevision: graph.revision,
    outputs,
    nodeOutputs,
    diagnostics: [],
    readSet: options.readSetRecorder.toJSON()
  };
}


function awaitWithSignal(value, signal) {
  if (!signal) return Promise.resolve(value);
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => { cleanup(); reject(abortError(signal)); };
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(value).then(result => { cleanup(); resolve(result); }, error => { cleanup(); reject(error); });
  });
}
function abortError(signal) {
  const error = new Error(signal.reason == null ? 'Graph execution was cancelled' : String(signal.reason));
  error.name = 'AbortError'; error.code = 'GRAPH_EXECUTION_ABORTED'; return error;
}
function throwIfAborted(signal) { if (signal?.aborted) throw abortError(signal); }

function asError(error) {
  if (error instanceof Error && Object.isExtensible(error)) return error;
  const message = error && typeof error === 'object' && typeof error.message === 'string'
    ? error.message
    : String(error);
  const failure = new Error(message, error instanceof Error ? { cause: error } : undefined);
  if (error && typeof error === 'object' && typeof error.code === 'string') failure.code = error.code;
  return failure;
}

function addNodeDiagnostic(error, {
  graph,
  node,
  phase,
  nodeOutputs,
  outputs,
  invocationPath
}) {
  const failure = asError(error);
  const phaseCodes = {
    'boundary-input': 'graph-input-invalid',
    'boundary-output': 'graph-output-invalid',
    'resolve-subgraph': 'subgraph-unavailable',
    'validate-subgraph': 'subgraph-invalid',
    'map-subgraph-inputs': 'subgraph-input-invalid',
    'execute-subgraph': 'subgraph-execution-failed',
    'map-subgraph-outputs': 'subgraph-output-invalid',
    'resolve-definition': 'node-definition-unavailable',
    'validate-inputs': 'node-input-invalid',
    execute: 'node-execution-failed',
    'validate-outputs': 'node-output-invalid'
  };
  const diagnostic = {
    code: typeof failure.code === 'string' ? failure.code : (phaseCodes[phase] || 'node-execution-failed'),
    severity: 'error',
    phase,
    graphId: graph.id,
    graphRevision: graph.revision,
    nodeId: node.id,
    operation: {
      provider: node.operation.provider,
      id: node.operation.id,
      version: node.operation.version
    },
    message: failure.message,
    completedNodeIds: Object.keys(nodeOutputs),
    completedOutputIds: Object.keys(outputs),
    invocationPath: [...invocationPath]
  };
  failure.diagnostics = [diagnostic, ...(Array.isArray(failure.diagnostics) ? failure.diagnostics : [])];
  if (failure.nodeId == null) failure.nodeId = node.id;
  return failure;
}

function readInput(node, portId, edges, values, required, fallback, shape = 'item', semantic = {}) {
  const matches = edges
    .filter(edge => edge.target.port === portId)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!matches.length) {
    if (fallback !== undefined) {
      assertSemanticValue(node, portId, fallback, shape, semantic);
      return fallback;
    }
    if (required) throw new Error(`Node ${node.id} is missing required input ${portId}`);
    return undefined;
  }
  if (shape === 'item' && matches.length > 1) {
    throw new Error(`Node ${node.id} item input ${portId} has multiple incoming wires; declare a list, tuple, tree, or map transport shape`);
  }
  if (shape === 'stream') {
    throw new Error(`Node ${node.id} stream input ${portId} is not materializable in bounded preview`);
  }
  const valuesForEdges = matches.map(edge => {
    const key = `${edge.source.node}:${edge.source.port}`;
    if (!values.has(key)) throw new Error(`Node ${node.id} input ${portId} reads unavailable output ${key}`);
    return { edge, value: values.get(key) };
  });
  if (required && valuesForEdges.some(item => item.value === undefined)) {
    throw new Error(`Node ${node.id} required input ${portId} received no value from its connected source`);
  }

  let result;
  if (matches.length === 1) {
    const value = valuesForEdges[0].value;
    if (shape === 'map') {
      result = isRecord(value) ? value : { [`${matches[0].source.node}:${matches[0].source.port}`]: value };
    } else if (['list', 'tuple', 'tree'].includes(shape)) {
      result = Array.isArray(value) ? value : [value];
    } else {
      result = value;
    }
  } else if (shape === 'map') {
    result = Object.fromEntries(valuesForEdges.map(({ edge, value }) => [
      `${edge.source.node}:${edge.source.port}`,
      value
    ]));
  } else if (['list', 'tuple', 'tree'].includes(shape)) {
    result = valuesForEdges.map(({ value }) => value);
  } else {
    throw new Error(`Node ${node.id} input ${portId} has unsupported transport shape ${shape}`);
  }
  assertSemanticValue(node, portId, result, shape, semantic);
  return result;
}

function assertSemanticValue(node, portId, value, shape, semantic = {}) {
  if (value === undefined) return;
  if (value === null) {
    if (semantic.nullable === true) return;
    throw new Error(`Node ${node.id} input ${portId} does not accept null`);
  }
  const base = semantic.base;
  const isJsonValue = (candidate, seen = new Set()) => {
    if (candidate === null || typeof candidate === 'string' || typeof candidate === 'boolean') return true;
    if (typeof candidate === 'number') return Number.isFinite(candidate);
    if (typeof candidate !== 'object' || seen.has(candidate)) return false;
    seen.add(candidate);
    const valid = Array.isArray(candidate)
      ? candidate.every(item => isJsonValue(item, seen))
      : isRecord(candidate) && Object.values(candidate).every(item => isJsonValue(item, seen));
    seen.delete(candidate);
    return valid;
  };
  const validItem = item => {
    if (item === null) return false;
    if (base === 'string') return typeof item === 'string';
    if (base === 'number') return typeof item === 'number' && Number.isFinite(item);
    if (base === 'integer') return Number.isSafeInteger(item);
    if (base === 'boolean') return typeof item === 'boolean';
    if (base === 'record') return isRecord(item) && isJsonValue(item);
    if (base === 'list' || base === 'tuple' || base === 'tree') return Array.isArray(item) && isJsonValue(item);
    if (base === 'map') return isRecord(item) && isJsonValue(item);
    if (base === 'json' || !base) return isJsonValue(item);
    return isJsonValue(item);
  };
  let valid;
  if (shape === 'map') {
    valid = isRecord(value) && Object.values(value).every(validItem);
  } else if (['list', 'tuple', 'tree'].includes(shape)) {
    valid = Array.isArray(value) && value.every(validItem);
  } else {
    valid = validItem(value);
  }
  if (!valid) {
    throw new Error(`Node ${node.id} input ${portId} does not match semantic base ${base || 'json'} and transport shape ${shape}`);
  }
}

function topologicalOrder(nodes, edges) {
  const indegree = new Map(nodes.map(node => [node.id, 0]));
  const next = new Map(nodes.map(node => [node.id, []]));
  for (const edge of edges) {
    indegree.set(edge.target.node, indegree.get(edge.target.node) + 1);
    next.get(edge.source.node).push(edge.target.node);
  }
  const ready = nodes.filter(node => indegree.get(node.id) === 0).map(node => node.id).sort();
  const order = [];
  while (ready.length) {
    const id = ready.shift();
    order.push(id);
    for (const target of next.get(id)) {
      indegree.set(target, indegree.get(target) - 1);
      if (indegree.get(target) === 0) {
        ready.push(target);
        ready.sort();
      }
    }
  }
  if (order.length !== nodes.length) throw new Error('Procedural graph contains a dependency cycle');
  return order;
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
