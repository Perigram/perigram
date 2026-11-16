const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const PROVIDER_IDENTIFIER = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const SHAPES = new Set(['item', 'list', 'tree', 'map', 'tuple', 'stream']);
const EXECUTION_KINDS = new Set(['pure', 'read', 'stateful', 'proposal', 'commit', 'effect', 'control']);

export function normalizeNodeDefinition(source = {}) {
  validateNodeDefinition(source);
  const normalizePort = port => ({
    id: port.id,
    label: String(port.label || port.id),
    shape: port.shape || 'item',
    semantic: cloneJson(port.semantic),
    required: port.required !== false,
    ...(Object.hasOwn(port, 'default') ? { default: cloneJson(port.default) } : {}),
    ...(port.description ? { description: String(port.description) } : {})
  });
  return deepFreeze({
    provider: source.provider,
    id: source.id,
    version: String(source.version),
    label: String(source.label || source.id),
    ...(source.description ? { description: String(source.description) } : {}),
    inputs: (source.inputs || []).map(normalizePort),
    outputs: (source.outputs || []).map(normalizePort),
    execution: {
      kind: source.execution.kind,
      capabilities: [...new Set(source.execution.capabilities || [])].sort(),
      deterministic: source.execution.deterministic === true,
      idempotent: source.execution.idempotent === true
    },
    ...(source.preview ? { preview: cloneJson(source.preview) } : {}),
    ...(source.configuration ? { configuration: cloneJson(source.configuration) } : {})
  });
}

export function validateNodeDefinition(source) {
  const problems = [];
  if (!isRecord(source)) return [{ code: 'invalid-definition', path: '$', message: 'Node definition must be an object' }];
  if (!PROVIDER_IDENTIFIER.test(String(source.provider || ''))) problems.push(issue('invalid-provider', 'provider', 'Provider must be a stable lowercase identifier'));
  if (!IDENTIFIER.test(String(source.id || ''))) problems.push(issue('invalid-operation-id', 'id', 'Operation id must be a stable lowercase identifier'));
  if (source.version == null || !String(source.version).trim()) problems.push(issue('missing-version', 'version', 'Node definition version is required'));
  if (!source.execution || !EXECUTION_KINDS.has(source.execution.kind)) {
    problems.push(issue('invalid-execution-kind', 'execution.kind', 'Execution kind must be pure, read, stateful, proposal, commit, effect, or control'));
  }
  for (const key of ['inputs', 'outputs']) {
    if (source[key] != null && !Array.isArray(source[key])) {
      problems.push(issue('invalid-ports', key, `${key} must be an array`));
      continue;
    }
    const seen = new Set();
    for (const [index, port] of (source[key] || []).entries()) {
      const path = `${key}[${index}]`;
      if (!isRecord(port)) {
        problems.push(issue('invalid-port', path, 'Port must be an object'));
        continue;
      }
      if (!IDENTIFIER.test(String(port.id || ''))) problems.push(issue('invalid-port-id', `${path}.id`, 'Port id must be a stable lowercase identifier'));
      if (seen.has(port.id)) problems.push(issue('duplicate-port-id', `${path}.id`, `Duplicate port id ${port.id}`));
      seen.add(port.id);
      if (port.shape != null && !SHAPES.has(port.shape)) problems.push(issue('invalid-port-shape', `${path}.shape`, `Unsupported transport shape ${port.shape}`));
      if (!isRecord(port.semantic) || !Object.keys(port.semantic).length) problems.push(issue('missing-semantic', `${path}.semantic`, 'Port requires a non-empty semantic descriptor object'));
      else if (!isJsonValue(port.semantic)) problems.push(issue('invalid-semantic', `${path}.semantic`, 'Semantic descriptor must be JSON-compatible'));
      if (Object.hasOwn(port, 'default') && !isJsonValue(port.default)) problems.push(issue('invalid-default', `${path}.default`, 'Port default must be JSON-compatible'));
    }
  }
  if (source.execution && !Array.isArray(source.execution.capabilities || [])) {
    problems.push(issue('invalid-capabilities', 'execution.capabilities', 'Execution capabilities must be an array'));
  }
  for (const [index, capability] of (source.execution?.capabilities || []).entries()) {
    if (typeof capability !== 'string' || !IDENTIFIER.test(capability)) {
      problems.push(issue('invalid-capability', `execution.capabilities[${index}]`, 'Capability must be a stable lowercase identifier'));
    }
  }
  if (source.preview != null && !isJsonValue(source.preview)) {
    problems.push(issue('invalid-preview', 'preview', 'Preview declarations must be JSON-compatible'));
  }
  if (source.configuration != null && !isJsonValue(source.configuration)) {
    problems.push(issue('invalid-configuration', 'configuration', 'Configuration schema must be JSON-compatible'));
  }
  return problems;
}

export function assertValidNodeDefinition(source) {
  const problems = validateNodeDefinition(source);
  if (problems.length) {
    const error = new Error(`Invalid node definition: ${problems.map(item => item.message).join('; ')}`);
    error.problems = problems;
    throw error;
  }
  return normalizeNodeDefinition(source);
}

export function normalizeNodeProvider(source = {}) {
  const provider = String(source.provider || '');
  if (!PROVIDER_IDENTIFIER.test(provider)) throw new Error('Node provider requires a stable lowercase provider id');
  if (typeof source.execute !== 'function') throw new Error(`Node provider ${provider} requires an execute function`);
  if (!Array.isArray(source.definitions) || !source.definitions.length) {
    throw new Error(`Node provider ${provider} requires at least one node definition`);
  }
  const definitions = source.definitions.map(definition => {
    const normalized = assertValidNodeDefinition(definition);
    if (normalized.provider !== provider) {
      throw new Error(`Node definition ${normalized.id} belongs to ${normalized.provider}, not ${provider}`);
    }
    return normalized;
  });
  const previewRenderers = source.previewRenderers || {};
  if (!isRecord(previewRenderers) || Object.values(previewRenderers).some(renderer => typeof renderer !== 'function')) {
    throw new Error(`Node provider ${provider} previewRenderers must map renderer ids to functions`);
  }
  for (const definition of definitions) {
    const rendererId = definition.preview?.renderer;
    if (rendererId && typeof previewRenderers[rendererId] !== 'function') {
      throw new Error(`Node definition ${definition.id} declares missing preview renderer ${rendererId}`);
    }
  }
  return Object.freeze({
    provider,
    definitions: Object.freeze(definitions),
    execute: source.execute,
    previewRenderers: Object.freeze({ ...previewRenderers })
  });
}

export function createNodeProviderRegistry() {
  const definitions = new Map();
  return Object.freeze({
    register(source) {
      const definition = assertValidNodeDefinition(source);
      const key = operationKey(definition.provider, definition.id, definition.version);
      if (definitions.has(key)) throw new Error(`Node definition already registered: ${key}`);
      definitions.set(key, definition);
      return definition;
    },
    resolve(provider, id, version) {
      return definitions.get(operationKey(provider, id, version)) || null;
    },
    list({ provider } = {}) {
      return [...definitions.values()]
        .filter(definition => !provider || definition.provider === provider)
        .sort((a, b) => operationKey(a.provider, a.id, a.version).localeCompare(operationKey(b.provider, b.id, b.version)));
    },
    providers() {
      return [...new Set([...definitions.values()].map(definition => definition.provider))].sort();
    }
  });
}

function operationKey(provider, id, version) {
  return `${provider}/${id}@${version}`;
}

function issue(code, path, message) {
  return { code, path, message };
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null));
}

function isJsonValue(value, seen = new Set()) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || seen.has(value)) return false;
  if (!Array.isArray(value) && !isRecord(value)) return false;
  seen.add(value);
  const valid = (Array.isArray(value) ? value : Object.values(value)).every(item => isJsonValue(item, seen));
  seen.delete(value);
  return valid;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
