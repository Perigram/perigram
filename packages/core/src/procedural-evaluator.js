import {
  assertValidGraphDocument,
  GRAPH_INPUT_OPERATION,
  GRAPH_OUTPUT_OPERATION,
  GRAPH_INVOKE_OPERATION
} from './graph.js';

export async function evaluateProceduralGraph({
  graph: source,
  inputBindings = {},
  resolveNodeDefinition,
  executeNode,
  resolveGraph,
  context = {},
  mode = 'preview',
  maxGraphDepth = 32
} = {}) {
  if (mode !== 'preview') throw new Error('The procedural evaluator currently supports preview mode only');
  if (typeof resolveNodeDefinition !== 'function') throw new Error('resolveNodeDefinition callback is required');
  if (typeof executeNode !== 'function') throw new Error('executeNode callback is required');
  return evaluateGraph({
    source,
    inputBindings,
    resolveNodeDefinition,
    executeNode,
    resolveGraph,
    context,
    stack: [],
    maxGraphDepth
  });
}

async function evaluateGraph(options) {
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
    const node = nodes.get(nodeId);
    const operationId = node.operation.id;

    if (operationId === GRAPH_INPUT_OPERATION) {
      const interfaceId = node.config.interfaceId;
      if (!inputIds.has(interfaceId)) throw new Error(`Graph Input node ${node.id} references undeclared input ${interfaceId}`);
      if (seenInputs.has(interfaceId)) throw new Error(`Graph input ${interfaceId} has more than one boundary node`);
      seenInputs.add(interfaceId);
      const port = graph.interface.inputs.find(item => item.id === interfaceId);
      const value = Object.hasOwn(options.inputBindings, interfaceId)
        ? options.inputBindings[interfaceId]
        : (Object.hasOwn(port, 'default') ? port.default : undefined);
      if (value === undefined && port.required) throw new Error(`Required graph input ${interfaceId} was not supplied`);
      values.set(`${node.id}:value`, value);
      nodeOutputs[node.id] = { value };
      continue;
    }

    if (operationId === GRAPH_OUTPUT_OPERATION) {
      const interfaceId = node.config.interfaceId;
      if (!outputIds.has(interfaceId)) throw new Error(`Graph Output node ${node.id} references undeclared output ${interfaceId}`);
      if (seenOutputs.has(interfaceId)) throw new Error(`Graph output ${interfaceId} has more than one boundary node`);
      seenOutputs.add(interfaceId);
      const value = readSingleInput(node, 'value', incoming.get(node.id), values, true);
      outputs[interfaceId] = value;
      nodeOutputs[node.id] = { value };
      continue;
    }

    if (operationId === GRAPH_INVOKE_OPERATION) {
      if (typeof options.resolveGraph !== 'function') throw new Error('Use Graph requires a resolveGraph callback');
      const child = await options.resolveGraph(node.config.graphId, node.config.revision);
      if (!child) throw new Error(`Pinned subgraph ${node.config.graphId}@${node.config.revision} is unavailable`);
      const childGraph = assertValidGraphDocument(child);
      if (childGraph.id !== node.config.graphId || childGraph.revision !== node.config.revision) {
        throw new Error(`Subgraph resolver returned the wrong graph revision for node ${node.id}`);
      }
      const childInputs = {};
      for (const port of childGraph.interface.inputs) {
        const value = readSingleInput(node, port.id, incoming.get(node.id), values, port.required);
        if (value !== undefined) childInputs[port.id] = value;
      }
      const childResult = await evaluateGraph({
        ...options,
        source: childGraph,
        inputBindings: childInputs,
        stack: [...options.stack, graphKey]
      });
      const result = childResult.outputs;
      nodeOutputs[node.id] = result;
      for (const port of childGraph.interface.outputs) {
        if (Object.hasOwn(result, port.id)) values.set(`${node.id}:${port.id}`, result[port.id]);
      }
      continue;
    }

    const definition = await options.resolveNodeDefinition(node.operation);
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
    const kind = definition.execution?.kind;
    if (!['pure', 'read'].includes(kind)) {
      throw new Error(`Preview cannot execute ${kind || 'unclassified'} node ${node.id}`);
    }
    const inputs = {};
    for (const port of definition.inputs || []) {
      const value = readSingleInput(node, port.id, incoming.get(node.id), values, port.required !== false, port.default);
      if (value !== undefined) inputs[port.id] = value;
    }
    const result = await options.executeNode(definition, {
      node,
      config: node.config,
      inputs,
      context: options.context,
      mode: 'preview'
    });
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
    nodeOutputs
  };
}

function readSingleInput(node, portId, edges, values, required, fallback) {
  const matches = edges.filter(edge => edge.target.port === portId);
  if (matches.length > 1) throw new Error(`Node ${node.id} input ${portId} has multiple incoming wires; use an explicit collection operation`);
  if (!matches.length) {
    if (fallback !== undefined) return fallback;
    if (required) throw new Error(`Node ${node.id} is missing required input ${portId}`);
    return undefined;
  }
  const edge = matches[0];
  const key = `${edge.source.node}:${edge.source.port}`;
  if (!values.has(key)) throw new Error(`Node ${node.id} input ${portId} reads unavailable output ${key}`);
  return values.get(key);
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
