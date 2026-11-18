export const GRAPH_EXECUTION_FORMAT = 'perigram.graph-execution';
export const GRAPH_EXECUTION_VERSION = 1;
export const GRAPH_EXECUTION_PROFILES = Object.freeze([
  'procedural-preview',
  'procedural-commit',
  'procedural-bake',
  'procedural-export',
  'process'
]);
export const GRAPH_EXECUTION_STATUSES = Object.freeze([
  'succeeded',
  'failed',
  'stale',
  'cancelled'
]);

export function createGraphExecutionRecord(source = {}) {
  if (!isRecord(source)) {
    throw new TypeError('Graph execution source must be an object');
  }
  for (const key of ['graph', 'inputs', 'outputs', 'nodeOutputs', 'diagnostics', 'provenance', 'readSet', 'artifacts']) {
    const value = source[key] ?? (key === 'graph' ? {} : undefined);
    if (value !== undefined && !isJsonValue(value)) {
      throw new TypeError(`Graph execution ${key} must be JSON-compatible`);
    }
  }
  const record = {
    format: GRAPH_EXECUTION_FORMAT,
    version: GRAPH_EXECUTION_VERSION,
    id: String(source.id || ''),
    graph: cloneJson(source.graph || {}),
    profile: String(source.profile || 'procedural-preview'),
    status: String(source.status || 'succeeded'),
    startedAt: source.startedAt || null,
    completedAt: source.completedAt || null,
    inputs: cloneJson(source.inputs || {}),
    outputs: cloneJson(source.outputs || {}),
    nodeOutputs: cloneJson(source.nodeOutputs || {}),
    diagnostics: cloneJson(source.diagnostics || []),
    provenance: cloneJson(source.provenance || { nodes: [], invocations: [] }),
    readSet: normalizeReadSet(source.readSet),
    artifacts: cloneJson(source.artifacts || [])
  };
  const problems = validateGraphExecutionRecord(record);
  if (problems.length) {
    const error = new Error(`Invalid graph execution record: ${problems.map(item => item.message).join('; ')}`);
    error.problems = problems;
    throw error;
  }
  return deepFreeze(record);
}

export function validateGraphExecutionRecord(record) {
  const problems = [];
  if (!isRecord(record)) return [{ code: 'invalid-record', path: '$', message: 'Execution record must be an object' }];
  if (record.format !== GRAPH_EXECUTION_FORMAT) problems.push(issue('invalid-format', 'format', 'Execution record format is invalid'));
  if (record.version !== GRAPH_EXECUTION_VERSION) problems.push(issue('invalid-version', 'version', 'Execution record version is unsupported'));
  if (!isStableId(record.id)) problems.push(issue('invalid-id', 'id', 'Execution record requires a stable id'));
  if (!isRecord(record.graph) || !isStableId(record.graph.id) || !isStableId(record.graph.revision)) {
    problems.push(issue('invalid-graph-ref', 'graph', 'Execution record requires graph identity and immutable revision'));
  }
  if (!GRAPH_EXECUTION_PROFILES.includes(record.profile)) problems.push(issue('invalid-profile', 'profile', 'Execution profile is unsupported'));
  if (!GRAPH_EXECUTION_STATUSES.includes(record.status)) problems.push(issue('invalid-status', 'status', 'Execution status is unsupported'));
  for (const key of ['inputs', 'outputs', 'nodeOutputs', 'diagnostics', 'provenance', 'readSet', 'artifacts']) {
    if (!isJsonValue(record[key])) problems.push(issue('invalid-json', key, `${key} must be JSON-compatible`));
  }
  if (!Array.isArray(record.diagnostics)) problems.push(issue('invalid-diagnostics', 'diagnostics', 'Diagnostics must be an array'));
  if (!isRecord(record.provenance) || !Array.isArray(record.provenance.nodes) || !Array.isArray(record.provenance.invocations)) {
    problems.push(issue('invalid-provenance', 'provenance', 'Provenance requires node and invocation arrays'));
  }
  if (!isRecord(record.readSet) || !['instances', 'relations', 'queries'].every(key => Array.isArray(record.readSet[key]))
    || (record.readSet.files !== undefined && !Array.isArray(record.readSet.files))) {
    problems.push(issue('invalid-read-set', 'readSet', 'Read set requires instances, relations, and queries arrays; files must be an array when present'));
  }
  for (const key of ['startedAt', 'completedAt']) {
    if (record[key] != null && (!Number.isFinite(Date.parse(record[key])))) {
      problems.push(issue('invalid-timestamp', key, `${key} must be an ISO-compatible timestamp`));
    }
  }
  if (record.startedAt && record.completedAt && Date.parse(record.completedAt) < Date.parse(record.startedAt)) {
    problems.push(issue('invalid-time-order', 'completedAt', 'Completion cannot precede start'));
  }
  return problems;
}

export function assertValidGraphExecutionRecord(record) {
  const problems = validateGraphExecutionRecord(record);
  if (problems.length) {
    const error = new Error(`Invalid graph execution record: ${problems.map(item => item.message).join('; ')}`);
    error.problems = problems;
    throw error;
  }
  return record;
}

function normalizeReadSet(source = {}) {
  const readSet = cloneJson(source || {});
  if (!Array.isArray(readSet.instances)) readSet.instances = [];
  if (!Array.isArray(readSet.relations)) readSet.relations = [];
  if (!Array.isArray(readSet.queries)) readSet.queries = [];
  if (!Array.isArray(readSet.files)) readSet.files = [];
  return readSet;
}

function isStableId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
}
function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null));
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
function issue(code, path, message) {
  return { code, path, message };
}
