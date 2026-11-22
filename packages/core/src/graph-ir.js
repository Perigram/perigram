import { isRecord, isJsonValue, cloneJson, deepFreeze } from './json.js';
import {
  assertValidGraphDocument,
  GRAPH_DOCUMENT_FORMAT,
  GRAPH_DOCUMENT_VERSION,
  GRAPH_INPUT_OPERATION,
  GRAPH_OUTPUT_OPERATION,
  GRAPH_INVOKE_OPERATION,
  TRANSPORT_SHAPES
} from './graph.js';

export const TYPED_IR_FORMAT = 'perigram.typed-ir';
export const TYPED_IR_VERSION = 1;

const EXECUTION_TARGETS = new Set(['browser', 'server']);
// Outcome and kind values mirror the plugin-sdk node-contract vocabularies
// (packages/plugin-sdk/README.md); core carries its own copy because the
// package graph forbids cross-package source imports.
const IR_EXECUTION_KINDS = new Set(['pure', 'read', 'stateful', 'proposal', 'commit', 'effect', 'control']);
const DECISION_COMPATIBILITY = new Map([
  ['exact', true],
  ['safe-coercion', true],
  ['conditional', true],
  ['conversion-required', false],
  ['incompatible', false]
]);

// Lowering is a pure function of the validated document, the resolved
// definitions, and the resolved subgraph interfaces: no clock, no random,
// no execution. The same pinned inputs always construct the same IR.
export async function lowerGraphToTypedIR({
  graph: source,
  resolveNodeDefinition,
  resolveGraph,
  resolveCompatibility,
  executionTarget = 'browser',
  maxGraphDepth = 32
} = {}) {
  if (!EXECUTION_TARGETS.has(executionTarget)) throw new Error(`Unsupported graph execution target: ${executionTarget}`);
  if (typeof resolveNodeDefinition !== 'function') throw new Error('resolveNodeDefinition callback is required');

  let document;
  try {
    document = assertValidGraphDocument(source);
  } catch (error) {
    return {
      ir: null,
      diagnostics: (error.problems || []).map(item => diagnostic('error', 'validation', item.message, { path: item.path }))
    };
  }

  const shared = {
    resolveNodeDefinition,
    resolveGraph,
    resolveCompatibility,
    executionTarget,
    maxGraphDepth,
    memo: new Map()
  };
  return lowerDocument(document, [`${document.id}@${document.revision}`], shared);
}

async function lowerDocument(document, invocationPath, shared) {
  const diagnostics = [];
  const operations = [];
  const dependencies = [];
  const capabilities = new Set();
  const executionKinds = new Set();
  const portContracts = new Map();

  for (const node of document.nodes) {
    const nodeId = node.id;

    if (node.operation.id === GRAPH_INPUT_OPERATION || node.operation.id === GRAPH_OUTPUT_OPERATION) {
      const direction = node.operation.id === GRAPH_INPUT_OPERATION ? 'input' : 'output';
      const interfacePort = document.interface[direction === 'input' ? 'inputs' : 'outputs']
        .find(port => port.id === node.config.interfaceId);
      const contract = interfacePort
        ? { shape: interfacePort.contract.shape, semantic: cloneJson(interfacePort.contract.semantic) }
        : null;
      if (!interfacePort) {
        diagnostics.push(diagnostic('error', 'lowering', `Boundary node ${nodeId} references undeclared ${direction} ${node.config.interfaceId}`, { nodeId }));
      }
      operations.push(deepFreeze({
        nodeId,
        operation: { ...node.operation },
        boundary: { direction, interfaceId: node.config.interfaceId },
        slots: direction === 'input'
          ? { outputs: [{ port: 'value', shape: contract?.shape ?? null, semantic: contract?.semantic ?? null, required: true }] }
          : { inputs: [{ port: 'value', shape: contract?.shape ?? null, semantic: contract?.semantic ?? null, required: true }] },
        config: cloneJson(node.config)
      }));
      portContracts.set(`${nodeId}:value`, contract ? { shape: contract.shape, semantic: contract.semantic, compatibility: null, required: true } : null);
      continue;
    }

    if (node.operation.id === GRAPH_INVOKE_OPERATION) {
      const invocationPin = { graphId: node.config.graphId, revision: node.config.revision };
      let childInterface = null;
      let loweringSummary = null;
      if (typeof shared.resolveGraph !== 'function') {
        diagnostics.push(diagnostic('error', 'lowering', `Use Graph node ${nodeId} requires a resolveGraph callback`, { nodeId }));
      } else {
        let child;
        let resolutionFailed = false;
        try {
          child = await shared.resolveGraph(node.config.graphId, node.config.revision);
        } catch (error) {
          resolutionFailed = true;
          const status = Number(error?.statusCode || error?.status || error?.response?.status);
          const expectedAccessFailure = status === 403 || status === 404;
          diagnostics.push(diagnostic(
            'error',
            'lowering',
            expectedAccessFailure
              ? `Pinned subgraph ${invocationPin.graphId}@${invocationPin.revision} is unavailable or inaccessible`
              : `Failed to resolve pinned subgraph ${invocationPin.graphId}@${invocationPin.revision}: ${error?.message || String(error)}`,
            { nodeId }
          ));
        }
        let childDocument = null;
        try {
          childDocument = child ? assertValidGraphDocument(child) : null;
        } catch (error) {
          diagnostics.push(diagnostic('error', 'lowering', `Pinned subgraph ${invocationPin.graphId}@${invocationPin.revision} is invalid: ${error.message}`, { nodeId }));
        }
        if (childDocument && (childDocument.id !== invocationPin.graphId || childDocument.revision !== invocationPin.revision)) {
          diagnostics.push(diagnostic('error', 'lowering', `Subgraph resolver returned the wrong revision for node ${nodeId}`, { nodeId }));
        } else if (childDocument) {
          childInterface = deepFreeze({
            inputs: childDocument.interface.inputs.map(port => interfaceSlot(port)),
            outputs: childDocument.interface.outputs.map(port => interfaceSlot(port))
          });
          loweringSummary = await lowerPinnedSubgraph(childDocument, invocationPath, shared, diagnostics, nodeId);
        } else if (!resolutionFailed && child !== undefined && !child) {
          diagnostics.push(diagnostic('error', 'lowering', `Pinned subgraph ${invocationPin.graphId}@${invocationPin.revision} is unavailable`, { nodeId }));
        }
      }
      operations.push(deepFreeze({
        nodeId,
        operation: { ...node.operation },
        invocation: deepFreeze({
          ...invocationPin,
          ...(childInterface ? { interface: childInterface } : {}),
          ...(loweringSummary ? { lowering: loweringSummary } : {})
        }),
        slots: childInterface
          ? { inputs: childInterface.inputs, outputs: childInterface.outputs }
          : { inputs: [], outputs: [] },
        config: cloneJson(node.config)
      }));
      if (childInterface) {
        for (const slot of [...childInterface.inputs, ...childInterface.outputs]) {
          portContracts.set(`${nodeId}:${slot.port}`, { shape: slot.shape, semantic: slot.semantic });
        }
      }
      continue;
    }

    let definition = null;
    try {
      definition = await shared.resolveNodeDefinition(node.operation, { node, config: node.config });
    } catch (error) {
      diagnostics.push(diagnostic('error', 'lowering', `Operation ${node.operation.provider}/${node.operation.id}@${node.operation.version} for node ${nodeId} is unresolved: ${error?.message || String(error)}`, { nodeId }));
    }
    if (!definition) {
      if (!diagnostics.some(item => item.nodeId === nodeId && item.message.includes('is unresolved'))) {
        diagnostics.push(diagnostic('error', 'lowering', `Operation ${node.operation.provider}/${node.operation.id}@${node.operation.version} for node ${nodeId} is unresolved`, { nodeId }));
      }
      operations.push(deepFreeze({
        nodeId,
        operation: { ...node.operation },
        unresolved: true,
        config: cloneJson(node.config)
      }));
      continue;
    }

    const declaredTargets = definition.execution?.targets;
    if (Array.isArray(declaredTargets) && declaredTargets.length && !declaredTargets.includes(shared.executionTarget)) {
      diagnostics.push(diagnostic('error', 'lowering', `Node ${nodeId} does not support ${shared.executionTarget} execution`, { nodeId }));
    }
    const kind = definition.execution?.kind;
    if (kind) executionKinds.add(kind);
    for (const capability of definition.execution?.capabilities || []) capabilities.add(String(capability));

    const inputs = portSlots(definition.inputs, nodeId, 'input', diagnostics);
    const outputs = portSlots(definition.outputs, nodeId, 'output', diagnostics);
    for (const slot of [...inputs, ...outputs]) {
      portContracts.set(`${nodeId}:${slot.port}`, { shape: slot.shape ?? null, semantic: slot.semantic ?? null, compatibility: slot.compatibility ?? null, required: slot.required === true });
    }
    operations.push(deepFreeze({
      nodeId,
      operation: { ...node.operation },
      pin: definition.packagePin ? cloneJson(definition.packagePin) : null,
      execution: deepFreeze({
        kind: kind ?? null,
        targets: Array.isArray(declaredTargets) ? [...declaredTargets] : null,
        capabilities: [...(definition.execution?.capabilities || [])].map(String),
        deterministic: definition.execution?.deterministic === true,
        idempotent: definition.execution?.idempotent === true
      }),
      slots: deepFreeze({ inputs, outputs }),
      config: cloneJson(node.config)
    }));
  }

  for (const edge of document.edges) {
    const sourceContract = portContracts.get(`${edge.source.node}:${edge.source.port}`);
    const targetContract = portContracts.get(`${edge.target.node}:${edge.target.port}`);
    let decision;
    if (!sourceContract || !targetContract) {
      const missing = sourceContract ? `target ${edge.target.node}:${edge.target.port}` : `source ${edge.source.node}:${edge.source.port}`;
      decision = { status: 'incompatible', compatible: false, reason: `Unresolved port contract on ${missing}`, conversions: [] };
      diagnostics.push(diagnostic('error', 'lowering', decision.reason, {
        nodeId: sourceContract ? edge.target.node : edge.source.node,
        edgeId: edge.id,
        portId: sourceContract ? edge.target.port : edge.source.port
      }));
    } else {
      decision = shared.resolveCompatibility
        ? normalizeDecision(await shared.resolveCompatibility(
            { port: edge.source.port, ...sourceContract },
            { port: edge.target.port, ...targetContract }
          ))
        : defaultCompatibility(sourceContract, targetContract);
      if (!decision.compatible) {
        diagnostics.push(diagnostic('error', 'lowering', `Edge ${edge.id} is incompatible: ${decision.reason}`, {
          nodeId: edge.source.node,
          edgeId: edge.id,
          portId: edge.source.port
        }));
      }
    }
    dependencies.push(deepFreeze({
      edgeId: edge.id,
      kind: edge.kind || 'data',
      source: deepFreeze({ ...edge.source }),
      target: deepFreeze({ ...edge.target }),
      decision: deepFreeze(decision)
    }));
  }

  const surfaced = invocationPath.length > 1
    ? diagnostics.map(item => (item.invocationPath ? item : prefixed(item, invocationPath)))
    : diagnostics;
  const ir = deepFreeze({
    format: TYPED_IR_FORMAT,
    version: TYPED_IR_VERSION,
    source: deepFreeze({ format: GRAPH_DOCUMENT_FORMAT, version: GRAPH_DOCUMENT_VERSION, id: document.id, revision: document.revision }),
    executionTarget: shared.executionTarget,
    interface: deepFreeze({
      inputs: document.interface.inputs.map(port => interfaceSlot(port)),
      outputs: document.interface.outputs.map(port => interfaceSlot(port))
    }),
    operations: deepFreeze(operations),
    dependencies: deepFreeze(dependencies),
    capabilities: deepFreeze([...capabilities].sort()),
    executionKinds: deepFreeze([...executionKinds].sort()),
    diagnostics: deepFreeze(surfaced)
  });
  return { ir, diagnostics: surfaced };
}

async function lowerPinnedSubgraph(childDocument, invocationPath, shared, diagnostics, nodeId) {
  const childKey = `${childDocument.id}@${childDocument.revision}`;
  if (invocationPath.includes(childKey)) {
    diagnostics.push(diagnostic('error', 'lowering', `Recursive subgraph invocation detected: ${[...invocationPath, childKey].join(' → ')}`, {
      nodeId,
      invocationPath: [...invocationPath, childKey]
    }));
    return null;
  }
  if (invocationPath.length >= shared.maxGraphDepth) {
    diagnostics.push(diagnostic('error', 'lowering', `Subgraph nesting exceeds maximum depth ${shared.maxGraphDepth}: ${[...invocationPath, childKey].join(' → ')}`, {
      nodeId,
      invocationPath: [...invocationPath, childKey]
    }));
    return null;
  }
  let memoized = shared.memo.get(childKey);
  if (!memoized) {
    const lowered = await lowerDocument(childDocument, [...invocationPath, childKey], shared);
    memoized = { diagnostics: lowered.diagnostics };
    shared.memo.set(childKey, memoized);
    for (const item of lowered.diagnostics) diagnostics.push(item);
  }
  return { diagnostics: memoized.diagnostics.length };
}

export function validateTypedIR(source) {
  const problems = [];
  if (!isRecord(source)) return [{ code: 'invalid-ir', path: '$', message: 'Typed IR must be an object' }];
  if (source.format !== TYPED_IR_FORMAT) problems.push({ code: 'unsupported-format', path: 'format', message: `Unsupported IR format ${source.format}` });
  if (source.version !== TYPED_IR_VERSION) problems.push({ code: 'unsupported-version', path: 'version', message: `Unsupported IR version ${source.version}` });
  if (!isJsonValue(source)) problems.push({ code: 'non-serializable', path: '$', message: 'Typed IR must be JSON-compatible' });

  const interfacePorts = validateIRInterface(source.interface, problems);
  const portsByNode = validateIROperations(source.operations, interfacePorts, problems);
  validateIRDependencies(source.dependencies, portsByNode, problems);
  validateIRAggregate(source.capabilities, 'capabilities', 'capabilities', problems);
  validateIRAggregate(source.executionKinds, 'executionKinds', 'execution-kinds', problems);
  validateIRDiagnostics(source.diagnostics, problems);
  return problems;
}

function validateIRInterface(value, problems) {
  const ports = { inputs: new Set(), outputs: new Set() };
  if (!isRecord(value)) {
    problems.push({ code: 'invalid-interface', path: 'interface', message: 'Typed IR interface must be an object' });
    return ports;
  }
  const seen = new Set();
  for (const direction of ['inputs', 'outputs']) {
    const list = value[direction];
    if (!Array.isArray(list)) {
      problems.push({ code: 'invalid-interface', path: `interface.${direction}`, message: `Interface ${direction} must be an array` });
      continue;
    }
    list.forEach((port, index) => {
      const path = `interface.${direction}[${index}]`;
      if (!isRecord(port) || typeof port.port !== 'string' || !port.port) {
        problems.push({ code: 'invalid-interface-port', path, message: 'Interface port requires a port id' });
        return;
      }
      if (seen.has(port.port)) {
        problems.push({ code: 'duplicate-interface-port', path: `${path}.port`, message: `Duplicate interface port id ${port.port}` });
      }
      seen.add(port.port);
      ports[direction].add(port.port);
      checkPortContract(port, path, problems);
    });
  }
  return ports;
}

function validateIROperations(value, interfacePorts, problems) {
  const portsByNode = new Map();
  if (!Array.isArray(value)) {
    problems.push({ code: 'invalid-operations', path: 'operations', message: 'Typed IR operations must be an array' });
    return portsByNode;
  }
  const nodeIds = new Set();
  const bound = { input: new Set(), output: new Set() };
  value.forEach((operation, index) => {
    const path = `operations[${index}]`;
    const ports = { inputs: new Set(), outputs: new Set() };
    if (!isRecord(operation)) {
      problems.push({ code: 'invalid-operation', path, message: 'Operation entry must be an object' });
      return;
    }
    if (typeof operation.nodeId !== 'string' || !operation.nodeId) {
      problems.push({ code: 'invalid-node-id', path: `${path}.nodeId`, message: 'Operation entry requires a node id' });
    } else if (nodeIds.has(operation.nodeId)) {
      problems.push({ code: 'duplicate-node-id', path: `${path}.nodeId`, message: `Duplicate node id ${operation.nodeId}` });
    } else {
      nodeIds.add(operation.nodeId);
      portsByNode.set(operation.nodeId, ports);
    }

    const identity = operation.operation;
    if (!isRecord(identity) || typeof identity.provider !== 'string' || !identity.provider
      || typeof identity.id !== 'string' || !identity.id
      || typeof identity.version !== 'string' || !identity.version) {
      problems.push({ code: 'invalid-operation', path: `${path}.operation`, message: 'Operation identity requires provider, id, and version' });
    }

    if (operation.slots != null) {
      if (!isRecord(operation.slots)) {
        problems.push({ code: 'invalid-slots', path: `${path}.slots`, message: 'Operation slots must be an object' });
      } else {
        ports.inputs = validateSlotList(operation.slots.inputs, `${path}.slots.inputs`, problems);
        ports.outputs = validateSlotList(operation.slots.outputs, `${path}.slots.outputs`, problems);
      }
    }

    if (operation.boundary != null) {
      const boundaryPath = `${path}.boundary`;
      if (!isRecord(operation.boundary) || !['input', 'output'].includes(operation.boundary.direction)) {
        problems.push({ code: 'invalid-boundary', path: `${boundaryPath}.direction`, message: 'Boundary direction must be input or output' });
      } else if (typeof operation.boundary.interfaceId !== 'string'
        || !interfacePorts[operation.boundary.direction === 'input' ? 'inputs' : 'outputs'].has(operation.boundary.interfaceId)) {
        problems.push({ code: 'unknown-boundary-port', path: `${boundaryPath}.interfaceId`, message: `Boundary references undeclared ${operation.boundary.direction} ${operation.boundary.interfaceId}` });
      } else {
        bound[operation.boundary.direction].add(operation.boundary.interfaceId);
      }
    }

    if (operation.invocation != null) {
      const invocation = operation.invocation;
      const invocationPath = `${path}.invocation`;
      if (!isRecord(invocation) || typeof invocation.graphId !== 'string' || !invocation.graphId
        || typeof invocation.revision !== 'string' || !invocation.revision) {
        problems.push({ code: 'invalid-invocation', path: invocationPath, message: 'Invocation entry requires graphId and revision' });
      }
      if (isRecord(invocation) && isRecord(invocation.interface)) {
        validateSlotList(invocation.interface.inputs, `${invocationPath}.interface.inputs`, problems);
        validateSlotList(invocation.interface.outputs, `${invocationPath}.interface.outputs`, problems);
      }
    }

    if (operation.execution != null) {
      const execution = operation.execution;
      const executionPath = `${path}.execution`;
      if (!isRecord(execution)) {
        problems.push({ code: 'invalid-execution', path: executionPath, message: 'Execution declaration must be an object' });
      } else {
        if (execution.kind != null && !IR_EXECUTION_KINDS.has(execution.kind)) {
          problems.push({ code: 'invalid-execution-kind', path: `${executionPath}.kind`, message: `Execution kind ${execution.kind} is outside the kind vocabulary` });
        }
        if (!Array.isArray(execution.capabilities) || execution.capabilities.some(item => typeof item !== 'string')) {
          problems.push({ code: 'invalid-execution-capabilities', path: `${executionPath}.capabilities`, message: 'Execution capabilities must be an array of strings' });
        }
        for (const flag of ['deterministic', 'idempotent']) {
          if (typeof execution[flag] !== 'boolean') {
            problems.push({ code: 'invalid-execution-flag', path: `${executionPath}.${flag}`, message: `Execution ${flag} must be a boolean` });
          }
        }
      }
    }
  });

  for (const id of interfacePorts.inputs) {
    if (!bound.input.has(id)) problems.push({ code: 'missing-boundary-operation', path: 'interface.inputs', message: `Interface input ${id} has no boundary operation` });
  }
  for (const id of interfacePorts.outputs) {
    if (!bound.output.has(id)) problems.push({ code: 'missing-boundary-operation', path: 'interface.outputs', message: `Interface output ${id} has no boundary operation` });
  }
  return portsByNode;
}

function validateSlotList(list, path, problems) {
  const ports = new Set();
  if (list == null) return ports;
  if (!Array.isArray(list)) {
    problems.push({ code: 'invalid-slots', path, message: 'Slot list must be an array' });
    return ports;
  }
  list.forEach((slot, index) => {
    const slotPath = `${path}[${index}]`;
    if (!isRecord(slot) || typeof slot.port !== 'string' || !slot.port) {
      problems.push({ code: 'invalid-slot', path: slotPath, message: 'Slot requires a port id' });
      return;
    }
    if (ports.has(slot.port)) {
      problems.push({ code: 'duplicate-slot-port', path: `${slotPath}.port`, message: `Duplicate slot port ${slot.port}` });
    }
    ports.add(slot.port);
    checkPortContract(slot, slotPath, problems);
  });
  return ports;
}

function checkPortContract(port, path, problems) {
  if (port.shape != null && (typeof port.shape !== 'string' || !TRANSPORT_SHAPES.has(port.shape))) {
    problems.push({ code: 'invalid-port-shape', path: `${path}.shape`, message: `Port shape ${port.shape} is outside the transport vocabulary` });
  }
  if (port.semantic != null && !isRecord(port.semantic)) {
    problems.push({ code: 'invalid-port-semantic', path: `${path}.semantic`, message: 'Port semantic must be an object or null' });
  }
}

function validateIRDependencies(value, portsByNode, problems) {
  if (!Array.isArray(value)) {
    problems.push({ code: 'invalid-dependencies', path: 'dependencies', message: 'Typed IR dependencies must be an array' });
    return;
  }
  const edgeIds = new Set();
  value.forEach((dependency, index) => {
    const path = `dependencies[${index}]`;
    if (!isRecord(dependency)) {
      problems.push({ code: 'invalid-dependency', path, message: 'Dependency entry must be an object' });
      return;
    }
    if (typeof dependency.edgeId !== 'string' || !dependency.edgeId) {
      problems.push({ code: 'invalid-edge-id', path: `${path}.edgeId`, message: 'Dependency requires an edge id' });
    } else if (edgeIds.has(dependency.edgeId)) {
      problems.push({ code: 'duplicate-edge-id', path: `${path}.edgeId`, message: `Duplicate edge id ${dependency.edgeId}` });
    } else {
      edgeIds.add(dependency.edgeId);
    }
    for (const [side, direction] of [['source', 'outputs'], ['target', 'inputs']]) {
      const endpoint = dependency[side];
      if (!isRecord(endpoint) || typeof endpoint.node !== 'string' || typeof endpoint.port !== 'string' || !endpoint.port) {
        problems.push({ code: 'invalid-endpoint', path: `${path}.${side}`, message: `Dependency ${side} requires node and port` });
      } else if (!portsByNode.has(endpoint.node)) {
        problems.push({ code: 'unknown-endpoint-operation', path: `${path}.${side}.node`, message: `Dependency ${side} references unknown operation ${endpoint.node}` });
      } else if (!portsByNode.get(endpoint.node)[direction].has(endpoint.port)) {
        problems.push({ code: 'unknown-endpoint-port', path: `${path}.${side}.port`, message: `Dependency ${side} port ${endpoint.port} is not declared by ${endpoint.node}` });
      }
    }
    validateDecision(dependency.decision, `${path}.decision`, problems);
  });
}

function validateDecision(decision, path, problems) {
  if (!isRecord(decision)) {
    problems.push({ code: 'invalid-decision', path, message: 'Dependency decision must be an object' });
    return;
  }
  if (typeof decision.status !== 'string' || !DECISION_COMPATIBILITY.has(decision.status)) {
    problems.push({ code: 'invalid-decision-status', path: `${path}.status`, message: `Decision status ${decision.status} is outside the outcome vocabulary` });
  } else if (decision.compatible !== DECISION_COMPATIBILITY.get(decision.status)) {
    problems.push({ code: 'inconsistent-decision', path: `${path}.compatible`, message: `Decision status ${decision.status} requires compatible ${DECISION_COMPATIBILITY.get(decision.status)}` });
  }
  if (typeof decision.reason !== 'string') {
    problems.push({ code: 'invalid-decision-reason', path: `${path}.reason`, message: 'Decision reason must be a string' });
  }
  if (!Array.isArray(decision.conversions)) {
    problems.push({ code: 'invalid-decision-conversions', path: `${path}.conversions`, message: 'Decision conversions must be an array' });
  }
}

function validateIRAggregate(value, field, codeLabel, problems) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    problems.push({ code: `invalid-${codeLabel}`, path: field, message: `Typed IR ${field} must be an array of strings` });
    return;
  }
  for (let index = 1; index < value.length; index += 1) {
    if (!(value[index - 1] < value[index])) {
      problems.push({ code: `unsorted-${codeLabel}`, path: field, message: `Typed IR ${field} must be sorted and unique` });
      return;
    }
  }
}

function validateIRDiagnostics(value, problems) {
  if (!Array.isArray(value)) {
    problems.push({ code: 'invalid-diagnostics', path: 'diagnostics', message: 'Typed IR diagnostics must be an array' });
    return;
  }
  value.forEach((item, index) => {
    if (!isRecord(item) || ['code', 'severity', 'phase', 'message'].some(key => typeof item[key] !== 'string' || !item[key])) {
      problems.push({ code: 'invalid-diagnostic', path: `diagnostics[${index}]`, message: 'Diagnostics entries require code, severity, phase, and message' });
    }
  });
}

function defaultCompatibility(source, target) {
  if (source.shape && target.shape && source.shape !== target.shape) {
    return { status: 'incompatible', compatible: false, reason: `Transport shapes ${source.shape} and ${target.shape} differ`, conversions: [] };
  }
  const sourceBase = source.semantic?.base;
  const targetBase = target.semantic?.base;
  if (sourceBase && targetBase && sourceBase !== targetBase && sourceBase !== 'json' && targetBase !== 'json') {
    return { status: 'incompatible', compatible: false, reason: `Semantic bases ${sourceBase} and ${targetBase} differ`, conversions: [] };
  }
  return { status: 'exact', compatible: true, reason: 'Transport and semantic contracts match', conversions: [] };
}

function normalizeDecision(result) {
  if (!isRecord(result) || typeof result.status !== 'string' || typeof result.compatible !== 'boolean') {
    throw new Error('resolveCompatibility must return { status, compatible, reason, conversions }');
  }
  return {
    status: result.status,
    compatible: result.compatible,
    reason: String(result.reason ?? ''),
    conversions: Array.isArray(result.conversions) ? cloneJson(result.conversions) : []
  };
}

function portSlots(ports, nodeId, direction, diagnostics) {
  if (!Array.isArray(ports)) return [];
  return ports.map(port => {
    if (!isRecord(port) || typeof port.id !== 'string' || !port.id) {
      diagnostics.push(diagnostic('error', 'lowering', `Node ${nodeId} declares a malformed ${direction} port`, { nodeId }));
      return null;
    }
    return deepFreeze({
      port: port.id,
      shape: typeof port.shape === 'string' ? port.shape : null,
      semantic: isRecord(port.semantic) ? cloneJson(port.semantic) : null,
      compatibility: isRecord(port.compatibility) ? cloneJson(port.compatibility) : null,
      required: port.required === true
    });
  }).filter(Boolean);
}

function interfaceSlot(port) {
  return deepFreeze({
    port: port.id,
    shape: port.contract?.shape ?? null,
    semantic: port.contract?.semantic ? cloneJson(port.contract.semantic) : null,
    required: port.required === true,
    ...(Object.hasOwn(port, 'default') ? { default: cloneJson(port.default) } : {})
  });
}

function prefixed(item, invocationPath) {
  return deepFreeze({
    ...item,
    invocationPath: [...invocationPath],
    message: `${invocationPath.join(' → ')}: ${item.message}`
  });
}

function diagnostic(severity, phase, message, mapping = {}) {
  return deepFreeze({
    code: `${phase}-diagnostic`,
    severity,
    phase,
    message,
    ...(mapping.nodeId ? { nodeId: mapping.nodeId } : {}),
    ...(mapping.edgeId ? { edgeId: mapping.edgeId } : {}),
    ...(mapping.portId ? { portId: mapping.portId } : {}),
    ...(mapping.path ? { path: mapping.path } : {}),
    ...(mapping.invocationPath ? { invocationPath: [...mapping.invocationPath] } : {})
  });
}
