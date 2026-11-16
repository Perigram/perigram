import {
  getProcessNodeDefinition,
  resolveCatalogNodePorts
} from './node-catalog.js';
import { executeProcessDataNode } from './evaluator.js';
import { createDataPacket, packetValue } from './data-tree.js';

export const PROCESS_PROCEDURAL_PROVIDER = 'perigram.processes';
export const PROCESS_PROCEDURAL_VERSION = '1';

const CORE_FAMILIES = new Set(['sources', 'values', 'collections', 'records']);

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
    inputs,
    outputs,
    execution: {
      kind: 'pure',
      capabilities: [],
      deterministic: true,
      idempotent: true
    },
    configuration: {
      type: 'object',
      additionalProperties: true
    }
  };
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
