import {
  CAST_BASES,
  CONVERT_UNITS,
  EFFECT_SPECIES_KINDS,
  getProcessNodeDefinition,
  PROCESS_AUTHORED_BASES,
  PROCESS_NODE_CATALOG,
  resolveCatalogNodePorts
} from './node-catalog.js';
import { executeProcessDataNode } from './evaluator.js';
import { createDataPacket, packetValue, PROCESS_MATCHING_MODES } from './data-tree.js';
import { defaultProcessNodeOperation, PROCESS_NODE_OPERATIONS_BY_KIND } from './authoring.js';
import { PROCESS_PORT_COMPATIBILITY_PROFILE } from './port-compatibility.js';

export const PROCESS_PROCEDURAL_PROVIDER = 'perigram.processes';
export const PROCESS_PROCEDURAL_VERSION = '1';

const CORE_FAMILIES = new Set(['sources', 'values', 'collections', 'records']);

// Authoring fields the graph editor inspector renders (SPEC §28.14). Each
// entry names a config key, its control schema, and the value a drop seeds.
const TYPED_BASE_DEFAULTS = Object.freeze({
  'value.select': 'string', 'value.recordField': 'json',
  'value.convertUnit': 'number', 'value.required': 'string',
  'value.coalesce': 'string', 'value.validate': 'string',
  'value.format': 'number',
  'value.math': 'number', 'value.string': 'string',
  'value.dateTime': 'dateTime', 'value.compare': 'string',
  'value.logic': 'string', 'collection.reduce': 'number',
  'tree.flatten': 'json', 'tree.graft': 'json', 'tree.simplify': 'json',
  'tree.branch': 'json', 'tree.zip': 'json', 'tree.unzip': 'json',
  'tree.cross': 'json', 'tree.transpose': 'json', 'tree.clean': 'json',
  'tree.stats': 'json'
});
const TEXT_DEFAULTS = Object.freeze({
  'source.processInput': { path: '' },
  'source.triggerPayload': { path: 'event.payload' },
  'source.secretRef': { secretRef: '' },
  'value.recordField': { path: '' },
  'cts.field': { path: '' },
  'collection.join': { leftKey: '', rightKey: '' },
  'control.stopFailure': { message: '' },
  'control.stopSuccess': { result: '' },
  'cts.command': { commandId: '' },
  'cts.service': { commandId: '' },
  'cts.transition': { eventId: '' },
  'cts.read': { relationKey: '', projection: '' }
});
const NUMBER_DEFAULTS = Object.freeze({
  'collection.shift': { offset: 1 },
  'collection.partition': { size: 2 },
  'value.validate': { min: null, max: null }
});
const MATCHING_KINDS = new Set([
  'collection.concat', 'collection.itemAt', 'collection.slice',
  'collection.count', 'collection.distinct', 'collection.sort',
  'collection.reverse', 'collection.shift', 'collection.partition',
  'collection.dispatch', 'collection.groupBy', 'collection.filter',
  'collection.join', 'collection.reduce', 'record.merge',
  ...Object.keys(TYPED_BASE_DEFAULTS).filter(kind => kind.startsWith('tree.'))
]);
const TYPE_BOUND_KINDS = new Set([
  'cts.construct', 'cts.mutate', 'cts.transition', 'cts.remove',
  'cts.command', 'cts.service', 'cts.conversion', 'cts.read',
  'cts.field', 'cts.emit', 'cts.compose', 'cts.decompose'
]);

export function processNodeConfigurationSchema(kind = '') {
  const properties = {};
  const defaults = {};
  function add(id, schema, value) {
    properties[id] = { ...(properties[id] || {}), ...schema, default: value };
    defaults[id] = value;
  }

  if (kind === 'collection.sort') add('direction', { type: 'string', enum: ['asc', 'desc'] }, 'asc');
  else {
    const operations = PROCESS_NODE_OPERATIONS_BY_KIND[kind] || [];
    if (operations.length) add('operation', { type: 'string', enum: [...operations] }, defaultProcessNodeOperation(kind));
  }

  if (String(kind).startsWith('source.literal')) {
    const isStructure = kind === 'source.literalList' || kind === 'source.literalTree';
    const value = kind === 'source.literalList' ? [] : kind === 'source.literalTree' ? { branches: [] } : '';
    add('value', {
      title: 'Value',
      semantic: {
        kind: 'perigram.typed-value',
        bases: [...PROCESS_AUTHORED_BASES],
        typeField: 'type',
        typeIdField: 'typeId'
      },
      default: value
    }, value);
    add('access', { type: 'string', enum: ['item', 'list', 'tree'] },
      kind === 'source.literalTree' ? 'tree' : kind === 'source.literalList' ? 'list' : 'item');
    defaults.type = { base: isStructure ? 'json' : 'string', nullable: false };
  } else if (TYPED_BASE_DEFAULTS[kind]) {
    const base = TYPED_BASE_DEFAULTS[kind];
    add('type', { semantic: { kind: 'perigram.value-base', bases: [...PROCESS_AUTHORED_BASES] } }, { base, nullable: false });
  }

  for (const [id, value] of Object.entries(TEXT_DEFAULTS[kind] || {})) add(id, { type: 'string' }, value);
  for (const [id, value] of Object.entries(NUMBER_DEFAULTS[kind] || {})) add(id, { type: 'number' }, value);
  if (MATCHING_KINDS.has(kind)) add('matching', { type: 'string', enum: [...PROCESS_MATCHING_MODES] }, 'longest');
  if (TYPE_BOUND_KINDS.has(kind)) add('typeId', { semantic: { kind: 'perigram.entity-type' } }, '');

  if (kind === 'cts.read') add('select', { type: 'string', enum: ['current', 'all', 'extract', 'parent', 'children', 'related'] }, 'current');
  if (kind === 'value.cast') add('outputType', { type: 'string', enum: [...CAST_BASES] }, 'record');
  if (kind === 'value.convertUnit') {
    add('fromUnit', { type: 'string', enum: [...CONVERT_UNITS] }, 'mm');
    add('toUnit', { type: 'string', enum: [...CONVERT_UNITS] }, 'm');
  }
  if (kind === 'value.format') add('template', { type: 'string' }, '');
  if (kind === 'value.required' || kind === 'value.validate') add('required', { type: 'boolean' }, true);
  if (kind === 'value.validate') {
    add('pattern', { type: 'string' }, '');
    add('message', { type: 'string' }, '');
  }
  if (kind === 'record.construct') add('fields', { semantic: { kind: 'perigram.field-list' } }, []);
  if (kind === 'cts.construct') add('construction', { type: 'object' }, {});
  if (kind === 'cts.transition') {
    add('guard', { type: 'object' }, {});
    add('fieldPolicy', { type: 'object' }, {});
  }
  if (EFFECT_SPECIES_KINDS.has(kind)) {
    add('trigger', { type: 'object' }, {});
    add('eventId', { type: 'string' }, '');
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
