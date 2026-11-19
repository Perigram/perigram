import { isRecord, isJsonValue, cloneJson, deepFreeze } from './json.js';
import {
  assertValidGraphDocument,
  GRAPH_DOCUMENT_FORMAT,
  GRAPH_DOCUMENT_VERSION,
  GRAPH_INPUT_OPERATION,
  GRAPH_OUTPUT_OPERATION,
  GRAPH_INVOKE_OPERATION,
  CORE_GRAPH_PROVIDER
} from './graph.js';

export const TYPED_IR_FORMAT = 'perigram.typed-ir';
export const TYPED_IR_VERSION = 1;

const EXECUTION_TARGETS = new Set(['browser', 'server']);

// Lowering is a pure function of the validated document, the resolved
// definitions, and the resolved subgraph interfaces: no clock, no random,
// no execution. The same pinned inputs always construct the same IR.
export async function lowerGraphToTypedIR({
  graph: source,
  resolveNodeDefinition,
  resolveGraph,
  resolveCompatibility,
  executionTarget = 'browser'
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

  const diagnostics = [];
  const operations = [];
  const dependencies = [];
  const capabilities = new Set();
  const executionKinds = new Set();
  const portContracts = new Map();
  const invocations = new Map();

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
      portContracts.set(`${nodeId}:value`, contract);
      continue;
    }

    if (node.operation.id === GRAPH_INVOKE_OPERATION) {
      const invocationPin = { graphId: node.config.graphId, revision: node.config.revision };
      let childInterface = null;
      if (typeof resolveGraph !== 'function') {
        diagnostics.push(diagnostic('error', 'lowering', `Use Graph node ${nodeId} requires a resolveGraph callback`, { nodeId }));
      } else {
        const child = await resolveGraph(node.config.graphId, node.config.revision);
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
        } else if (child !== undefined && !child) {
          diagnostics.push(diagnostic('error', 'lowering', `Pinned subgraph ${invocationPin.graphId}@${invocationPin.revision} is unavailable`, { nodeId }));
        }
      }
      operations.push(deepFreeze({
        nodeId,
        operation: { ...node.operation },
        invocation: { ...invocationPin, ...(childInterface ? { interface: childInterface } : {}) },
        slots: childInterface
          ? { inputs: childInterface.inputs, outputs: childInterface.outputs }
          : { inputs: [], outputs: [] },
        config: cloneJson(node.config)
      }));
      invocations.set(nodeId, childInterface);
      if (childInterface) {
        for (const slot of [...childInterface.inputs, ...childInterface.outputs]) {
          portContracts.set(`${nodeId}:${slot.port}`, { shape: slot.shape, semantic: slot.semantic });
        }
      }
      continue;
    }

    const definition = await resolveNodeDefinition(node.operation, { node, config: node.config });
    if (!definition) {
      diagnostics.push(diagnostic('error', 'lowering', `Operation ${node.operation.provider}/${node.operation.id}@${node.operation.version} for node ${nodeId} is unresolved`, { nodeId }));
      operations.push(deepFreeze({
        nodeId,
        operation: { ...node.operation },
        unresolved: true,
        config: cloneJson(node.config)
      }));
      continue;
    }

    const declaredTargets = definition.execution?.targets;
    if (Array.isArray(declaredTargets) && declaredTargets.length && !declaredTargets.includes(executionTarget)) {
      diagnostics.push(diagnostic('error', 'lowering', `Node ${nodeId} does not support ${executionTarget} execution`, { nodeId }));
    }
    const kind = definition.execution?.kind;
    if (kind) executionKinds.add(kind);
    for (const capability of definition.execution?.capabilities || []) capabilities.add(String(capability));

    const inputs = portSlots(definition.inputs, nodeId, 'input', diagnostics);
    const outputs = portSlots(definition.outputs, nodeId, 'output', diagnostics);
    for (const slot of [...inputs, ...outputs]) {
      portContracts.set(`${nodeId}:${slot.port}`, { shape: slot.shape ?? null, semantic: slot.semantic ?? null });
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
      decision = resolveCompatibility
        ? normalizeDecision(await resolveCompatibility(
            { port: edge.source.port, shape: sourceContract.shape, semantic: sourceContract.semantic },
            { port: edge.target.port, shape: targetContract.shape, semantic: targetContract.semantic }
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

  const ir = deepFreeze({
    format: TYPED_IR_FORMAT,
    version: TYPED_IR_VERSION,
    source: deepFreeze({ format: GRAPH_DOCUMENT_FORMAT, version: GRAPH_DOCUMENT_VERSION, id: document.id, revision: document.revision }),
    executionTarget,
    interface: deepFreeze({
      inputs: document.interface.inputs.map(port => interfaceSlot(port)),
      outputs: document.interface.outputs.map(port => interfaceSlot(port))
    }),
    operations: deepFreeze(operations),
    dependencies: deepFreeze(dependencies),
    capabilities: deepFreeze([...capabilities].sort()),
    executionKinds: deepFreeze([...executionKinds].sort()),
    diagnostics: deepFreeze(diagnostics)
  });
  return { ir, diagnostics };
}

export function validateTypedIR(source) {
  const problems = [];
  if (!isRecord(source)) return [{ code: 'invalid-ir', path: '$', message: 'Typed IR must be an object' }];
  if (source.format !== TYPED_IR_FORMAT) problems.push({ code: 'unsupported-format', path: 'format', message: `Unsupported IR format ${source.format}` });
  if (source.version !== TYPED_IR_VERSION) problems.push({ code: 'unsupported-version', path: 'version', message: `Unsupported IR version ${source.version}` });
  if (!isJsonValue(source)) problems.push({ code: 'non-serializable', path: '$', message: 'Typed IR must be JSON-compatible' });
  return problems;
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

function diagnostic(severity, phase, message, mapping = {}) {
  return deepFreeze({
    code: `${phase}-diagnostic`,
    severity,
    phase,
    message,
    ...(mapping.nodeId ? { nodeId: mapping.nodeId } : {}),
    ...(mapping.edgeId ? { edgeId: mapping.edgeId } : {}),
    ...(mapping.portId ? { portId: mapping.portId } : {}),
    ...(mapping.path ? { path: mapping.path } : {})
  });
}
