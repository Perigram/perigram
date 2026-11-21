import {
  CAST_BASES,
  CONVERT_UNITS,
  getProcessNodeDefinition,
  PROCESS_NODE_CATALOG,
  resolveCatalogNodePorts
} from './node-catalog.js';
import { executeProcessDataNode } from './evaluator.js';
import { createDataPacket, packetValue } from './data-tree.js';
import { defaultProcessNodeOperation, PROCESS_NODE_OPERATIONS_BY_KIND } from './authoring.js';
import { PROCESS_PORT_COMPATIBILITY_PROFILE } from './port-compatibility.js';

export const PROCESS_PROCEDURAL_PROVIDER = 'perigram.processes';
export const PROCESS_PROCEDURAL_VERSION = '1';

const CORE_FAMILIES = new Set(['sources', 'values', 'collections', 'records']);

// Authoring fields the graph editor inspector renders (SPEC §28.14).
export function processNodeConfigurationSchema(kind = '') {
  const properties = {};
  const defaults = {};
  if (kind === 'collection.sort') {
    properties.direction = { type: 'string', enum: ['asc', 'desc'], default: 'asc' };
    defaults.direction = 'asc';
  } else {
    const operations = PROCESS_NODE_OPERATIONS_BY_KIND[kind] || [];
    if (operations.length) {
      const operation = defaultProcessNodeOperation(kind);
      properties.operation = { type: 'string', enum: [...operations], default: operation };
      defaults.operation = operation;
    }
  }
  if (String(kind).startsWith('source.literal')) {
    const value = kind === 'source.literalList' ? [] : kind === 'source.literalTree' ? { branches: [] } : null;
    properties.value = {
      type: kind === 'source.literalItem' ? 'string' : kind === 'source.literalList' ? 'array' : 'object',
      default: value
    };
    defaults.value = value;
  }
  if (kind === 'value.format') {
    properties.template = { type: 'string', default: '' };
    defaults.template = '';
  }
  if (kind === 'value.convertUnit') {
    properties.fromUnit = { type: 'string', enum: [...CONVERT_UNITS], default: 'mm' };
    properties.toUnit = { type: 'string', enum: [...CONVERT_UNITS], default: 'm' };
    defaults.fromUnit = 'mm';
    defaults.toUnit = 'm';
  }
  if (kind === 'value.cast') {
    properties.outputType = { type: 'string', enum: [...CAST_BASES], default: 'record' };
    defaults.outputType = 'record';
  }
  return { type: 'object', additionalProperties: true, properties, default: { kind, ...defaults } };
}

const executionKind = catalog => ({
  control: 'control',
  effect: 'proposal',
  read: 'read'
})[catalog.level] || 'pure';

export function createProcessGraphNodeDefinition(kind, record = {}, catalogContext = {}) {
  const catalog = getProcessNodeDefinition(kind);
  if (!catalog) return null;
  const hasAuthoredRecord = record && Object.keys(record).length > 0;
  const ports = hasAuthoredRecord
    ? resolveCatalogNodePorts({ ...record, kind }, catalogContext)
    : { inputs: [], outputs: [] };
  return {
    provider: PROCESS_PROCEDURAL_PROVIDER,
    id: kind,
    version: PROCESS_PROCEDURAL_VERSION,
    label: catalog.label || kind,
    description: `Perigram process operation: ${kind}`,
    palette: { group: catalog.family, keywords: [kind, catalog.label, catalog.family] },
    inputs: ports.inputs.map(toGraphContractPort),
    outputs: ports.outputs.map(toGraphContractPort),
    execution: {
      kind: executionKind(catalog),
      capabilities: [],
      deterministic: catalog.pure === true,
      idempotent: catalog.pure === true
    },
    configuration: processNodeConfigurationSchema(kind)
  };
}

function toGraphContractPort(port) {
  const type = port.type && typeof port.type === 'object' ? port.type : { base: 'json' };
  const { base = 'json', ...qualifiers } = type;
  return {
    id: port.id,
    label: port.label || port.id,
    shape: port.access === 'list' || port.access === 'tree' ? port.access : 'item',
    semantic: {
      base,
      ...qualifiers,
      role: port.role || 'data',
      ...(port.kind ? { kind: port.kind } : {}),
      ...(port.typeId ? { typeId: port.typeId } : {}),
      ...(port.block ? { block: port.block } : {}),
      ...(port.multiple ? { multiple: true } : {})
    },
    required: port.required === true,
    compatibility: { profile: PROCESS_PORT_COMPATIBILITY_PROFILE }
  };
}

export function createProcessProceduralNodeDefinition(kind, record = {}, catalogContext = {}) {
  const catalog = getProcessNodeDefinition(kind);
  if (!catalog || !catalog.pure || !CORE_FAMILIES.has(catalog.family) || kind.startsWith('cts.')) {
    return null;
  }
  const ports = resolveCatalogNodePorts({ ...record, kind }, catalogContext);
  const inputs = ports.inputs.filter(port => port.role === 'data').map(toContractPort);
  const outputs = ports.outputs.filter(port => port.role === 'data').map(toContractPort);
  if (outputs.length !== 1) return null;
  return {
    provider: PROCESS_PROCEDURAL_PROVIDER,
    id: kind,
    version: PROCESS_PROCEDURAL_VERSION,
    label: catalog.label || kind,
    description: `Perigram process data operation: ${kind}`,
    palette: { group: catalog.family, keywords: [kind, catalog.label, catalog.family] },
    inputs,
    outputs,
    execution: {
      kind: 'pure',
      capabilities: [],
      deterministic: true,
      idempotent: true
    },
    configuration: processNodeConfigurationSchema(kind)
  };
}



/**
 * Resolver callback for the core procedural evaluator. Unlike the static
 * registry listing, this resolves ports against the node's authored config
 * and the current invocation context (for example, organization type
 * contracts), so dynamic sockets are checked at evaluation time.
 */
export function createProcessGraphNodeResolver({ catalogContext = {} } = {}) {
  return (operation, invocation = {}) => {
    if (operation?.provider !== PROCESS_PROCEDURAL_PROVIDER
      || String(operation?.version) !== PROCESS_PROCEDURAL_VERSION) return null;
    const resolvedContext = typeof catalogContext === 'function'
      ? catalogContext(invocation)
      : catalogContext;
    return createProcessGraphNodeDefinition(
      operation.id,
      invocation.config?.record || invocation.config || {},
      resolvedContext || {}
    );
  };
}

/** Resolver for the procedural evaluator: durable reads, effects and control
 * operations are deliberately excluded from this execution profile. */
export function createProcessProceduralNodeResolver({ catalogContext = {} } = {}) {
  return (operation, invocation = {}) => {
    if (operation?.provider !== PROCESS_PROCEDURAL_PROVIDER
      || String(operation?.version) !== PROCESS_PROCEDURAL_VERSION) return null;
    const resolvedContext = typeof catalogContext === 'function'
      ? catalogContext(invocation)
      : catalogContext;
    return createProcessProceduralNodeDefinition(
      operation.id,
      invocation.config?.record || invocation.config || {},
      resolvedContext || {}
    );
  };
}

/**
 * Register the process package's preview-safe data operations in the shared
 * plugin-SDK registry. The registry remains SDK-owned; this adapter only
 * contributes the process provider's exact-version definitions.
 */
export function registerProcessProceduralNodes(registry, { catalogContext = {} } = {}) {
  if (!registry || typeof registry.register !== 'function') {
    throw new TypeError('A plugin-SDK node provider registry is required');
  }
  const registered = [];
  for (const catalog of PROCESS_NODE_CATALOG) {
    const definition = createProcessProceduralNodeDefinition(catalog.kind, {}, catalogContext);
    if (!definition) continue;
    registered.push(registry.register(definition));
  }
  return registered;
}

/**
 * Register the complete process operation catalog for the shared graph
 * authoring surface. Pure data operations keep their executable contracts;
 * durable effects, reads and control nodes are registered as typed graph
 * operations but are executed only by the process execution profile.
 */
export function registerProcessGraphNodes(registry, { catalogContext = {} } = {}) {
  if (!registry || typeof registry.register !== 'function') {
    throw new TypeError('A plugin-SDK node provider registry is required');
  }
  return PROCESS_NODE_CATALOG.map(catalog => registry.register(
    createProcessGraphNodeDefinition(catalog.kind, { kind: catalog.kind }, catalogContext)
  ));
}

export function createProcessProceduralExecutor({ context = {}, catalogContext = {} } = {}) {
  return async (definition, invocation) => {
    if (definition.provider !== PROCESS_PROCEDURAL_PROVIDER
      || definition.version !== PROCESS_PROCEDURAL_VERSION) {
      throw new Error('Unsupported Perigram process procedural definition');
    }
    const kind = definition.id;
    const record = { ...(invocation.config || {}), id: invocation.node.id, kind };
    const catalog = getProcessNodeDefinition(kind);
    if (!catalog || !catalog.pure || !CORE_FAMILIES.has(catalog.family) || kind.startsWith('cts.')) {
      throw new Error(`Process operation ${kind} is not available in procedural preview`);
    }
    const ports = resolveCatalogNodePorts(record, catalogContext);
    const inputs = Object.fromEntries(ports.inputs
      .filter(port => port.role === 'data')
      .filter(port => Object.hasOwn(invocation.inputs, port.id))
      .map(port => [port.id, createDataPacket(invocation.inputs[port.id], port.access || 'item')]));
    const result = await executeProcessDataNode(record, inputs, context);
    const output = ports.outputs.filter(port => port.role === 'data');
    if (output.length !== 1) throw new Error(`Process operation ${kind} must expose exactly one data output for procedural preview`);
    return { [output[0].id]: packetValue(result, output[0].access || 'item') };
  };
}

function toContractPort(port) {
  const type = port.type && typeof port.type === 'object' ? port.type : { base: 'json' };
  const { base = 'json', ...qualifiers } = type;
  return {
    id: port.id,
    label: port.label || port.id,
    shape: port.access === 'list' || port.access === 'tree' ? port.access : 'item',
    semantic: { base, ...qualifiers },
    required: port.required === true
  };
}
