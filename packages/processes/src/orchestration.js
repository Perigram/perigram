import { createDataPacket, packetValue } from './data-tree.js';
import { executeProcessDataNode } from './evaluator.js';
import { resolveCatalogNodePorts } from './node-catalog.js';

export const PROCESS_RUN_STATUSES = Object.freeze(['running', 'waiting', 'succeeded', 'failed', 'cancelled']);
export const PROCESS_STEP_STATUSES = Object.freeze(['pending', 'running', 'waiting', 'succeeded', 'failed', 'skipped']);

export function createProcessRun(definition = {}, trigger = {}, options = {}) {
  const process = processData(definition);
  const triggerNode = findTriggerNode(process, trigger);
  const now = instant(options.now);
  return {
    id: options.id || crypto.randomUUID(),
    processDefinitionId: String(options.processDefinitionId || definition._id || definition.id || ''),
    protocolVersion: 3,
    status: 'running',
    trigger: structuredClone(trigger),
    context: structuredClone(options.context || {}),
    tokens: [token(triggerNode.id)],
    joins: {},
    steps: [],
    wakeAt: null,
    result: null,
    error: null,
    createdAt: now,
    updatedAt: now
  };
}

export async function advanceProcessRun(runInput, definition, environment = {}) {
  const run = structuredClone(runInput);
  const process = processData(definition);
  if (!['running', 'waiting'].includes(run.status)) return run;
  const now = instant(environment.now);
  if (run.status === 'waiting') {
    if (!run.wakeAt || new Date(run.wakeAt) > new Date(now)) return run;
    run.status = 'running';
    run.wakeAt = null;
  }
  const current = run.tokens.shift();
  if (!current) {
    run.status = 'succeeded';
    run.updatedAt = now;
    return run;
  }
  const node = processNode(process, current.nodeId);
  const record = process.processNodes[recordId(node)];
  const step = {
    id: `${run.id}:${run.steps.length + 1}`,
    nodeId: node.id,
    kind: record.kind,
    status: 'running',
    attempt: current.attempt || 1,
    idempotencyKey: `${run.id}:${node.id}:${current.scope || 'root'}:${current.attempt || 1}`,
    startedAt: now,
    completedAt: null,
    output: null,
    error: null
  };
  run.steps.push(step);
  try {
    await executeOperationalNode({ run, process, node, record, current, step, environment });
    if (step.status === 'running') step.status = 'succeeded';
    step.completedAt = instant(environment.now);
  } catch (error) {
    step.status = 'failed';
    step.error = serializeError(error);
    step.completedAt = instant(environment.now);
    const retry = normalizeRetry(record.retry);
    if (step.attempt < retry.maxAttempts) {
      run.tokens.unshift({ ...current, attempt: step.attempt + 1 });
      if (retry.delayMs) {
        run.status = 'waiting';
        run.wakeAt = new Date(new Date(step.completedAt).getTime() + retry.delayMs).toISOString();
      }
    } else {
      run.status = 'failed';
      run.error = step.error;
    }
  }
  if (run.status === 'running' && !run.tokens.length) run.status = 'succeeded';
  run.updatedAt = instant(environment.now);
  return run;
}

export async function runProcessUntilSettled(run, definition, environment = {}, options = {}) {
  const maxSteps = Number(options.maxSteps) || 1000;
  let current = run;
  for (let index = 0; index < maxSteps && ['running', 'waiting'].includes(current.status); index += 1) {
    const previous = current;
    current = await advanceProcessRun(current, definition, environment);
    if (current.status === 'waiting' && current.updatedAt === previous.updatedAt) return current;
  }
  if (current.status === 'running') throw new Error(`Process run exceeded ${maxSteps} steps`);
  return current;
}

async function executeOperationalNode({ run, process, node, record, current, step, environment }) {
  const inputs = await resolveNodeInputs(process, node, run, environment, current);
  if (record.kind.endsWith('Trigger')) {
    const payload = run.trigger?.payload ?? run.trigger?.entity ?? run.trigger;
    enqueueEdges(run, outgoingControl(process, node.id, 'start'), {
      ...current,
      values: {
        ...(current.values || {}),
        [`${node.id}:payload`]: createDataPacket(structuredClone(payload))
      }
    });
    return;
  }
  if (record.kind.startsWith('effect.')) {
    if (!environment.executeEffect) throw new Error(`Effect executor is required for ${record.kind}`);
    const result = await environment.executeEffect({
      kind: record.kind,
      record,
      inputs: Object.fromEntries(Object.entries(inputs).map(([id, packet]) => [id, packetValue(packet)])),
      idempotencyKey: step.idempotencyKey,
      attempt: step.attempt,
      run
    });
    step.output = structuredClone(result);
    const outputValues = await effectOutputValues(node.id, record, result, environment);
    enqueueEdges(run, outgoingControl(process, node.id, 'completed'), {
      ...current,
      values: {
        ...(current.values || {}),
        ...outputValues
      }
    });
    return;
  }
  if (record.kind === 'control.if') {
    const branch = packetValue(inputs.condition) ? 'true' : 'false';
    enqueueEdges(run, outgoingControl(process, node.id, branch), current);
    return;
  }
  if (record.kind === 'control.switch') {
    const value = packetValue(inputs.value);
    const selected = (record.cases || []).find(item => Object.is(item.value, value));
    enqueueEdges(run, outgoingControl(process, node.id, selected ? String(selected.id || selected.value) : 'default'), current);
    return;
  }
  if (record.kind === 'control.fork') {
    enqueueEdges(run, outgoingControl(process, node.id), current);
    return;
  }
  if (record.kind === 'control.joinAll' || record.kind === 'control.joinAny') {
    const key = `${node.id}:${current.scope || 'root'}`;
    const arrivals = new Set(run.joins[key] || []);
    arrivals.add(current.sourceNodeId || 'unknown');
    run.joins[key] = [...arrivals];
    const required = incomingControl(process, node.id).length;
    if (record.kind === 'control.joinAny' || arrivals.size >= required) {
      delete run.joins[key];
      enqueueEdges(run, outgoingControl(process, node.id, 'out'), current);
    } else step.status = 'waiting';
    return;
  }
  if (record.kind === 'control.forEach') {
    const packet = inputs.items;
    const items = packet.branches.flatMap(branch => branch.items);
    const eachEdges = outgoingControl(process, node.id, 'each');
    items.forEach((item, index) => enqueueEdges(run, eachEdges, {
      ...current,
      scope: `${current.scope || 'root'}/${node.id}/${index}`,
      values: { ...(current.values || {}), [`${node.id}:item`]: createDataPacket(item) }
    }));
    enqueueEdges(run, outgoingControl(process, node.id, 'done'), current);
    return;
  }
  if (record.kind === 'control.waitDuration' || record.kind === 'control.waitUntil') {
    const wakeAt = record.kind === 'control.waitDuration'
      ? new Date(new Date(instant(environment.now)).getTime() + durationMs(packetValue(inputs.duration))).toISOString()
      : new Date(packetValue(inputs.at)).toISOString();
    enqueueEdges(run, outgoingControl(process, node.id, 'out'), current);
    run.status = 'waiting';
    run.wakeAt = wakeAt;
    step.status = 'waiting';
    return;
  }
  if (record.kind === 'control.stopSuccess') {
    run.tokens = [];
    run.status = 'succeeded';
    run.result = structuredClone(record.result || null);
    return;
  }
  if (record.kind === 'control.stopFailure') {
    run.tokens = [];
    run.status = 'failed';
    run.error = { name: 'ProcessStopped', message: record.message || 'Process stopped with failure' };
    return;
  }
  throw new Error(`Token reached non-operational node ${record.kind}`);
}

async function effectOutputValues(nodeId, record, result, environment) {
  const ports = resolveCatalogNodePorts(record, environment.catalogContext?.(record) || {});
  const values = {};
  for (const port of ports.outputs.filter(item => item.role === 'data')) {
    let value = result;
    if (record.kind === 'effect.runCommand' && port.id !== 'result') {
      if (port.id.startsWith('attachment:')) {
        value = (result?.attachments || []).filter(item => item.kind === port.id.slice('attachment:'.length));
      } else {
        const refs = (result?.entities || []).filter(item => item.type === port.id);
        value = environment.data?.resolveEntityRef
          ? await Promise.all(refs.map(ref => environment.data.resolveEntityRef(ref)))
          : refs;
      }
    }
    values[`${nodeId}:${port.id}`] = createDataPacket(value, port.type?.shape);
  }
  return values;
}

async function resolveNodeInputs(process, node, run, environment, tokenContext) {
  const record = process.processNodes[recordId(node)];
  const ports = resolveCatalogNodePorts(record, environment.catalogContext?.(record) || {});
  const dataInputs = ports.inputs.filter(port => port.role === 'data');
  const inputs = {};
  for (const port of dataInputs) {
    const edge = incomingData(process, node.id, port.id);
    if (!edge) {
      if (Object.hasOwn(record.inputDefaults || {}, port.id)) {
        inputs[port.id] = createDataPacket(structuredClone(record.inputDefaults[port.id]), port.type?.shape);
        continue;
      }
      const runValue = processRunInput(run.context?.inputs || {}, record, port.id, environment);
      if (runValue !== undefined) {
        inputs[port.id] = createDataPacket(structuredClone(runValue), port.type?.shape);
        continue;
      }
      if (port.required) throw new Error(`Node ${record.id || node.id} requires input ${port.id}`);
      continue;
    }
    inputs[port.id] = await evaluateNodeOutput(process, edge.source, cleanHandle(edge.sourceHandle), run, environment, tokenContext, new Set());
  }
  return inputs;
}

function processRunInput(inputs = {}, record = {}, portId = '', environment = {}) {
  if (portId === 'entity') {
    return inputs.entity ?? inputs.entities?.[record.entityType];
  }
  if (Object.hasOwn(inputs.data || {}, portId)) return inputs.data[portId];
  const nested = readInputPath(inputs.data, portId);
  if (nested !== undefined) return nested;
  const field = (environment.catalogContext?.(record)?.fieldSchemas || [])
    .find(schema => schema.path === portId);
  const relatedType = field?.type?.entityType;
  if (relatedType && Object.hasOwn(inputs.entities || {}, relatedType)) {
    return inputs.entities[relatedType];
  }
  if (Object.hasOwn(inputs.parameters || {}, portId)) return inputs.parameters[portId];
  return undefined;
}

function readInputPath(value, path = '') {
  return String(path).split('.').filter(Boolean)
    .reduce((current, key) => current == null ? undefined : current[key], value);
}

async function evaluateNodeOutput(process, nodeId, outputId, run, environment, tokenContext, resolving) {
  const cacheKey = `${nodeId}:${outputId}:${tokenContext.scope || 'root'}`;
  if (tokenContext.values?.[cacheKey]) return tokenContext.values[cacheKey];
  if (tokenContext.values?.[`${nodeId}:${outputId}`]) return tokenContext.values[`${nodeId}:${outputId}`];
  if (resolving.has(cacheKey)) throw new Error(`Data cycle detected at ${nodeId}:${outputId}`);
  resolving.add(cacheKey);
  const graphNode = (process.graph?.nodes || []).find(item => String(item.id) === String(nodeId));
  if (graphNode?.type === 'statusDefinition') {
    const definition = process.statusDefinitions?.[recordId(graphNode)];
    if (!definition?.statusId) throw new Error(`Status definition ${recordId(graphNode)} does not exist`);
    resolving.delete(cacheKey);
    return createDataPacket(definition.statusId);
  }
  const node = processNode(process, nodeId);
  const record = process.processNodes[recordId(node)];
  const ports = resolveCatalogNodePorts(record, environment.catalogContext?.(record) || {});
  const inputs = {};
  for (const port of ports.inputs.filter(item => item.role === 'data')) {
    const edge = incomingData(process, node.id, port.id);
    if (!edge) {
      if (Object.hasOwn(record.inputDefaults || {}, port.id)) {
        inputs[port.id] = createDataPacket(structuredClone(record.inputDefaults[port.id]), port.type?.shape);
        continue;
      }
      const runValue = processRunInput(run.context?.inputs || {}, record, port.id);
      if (runValue !== undefined) {
        inputs[port.id] = createDataPacket(structuredClone(runValue), port.type?.shape);
        continue;
      }
      if (port.required) throw new Error(`Node ${record.id || node.id} requires input ${port.id}`);
      continue;
    }
    inputs[port.id] = await evaluateNodeOutput(process, edge.source, cleanHandle(edge.sourceHandle), run, environment, tokenContext, resolving);
  }
  const packet = await executeProcessDataNode(record, inputs, {
    ...(environment.data || {}),
    inputs: run.context?.inputs,
    trigger: run.trigger,
    now: environment.now,
    outputId
  });
  resolving.delete(cacheKey);
  return packet;
}

function processData(definition) {
  const process = definition?.data?.graph ? definition.data : definition;
  if (Number(process?.dataflowVersion) !== 3) throw new Error('Durable orchestration requires process dataflow version 3');
  return process;
}

function findTriggerNode(process, trigger) {
  const nodes = (process.graph?.nodes || []).filter(node => {
    const record = process.processNodes?.[recordId(node)] || {};
    return record.kind?.endsWith('Trigger')
      || (record.kind?.startsWith('effect.') && (record.trigger?.mode || 'manual') === 'manual');
  });
  const match = trigger.nodeId
    ? nodes.find(node => String(node.id) === String(trigger.nodeId))
    : nodes.find(node => {
      const record = process.processNodes[recordId(node)];
      if (trigger.kind && record.kind !== trigger.kind) return false;
      if (trigger.eventId && record.eventId !== trigger.eventId) return false;
      if (trigger.entityType && record.entityType !== trigger.entityType) return false;
      if (trigger.mode && record.trigger?.mode !== trigger.mode) return false;
      return true;
    });
  if (!match) throw new Error(`Process trigger ${trigger.nodeId || trigger.kind || '(default)'} not found`);
  return match;
}

function processNode(process, id) {
  const node = (process.graph?.nodes || []).find(item => String(item.id) === String(id));
  if (!node || node.type !== 'processNode' || !process.processNodes?.[recordId(node)]) {
    throw new Error(`Process node ${id} does not exist`);
  }
  return node;
}

function outgoingControl(process, nodeId, handle) {
  return (process.graph?.edges || []).filter(edge => (
    String(edge.source) === String(nodeId)
    && edgeRole(edge) === 'control'
    && (!handle || cleanHandle(edge.sourceHandle) === handle)
  ));
}

function incomingControl(process, nodeId) {
  return (process.graph?.edges || []).filter(edge => String(edge.target) === String(nodeId) && edgeRole(edge) === 'control');
}

function incomingData(process, nodeId, handle) {
  return (process.graph?.edges || []).find(edge => (
    String(edge.target) === String(nodeId)
    && edgeRole(edge) === 'data'
    && cleanHandle(edge.targetHandle) === handle
  ));
}

function edgeRole(edge) {
  return edge.role || (String(edge.sourceHandle || '').startsWith('control:') || String(edge.targetHandle || '').startsWith('control:') ? 'control' : 'data');
}

function cleanHandle(handle = '') {
  return String(handle).replace(/^(input|output|data|control|success|failure):/, '');
}

function token(nodeId, targetHandle, inherited = {}) {
  return {
    nodeId: String(nodeId),
    targetHandle: cleanHandle(targetHandle),
    sourceNodeId: inherited.sourceNodeId || null,
    scope: inherited.scope || 'root',
    values: inherited.values || {},
    attempt: 1
  };
}

function enqueueEdges(run, edges, inherited) {
  for (const edge of edges) {
    run.tokens.push(token(edge.target, edge.targetHandle, {
      ...inherited,
      sourceNodeId: edge.source
    }));
  }
}

function recordId(node) {
  return String(node?.data?.refId || node?.id || '');
}

function durationMs(value) {
  if (typeof value === 'number') return value;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(String(value || ''));
  if (!match) throw new Error(`Invalid ISO-8601 duration ${value}`);
  return (Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0)) * 1000;
}

function normalizeRetry(retry = {}) {
  return {
    maxAttempts: Math.max(1, Number(retry.maxAttempts) || 1),
    delayMs: Math.max(0, Number(retry.delayMs) || 0)
  };
}

function instant(now) {
  const value = typeof now === 'function' ? now() : new Date();
  return new Date(value).toISOString();
}

function serializeError(error) {
  return { name: error?.name || 'Error', message: error?.message || String(error) };
}
