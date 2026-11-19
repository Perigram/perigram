import { PROCESS_GRAPH_METADATA_KEY, PROCESS_GRAPH_PROVIDER } from './process-graph.js';
import { createDataPacket, isDataTree, packetValue } from './data-tree.js';
import { executeProcessDataNode, executeProcessEffectNode } from './evaluator.js';
import { resolveCatalogNodePorts, EFFECT_SPECIES_KINDS, constructionInputsForContract, resolveConstructionMode } from './node-catalog.js';

export const PROCESS_RUN_STATUSES = Object.freeze(['running', 'waiting', 'succeeded', 'failed', 'cancelled']);
export const PROCESS_STEP_STATUSES = Object.freeze(['pending', 'running', 'waiting', 'succeeded', 'failed', 'cancelled']);

const PROCESS_RUN_TRANSITIONS = Object.freeze({
  running: Object.freeze(['waiting', 'succeeded', 'failed', 'cancelled']),
  waiting: Object.freeze(['running', 'failed', 'cancelled']),
  succeeded: Object.freeze([]),
  failed: Object.freeze([]),
  cancelled: Object.freeze([])
});

const PROCESS_STEP_TRANSITIONS = Object.freeze({
  pending: Object.freeze(['running', 'cancelled']),
  running: Object.freeze(['waiting', 'succeeded', 'failed', 'cancelled']),
  waiting: Object.freeze(['succeeded', 'failed', 'cancelled']),
  succeeded: Object.freeze([]),
  failed: Object.freeze([]),
  cancelled: Object.freeze([])
});

export function transitionProcessRun(run, status) {
  return transitionState(run, status, PROCESS_RUN_TRANSITIONS, 'process run');
}

export function transitionProcessStep(step, status) {
  return transitionState(step, status, PROCESS_STEP_TRANSITIONS, 'process step');
}

function transitionState(record, status, table, label) {
  if (record.status === status) return record;
  if (!(table[record.status] || []).includes(status)) {
    throw new Error(`Illegal ${label} transition ${record.status || '(none)'} -> ${status}`);
  }
  record.status = status;
  return record;
}

const NATIVE_MUTATION_KINDS = new Set(['cts.construct', 'cts.mutate', 'cts.transition', 'cts.remove']);

function isNativeEffect(record = {}) {
  return EFFECT_SPECIES_KINDS.has(String(record.kind || ''));
}

function isEffectRecord(record = {}) {
  return isNativeEffect(record);
}

export async function previewProcessDataflow(definition, sample = {}, environment = {}) {
  const process = processData(definition);
  const run = {
    trigger: structuredClone(sample.trigger || {}),
    context: { inputs: structuredClone(sample.inputs || {}) }
  };
  const tokenContext = { scope: 'preview', values: {} };
  const nodes = {};
  for (const node of processGraphNodes(process)) {
    if (processNodeType(process, node) !== 'processNode') continue;
    if (environment.targetNodeId && String(node.id) !== String(environment.targetNodeId)) continue;
    const record = processNodeRecord(process, node);
    if (!record || record.kind.startsWith('control.')) continue;
    const ports = resolveCatalogNodePorts(record, environment.catalogContext?.(record) || {});
    const inputs = {};
    const outputs = {};
    let error = null;
    try {
      const resolvedInputs = await resolveNodeInputs(process, node, run, environment, tokenContext);
      for (const [id, tree] of Object.entries(resolvedInputs)) {
        inputs[id] = previewTree(tree, environment.previewLimit);
      }
    } catch (cause) {
      error ||= cause.message;
    }

    // Effects are never executed by preview, but their resolved data inputs
    // are still useful authoring feedback. Value services opt into preview
    // only when the host explicitly supplies the preview service channel.
    const previewServiceAvailable = record.kind === 'cts.service'
      && typeof environment.previewService === 'function';
    if (isEffectRecord(record) && !previewServiceAvailable) {
      nodes[node.id] = { inputs, ...(error ? { error } : {}) };
      continue;
    }

    for (const port of ports.outputs.filter(item => item.role === 'data')) {
      try {
        const tree = await evaluateNodeOutput(process, node.id, port.id, run, environment, tokenContext, new Set());
        outputs[port.id] = previewTree(tree, environment.previewLimit);
      } catch (cause) {
        error ||= cause.message;
      }
    }
    nodes[node.id] = { inputs, outputs, ...(error ? { error } : {}) };
  }
  return { nodes };
}

function previewTree(tree, limit = 100) {
  let remaining = Math.max(1, Number(limit) || 100);
  const itemCount = tree.branches.reduce((total, branch) => total + branch.items.length, 0);
  return {
    branchCount: tree.branches.length,
    itemCount,
    branches: tree.branches.map(branch => {
      const items = branch.items.slice(0, remaining).map(redactPreviewValue);
      remaining -= items.length;
      return { path: [...branch.path], itemCount: branch.items.length, items };
    }),
    truncated: remaining === 0 && itemCount > limit
  };
}

function redactPreviewValue(value) {
  if (value?.secretRef || value?.opaqueType) return '[redacted]';
  return structuredClone(value);
}

export function createProcessRun(definition = {}, trigger = {}, options = {}) {
  const process = processData(definition);
  const triggerNode = findTriggerNode(process, trigger);
  const now = instant(options.now);
  return {
    id: options.id || crypto.randomUUID(),
    processDefinitionId: String(options.processDefinitionId || definition._id || definition.id || ''),
    protocolVersion: 4,
    status: 'running',
    trigger: structuredClone(trigger),
    context: structuredClone(options.context || {}),
    tokens: [token(triggerNode.id)],
    joins: {},
    loops: {},
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
  run.loops ||= {};
  const process = processData(definition);
  if (!['running', 'waiting'].includes(run.status)) return run;
  const now = instant(environment.now);
  if (run.status === 'waiting') {
    if (!run.wakeAt || new Date(run.wakeAt) > new Date(now)) return run;
    transitionProcessRun(run, 'running');
    run.wakeAt = null;
  }
  const current = run.tokens.shift();
  if (!current) {
    transitionProcessRun(run, 'succeeded');
    run.updatedAt = now;
    return run;
  }
  const node = processNode(process, current.nodeId);
  const record = processNodeRecord(process, node);
  const step = {
    id: `${run.id}:${run.steps.length + 1}`,
    nodeId: node.id,
    kind: record.kind,
    status: 'pending',
    attempt: current.attempt || 1,
    idempotencyKey: `${run.id}:${node.id}:${current.scope || 'root'}:${current.attempt || 1}`,
    startedAt: now,
    completedAt: null,
    output: null,
    error: null
  };
  run.steps.push(step);
  transitionProcessStep(step, 'running');
  try {
    await executeOperationalNode({ run, process, node, record, current, step, environment });
    if (step.status === 'running') transitionProcessStep(step, 'succeeded');
    step.completedAt = instant(environment.now);
  } catch (error) {
    transitionProcessStep(step, 'failed');
    step.error = serializeError(error);
    step.completedAt = instant(environment.now);
    transitionProcessRun(run, 'failed');
    run.error = step.error;
  }
  if (run.status === 'running' && !run.tokens.length) transitionProcessRun(run, 'succeeded');
  run.updatedAt = instant(environment.now);
  return run;
}

export async function resumeProcessRun(runInput, definition, completion = {}, environment = {}) {
  const run = structuredClone(runInput);
  if (run.status !== 'waiting' || !run.pendingEffect) return run;
  const pending = run.pendingEffect;
  if (completion.invocationId && pending.invocationId && String(completion.invocationId) !== String(pending.invocationId)) {
    return run;
  }
  const process = processData(definition);
  const node = processNode(process, pending.nodeId);
  if (!node) throw new Error(`Cannot resume pending effect: node ${pending.nodeId} is not in the process graph`);
  const record = processNodeRecord(process, node);
  const step = run.steps.find(item => item.id === pending.stepId);
  if (!step) throw new Error(`Cannot resume pending effect: step ${pending.stepId} not found`);
  const now = instant(environment.now);
  const output = completion.output == null ? {} : completion.output;
  transitionProcessStep(step, 'succeeded');
  step.output = structuredClone(output);
  step.completedAt = now;
  delete run.pendingEffect;
  transitionProcessRun(run, 'running');
  run.wakeAt = null;
  const outputValues = await effectOutputValues(node.id, record, output, environment);
  enqueueEdges(run, outgoingControl(process, node.id, 'completed'), {
    ...(pending.controlToken || { nodeId: node.id, attempt: step.attempt }),
    values: {
      ...((pending.controlToken || {}).values || {}),
      ...outputValues
    }
  });
  if (!run.tokens.length) transitionProcessRun(run, 'succeeded');
  run.updatedAt = now;
  return run;
}

async function executeOperationalNode({ run, process, node, record, current, step, environment }) {
  const inputs = await resolveNodeInputs(process, node, run, environment, current);
  if (isEffectRecord(record)) {
    if (!environment.executeEffect) throw new Error(`Effect executor is required for ${record.kind}`);
    const mappedMutation = NATIVE_MUTATION_KINDS.has(String(record.kind));
    // List-valued construction inputs (a typeList — the parts of one fill)
    // carry their whole list into each invocation; entity and scalar ports
    // align per item — the entity broadcast drives batch mutations.
    const context = environment.catalogContext?.(record) || {};
    const contract = context.domain?.construction?.[record.typeId] || null;
    const listValued = new Set(
      (contract
        ? constructionInputsForContract(contract, resolveConstructionMode(record, contract))
        : (record.construction?.inputs || []))
        .filter(input => input.type === 'typeList')
        .map(input => String(input.path || input.id || ''))
    );
    const accessById = new Map(
      (resolveCatalogNodePorts(record, context).inputs || [])
        .filter(port => port.role === 'data' && port.id !== 'entity')
        .map(port => [port.id, listValued.has(port.id) ? 'list' : 'item'])
    );
    const result = mappedMutation
      ? await executeProcessEffectNode(record, inputs, (mutationInputs, location) => environment.executeEffect({
          kind: record.kind,
          record,
          inputs: mutationInputs,
          idempotencyKey: location.single
            ? step.idempotencyKey
            : `${step.idempotencyKey}:${location.branchPath.join('.') || 'root'}:${location.itemIndex}`,
          attempt: step.attempt,
          run
        }), { accessById })
      : await environment.executeEffect({
          kind: record.kind,
          record,
          // Value-carrying effects (commands, services) consume each input
          // by its declared socket access: a List socket delivers the
          // aligned items as one array value, an Item socket one value.
          inputs: await extractEffectItemInputs(record, inputs, environment),
          idempotencyKey: step.idempotencyKey,
          attempt: step.attempt,
          run
        });
    if (result?.__processEffectPending === true) {
      transitionProcessStep(step, 'waiting');
      step.invocationId = result.invocationId || null;
      transitionProcessRun(run, 'waiting');
      run.pendingEffect = {
        stepId: step.id,
        nodeId: node.id,
        invocationId: result.invocationId || null,
        controlToken: structuredClone(current)
      };
      return;
    }
    step.output = structuredClone(result);
    const outputValues = await effectOutputValues(node.id, record, effectOutputResult(result), environment);
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
    } else transitionProcessStep(step, 'waiting');
    return;
  }
  if (record.kind === 'control.forEach') {
    const packet = inputs.items;
    const eachEdges = outgoingControl(process, node.id, 'each');
    const total = packet.branches.reduce((count, branch) => count + branch.items.length, 0);
    const loopKey = `${current.scope || 'root'}/${node.id}`;
    run.loops[loopKey] = { expected: total, completed: 0, doneEdges: outgoingControl(process, node.id, 'done'), parent: current };
    packet.branches.forEach(branch => branch.items.forEach((item, index) => enqueueEdges(run, eachEdges, {
      ...current,
      loopKey,
      scope: `${current.scope || 'root'}/${node.id}/${branch.path.join('.') || 'root'}/${index}`,
      values: {
        ...(current.values || {}),
        [`${node.id}:item`]: { branches: [{ path: [...branch.path], items: [structuredClone(item)] }] },
        [`${node.id}:path`]: createDataPacket([...branch.path]),
        [`${node.id}:index`]: createDataPacket(index)
      }
    })));
    if (!total) {
      enqueueEdges(run, run.loops[loopKey].doneEdges, current);
      delete run.loops[loopKey];
    }
    return;
  }
  if (record.kind === 'control.forEachEnd') {
    const loop = current.loopKey && run.loops[current.loopKey];
    if (!loop) throw new Error(`For Each End ${record.id || node.id} was reached outside an iteration`);
    loop.completed += 1;
    if (loop.completed >= loop.expected) {
      enqueueEdges(run, loop.doneEdges, loop.parent);
      delete run.loops[current.loopKey];
    }
    return;
  }
  if (record.kind === 'control.waitUntil') {
    const until = inputs.until ? packetValue(inputs.until) : null;
    const date = new Date(until);
    if (!until || Number.isNaN(date.getTime())) {
      throw new Error(`Wait Until ${record.id || node.id} requires a dateTime, received ${JSON.stringify(until)}`);
    }
    // Parks the run on the same boundary async effects park on; the run
    // store owns the wake and resumes through the pending-effect seam.
    transitionProcessStep(step, 'waiting');
    transitionProcessRun(run, 'waiting');
    run.wakeAt = date.toISOString();
    run.pendingEffect = {
      stepId: step.id,
      nodeId: node.id,
      invocationId: null,
      controlToken: structuredClone(current)
    };
    return;
  }
  if (record.kind === 'control.stopSuccess') {
    run.tokens = [];
    transitionProcessRun(run, 'succeeded');
    run.result = structuredClone(record.result || null);
    return;
  }
  if (record.kind === 'control.stopFailure') {
    run.tokens = [];
    transitionProcessRun(run, 'failed');
    run.error = { name: 'ProcessStopped', message: record.message || 'Process stopped with failure' };
    return;
  }
  throw new Error(`Token reached non-operational node ${record.kind}`);
}

function effectOutputResult(result) {
  // A failure-carrying mapped mutation wraps its shape-preserving result tree;
  // downstream data outputs consume the tree, not the reporting envelope.
  if (result && Array.isArray(result.failures) && result.result) return result.result;
  return result;
}

async function effectOutputValues(nodeId, record, result, environment) {
  const ports = resolveCatalogNodePorts(record, environment.catalogContext?.(record) || {});
  const values = {};
  for (const port of ports.outputs.filter(item => item.role === 'data')) {
    let value = result;
    if ((record.kind === 'cts.service' || record.kind === 'cts.command') && port.id !== 'result') {
      if (port.id.startsWith('attachment:')) {
        value = (result?.attachments || []).filter(item => item.kind === port.id.slice('attachment:'.length));
      } else {
        const refs = (result?.entities || []).filter(item => item.type === port.id);
        value = environment.data?.resolveEntityRef
          ? await Promise.all(refs.map(ref => environment.data.resolveEntityRef(ref)))
          : refs;
      }
    }
    values[`${nodeId}:${port.id}`] = createDataPacket(value, port.access || 'item');
  }
  return values;
}

// Value-carrying effects (commands, services) receive each input as one
// value extracted by the port's declared access — a List socket's aligned
// items become the array value the command contract expects.
function extractEffectItemInputs(record, inputs, environment) {
  const ports = resolveCatalogNodePorts(record, environment.catalogContext?.(record) || {});
  const accessById = new Map(ports.inputs.map(port => [port.id, port.access || 'item']));
  return Object.fromEntries(Object.entries(inputs).map(([id, packet]) => {
    try {
      return [id, packetValue(packet, accessById.get(id) || 'item')];
    } catch (error) {
      const node = record.id || record.kind || 'effect';
      throw new Error(`${node} input ${id}: ${error?.message || error}`);
    }
  }));
}

// The run context's untyped entity (the manual transport's instanceId) is
// the trigger node's own entity; every other consumer binds the typed map.
function isTriggerNode(run, node) {
  return Boolean(run?.trigger?.nodeId) && String(run.trigger.nodeId) === String(node?.id || '');
}

async function resolveNodeInputs(process, node, run, environment, tokenContext) {
  const record = processNodeRecord(process, node);
  const ports = resolveCatalogNodePorts(record, environment.catalogContext?.(record) || {});
  const dataInputs = ports.inputs.filter(port => port.role === 'data');
  const inputs = {};
  for (const port of dataInputs) {
    const runValue = processRunInput(run.context?.inputs || {}, record, port.id, environment, {
      bindContextEntity: isTriggerNode(run, node)
    });
    if (runValue !== undefined) {
      inputs[port.id] = socketPacket(runValue, port.access);
      continue;
    }
    const edge = incomingData(process, node.id, port.id);
    if (!edge) {
      if (Object.hasOwn(record.inputDefaults || {}, port.id)) {
        inputs[port.id] = socketPacket(record.inputDefaults[port.id], port.access);
        continue;
      }
      if (port.id.startsWith('lineage.')) {
        const ancestor = await resolveLineageContext(record, port, run, environment);
        if (ancestor !== undefined) inputs[port.id] = socketPacket(ancestor, port.access);
      }
      continue;
    }
    try {
      inputs[port.id] = await evaluateNodeOutput(process, edgeSource(edge), cleanHandle(edgeSourcePort(edge)), run, environment, tokenContext, new Set());
    } catch (error) {
      if (error?.code === 'PROCESS_OUTPUT_UNAVAILABLE') continue;
      throw error;
    }
  }
  return inputs;
}

// An unbound lineage socket takes the entity of its declared type among
// the run-context entity and that entity's ancestors over the declared
// containment. The run-context entity of a construct action is its
// parent, so the walk starts there.
async function resolveLineageContext(record = {}, port = {}, run = {}, environment = {}) {
  const wanted = port?.type?.typeId;
  const supplied = run.context?.inputs?.entity;
  if (!wanted || supplied == null) return undefined;
  const data = environment.data || {};
  const ref = typeof supplied === 'object'
    ? { type: supplied.type || '', id: supplied.id || supplied._id }
    : { type: '', id: supplied };
  if (!ref.id) return undefined;
  const parentTypes = (environment.domain?.containment || [])
    .filter(edge => edge.childType === record.typeId)
    .map(edge => edge.parentType);
  let current = null;
  for (const type of [...new Set([ref.type, ...parentTypes].filter(Boolean))]) {
    try {
      current = await data.resolveEntityRef?.({ type, id: ref.id });
    } catch {
      current = null;
    }
    if (current) break;
  }
  for (let depth = 0; current && depth < 16; depth += 1) {
    if (current.type === wanted) return current;
    if (!data.parentEntity) return undefined;
    current = await data.parentEntity(current, current.type);
  }
  return undefined;
}

// The broadcast rule for socket-shaped values (run-context inputs and
// authored inputDefaults alike): a List-declared socket accepts either an
// array (one packet item per entry) or a single value — the scalar wraps as
// one broadcast item rather than being rejected as a list arity error.
function socketPacket(value, access = 'item') {
  const shape = access === 'list' && !Array.isArray(value) && !isDataTree(value) ? 'item' : access;
  return createDataPacket(structuredClone(value), shape || 'item');
}

function processRunInput(inputs = {}, record = {}, portId = '', environment = {}, { bindContextEntity = false } = {}) {
  if (portId === 'entity') {
    const typed = record.typeId ? inputs.entities?.[record.typeId] : undefined;
    if (typed !== undefined) return typed;
    return bindContextEntity ? inputs.entity : undefined;
  }
  if (Object.hasOwn(inputs.data || {}, portId)) return inputs.data[portId];
  if (portId.startsWith('entry:') && Array.isArray(record.entries)) {
    const entry = record.entries.find(item => `entry:${item.id}` === portId);
    if (entry?.key) {
      const value = readInputPath(inputs.data, `${record.block}.${entry.key}`);
      if (value !== undefined) return value;
    }
  }
  const nested = readInputPath(inputs.data, portId);
  if (nested !== undefined) return nested;
  const field = (environment.catalogContext?.(record)?.fieldSchemas || [])
    .find(schema => schema.path === portId);
  const relatedType = field?.type?.typeId;
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
  const graphNode = (processGraphNodes(process)).find(item => String(item.id) === String(nodeId));
  if (graphNode && processNodeType(process, graphNode) === 'stateDefinition') {
    const definition = process.stateDefinitions?.[recordId(graphNode)];
    if (!definition?.stateId) throw new Error(`Status definition ${recordId(graphNode)} does not exist`);
    return createDataPacket(definition.stateId);
  }
  const node = processNode(process, nodeId);
  const record = processNodeRecord(process, node);
  const ports = resolveCatalogNodePorts(record, environment.catalogContext?.(record) || {});
  const resolvedOutputId = resolveDataOutputId(ports.outputs, outputId, record);
  const cacheKey = `${nodeId}:${resolvedOutputId}:${tokenContext.scope || 'root'}`;
  if (tokenContext.values?.[cacheKey]) return tokenContext.values[cacheKey];
  if (tokenContext.values?.[`${nodeId}:${resolvedOutputId}`]) return tokenContext.values[`${nodeId}:${resolvedOutputId}`];
  // Read nodes execute their own select: the run-context shortcut yields
  // a bare reference, while a current read must hand downstream relation
  // reads the stored entity. Effects keep the shortcut for their ref
  // outputs.
  const contextualOutput = record.kind === 'cts.read'
    ? null
    : await resolveContextualEntityOutput(
        ports.outputs.find(port => port.id === resolvedOutputId),
        run.context?.inputs || {},
        environment
      );
  if (contextualOutput) return contextualOutput;
  const previewServiceCall = record.kind === 'cts.service'
    && tokenContext.scope === 'preview'
    && typeof environment.previewService === 'function' ? record : null;
  if (record.kind.endsWith('Trigger') || record.kind.startsWith('control.')
    || (isEffectRecord(record) && !previewServiceCall)) {
    const error = new Error(`Operational node ${record.id || node.id} has not emitted data output ${resolvedOutputId}`);
    error.code = 'PROCESS_OUTPUT_UNAVAILABLE';
    throw error;
  }
  if (resolving.has(cacheKey)) throw new Error(`Data cycle detected at ${nodeId}:${outputId}`);
  resolving.add(cacheKey);
  const inputs = {};
  for (const port of ports.inputs.filter(item => item.role === 'data')) {
    const edge = incomingData(process, node.id, port.id);
    if (!edge) {
      if (Object.hasOwn(record.inputDefaults || {}, port.id)) {
        inputs[port.id] = socketPacket(record.inputDefaults[port.id], port.access);
        continue;
      }
      const runValue = processRunInput(run.context?.inputs || {}, record, port.id, environment, {
        bindContextEntity: isTriggerNode(run, graphNode)
      });
      if (runValue !== undefined) {
        inputs[port.id] = socketPacket(runValue, port.access);
        continue;
      }
      continue;
    }
    try {
      inputs[port.id] = await evaluateNodeOutput(process, edgeSource(edge), cleanHandle(edgeSourcePort(edge)), run, environment, tokenContext, resolving);
    } catch (error) {
      if (error?.code === 'PROCESS_OUTPUT_UNAVAILABLE') continue;
      throw error;
    }
  }
  const dataInputs = ports.inputs.filter(port => port.role === 'data');
  // Make List evaluates inputless on purpose: every item socket is optional,
  // so a fully unconnected constructor yields the empty list.
  const allowsInputlessEvaluation = record.kind.startsWith('source.')
    || record.kind === 'cts.read'
    || record.kind === 'collection.makeList';
  if (!Object.keys(inputs).length && (
    dataInputs.some(port => port.required)
    || (dataInputs.length && !allowsInputlessEvaluation)
  )) {
    const error = new Error(`Data node ${record.id || node.id} has no available inputs`);
    error.code = 'PROCESS_OUTPUT_UNAVAILABLE';
    throw error;
  }
  const packet = previewServiceCall
    ? await executePreviewService(previewServiceCall, inputs, ports, environment)
    : await executeProcessDataNode(record, inputs, {
      ...(environment.data || {}),
      domain: environment.domain,
      fieldSchemas: environment.catalogContext?.(record)?.fieldSchemas,
      inputs: run.context?.inputs,
      trigger: run.trigger,
      now: environment.now,
      outputId
    });
  // One dispatch per output per preview pass: fan-out consumers reuse
  // the memoized packet.
  if (previewServiceCall) tokenContext.values[cacheKey] = packet;
  resolving.delete(cacheKey);
  return packet;
}

// Preview scope evaluates a value service as a data node (SPEC §28):
// one dispatch over the assembled input record — a list field passes
// its whole list — and the returned value becomes the result packet.
async function executePreviewService(record, inputs, ports, environment) {
  if (!record.operator) throw new Error(`Service node ${record.id || record.kind} has no operator`);
  const parameters = {};
  for (const port of ports.inputs.filter(item => item.role === 'data')) {
    if (!inputs[port.id]) continue;
    parameters[port.id] = packetValue(inputs[port.id], port.access === 'list' ? 'list' : 'item');
  }
  const result = await environment.previewService(record.operator, parameters);
  const output = ports.outputs.find(item => item.role === 'data') || {};
  return createDataPacket(structuredClone(result), output.access === 'list' ? 'list' : 'item');
}

async function resolveContextualEntityOutput(port = {}, inputs = {}, environment = {}) {
  const type = port.type || {};
  if (!['entity', 'entityRef'].includes(type.base) || port.access !== 'item' || !type.typeId) return null;
  const candidate = inputs.entities?.[type.typeId] ?? inputs.entity;
  if (candidate == null || candidate === '') return null;
  const reference = typeof candidate === 'object'
    ? { type: candidate.type || type.typeId, id: candidate.id || candidate._id || candidate.identity?.uid }
    : { type: type.typeId, id: candidate };
  if (!reference.id) return null;
  if (type.base === 'entityRef') return createDataPacket(reference);
  if (typeof candidate === 'object' && (candidate._id || candidate.identity)) return createDataPacket(candidate);
  const entity = environment.data?.resolveEntityRef
    ? await environment.data.resolveEntityRef(reference)
    : reference;
  return createDataPacket(entity);
}

function resolveDataOutputId(outputs = [], requestedId = '', record = {}) {
  const dataOutputs = outputs.filter(port => port.role === 'data');
  const requested = cleanHandle(requestedId);
  const matched = dataOutputs.find(port => port.id === requested);
  if (matched) return matched.id;
  if (dataOutputs.length === 1) return dataOutputs[0].id;
  throw new Error(`Node ${record.id || record.kind} does not expose data output ${requested || '(default)'}`);
}

function processData(definition) {
  const graphDocument = definition?.format === 'perigram.graph'
    ? definition
    : definition?.data?.format === 'perigram.graph'
      ? definition.data
      : null;
  if (!graphDocument) {
    throw new Error('Process orchestration requires a canonical graph document');
  }
  const metadata = graphDocument.metadata?.[PROCESS_GRAPH_METADATA_KEY];
  const process = {
    ...structuredClone(metadata?.sourceData || {}),
    dataflowVersion: Number(metadata?.dataflowVersion || 0),
    graph: graphDocument
  };
  if (process.dataflowVersion !== 4) throw new Error('Durable orchestration requires process dataflow version 4');
  return process;
}

function findTriggerNode(process, trigger) {
  // Entry points (SPEC §20): a manual effect starts on user action; a
  // scheduled effect starts at its authored time; an event-subscribed
  // effect (authored `eventId`, no wire) starts when that event arrives.
  const nodes = (processGraphNodes(process)).filter(node => {
    const record = processNodeRecord(process, node) || {};
    if (!isEffectRecord(record)) return false;
    const mode = record.trigger?.mode || 'manual';
    return mode === 'manual' || mode === 'schedule' || (mode === 'event' && record.eventId);
  });
  const match = trigger.nodeId
    ? nodes.find(node => String(node.id) === String(trigger.nodeId))
    : nodes.find(node => {
      const record = processNodeRecord(process, node);
      if (trigger.kind && record.kind !== trigger.kind) return false;
      if (trigger.eventId && record.eventId !== trigger.eventId) return false;
      if (trigger.typeId && record.typeId !== trigger.typeId) return false;
      if (trigger.mode && record.trigger?.mode !== trigger.mode) return false;
      return true;
    });
  if (!match) throw new Error(`Process trigger ${trigger.nodeId || trigger.kind || '(default)'} not found`);
  return match;
}

function processGraphNodes(process) {
  // Canonical documents stay canonical throughout durable evaluation. Do not
  // allocate a second Vue-Flow-shaped node graph just to read the document.
  return process.graph?.nodes || [];
}

function processGraphEdges(process) {
  return process.graph.edges;
}

function processNodeType(process, node) {
  const operationId = String(node?.operation?.id || '');
  if (node?.operation?.provider === PROCESS_GRAPH_PROVIDER && !operationId.startsWith('canvas-node.')) return 'processNode';
  return operationId.replace(/^canvas-node\./, '');
}

function processNodeRecord(process, node) {
  const record = node?.config?.record;
  if (record) return structuredClone(record);
  const refId = String(node?.config?.refId || node?.id || '');
  const kind = String(node?.operation?.id || '');
  return kind && kind !== 'canvas-node.stateDefinition'
    ? { ...structuredClone(node?.config || {}), id: refId, kind }
    : process.stateDefinitions?.[refId] || null;
}

function processNode(process, id) {
  const node = processGraphNodes(process).find(item => String(item.id) === String(id));
  if (!node || processNodeType(process, node) !== 'processNode' || !processNodeRecord(process, node)) {
    throw new Error(`Process node ${id} does not exist`);
  }
  return node;
}

function edgeSource(edge) { return edge.source.node; }
function edgeTarget(edge) { return edge.target.node; }
function edgeSourcePort(edge) { return edge.source.port; }
function edgeTargetPort(edge) { return edge.target.port; }

function outgoingControl(process, nodeId, handle) {
  return processGraphEdges(process).filter(edge => (
    String(edgeSource(edge)) === String(nodeId)
    && edgeRole(edge) === 'control'
    && (!handle || cleanHandle(edgeSourcePort(edge)) === handle)
  ));
}

function incomingControl(process, nodeId) {
  return processGraphEdges(process).filter(edge => String(edgeTarget(edge)) === String(nodeId) && edgeRole(edge) === 'control');
}

function incomingData(process, nodeId, handle) {
  return processGraphEdges(process).find(edge => (
    String(edgeTarget(edge)) === String(nodeId)
    && edgeRole(edge) === 'data'
    && cleanHandle(edgeTargetPort(edge)) === handle
  ));
}

function edgeRole(edge) {
  return edge.kind || 'data';
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
    loopKey: inherited.loopKey || null,
    attempt: 1
  };
}

function enqueueEdges(run, edges, inherited) {
  for (const edge of edges) {
    run.tokens.push(token(edgeTarget(edge), edgeTargetPort(edge), {
      ...inherited,
      sourceNodeId: edgeSource(edge)
    }));
  }
}

function recordId(node) {
  return String(node?.config?.refId || node?.id || '');
}

function instant(now) {
  const value = typeof now === 'function' ? now() : new Date();
  return new Date(value).toISOString();
}

function serializeError(error) {
  return {
    name: error?.name || 'Error',
    message: error?.message || String(error),
    ...(Array.isArray(error?.data?.failures) && error.data.failures.length ? { failures: error.data.failures } : {})
  };
}
