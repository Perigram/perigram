export function createCommandResult({
  commandId,
  ok = true,
  entities = [],
  attachments = [],
  tasks = [],
  transitions = [],
  events = [],
  effects = [],
  data = {},
  raw = null,
  error = null
} = {}) {
  if (!commandId) throw new Error('CommandResult requires commandId');
  return { ok, commandId, entities, attachments, tasks, transitions, events, effects, data, raw, error };
}

const ENTITY_OUTPUT_OWNERS = new Set(['commandOwned', 'graphOwned']);
const ENTITY_OUTPUT_TIMINGS = new Set(['immediate', 'completion']);

export function normalizeEntityOutputContracts(output = {}) {
  const declared = Array.isArray(output?.entities) ? output.entities : [];
  return declared.map(entry => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Declared entity output ${JSON.stringify(entry)} must be a { type, persistenceOwner, timing } record`);
    }
    if (!entry.type) throw new Error('Declared entity output requires type');
    if (!ENTITY_OUTPUT_OWNERS.has(entry.persistenceOwner)) {
      throw new Error(`Declared entity output ${entry.type} requires persistenceOwner 'commandOwned' or 'graphOwned'`);
    }
    if (!ENTITY_OUTPUT_TIMINGS.has(entry.timing)) {
      throw new Error(`Declared entity output ${entry.type} requires timing 'immediate' or 'completion'`);
    }
    return { type: entry.type, persistenceOwner: entry.persistenceOwner, timing: entry.timing };
  });
}

export function validateResultEntityOutputs({ contracts = [], entities = [], phase = 'immediate' } = {}) {
  const byType = new Map(contracts.map(contract => [contract.type, contract]));
  const violations = [];
  for (const entry of entities || []) {
    const type = String(entry?.type || '');
    const contract = byType.get(type);
    if (!contract) {
      violations.push(`Result carries undeclared entity output ${type || '<missing type>'}`);
      continue;
    }
    if (phase === 'immediate' && contract.timing === 'completion') {
      violations.push(`Entity output ${type} is completion-timed and cannot populate an immediate result`);
    }
    if (contract.persistenceOwner === 'commandOwned' && !entry.id) {
      violations.push(`Command-owned entity output ${type} must return a persisted entity reference`);
    }
    if (contract.persistenceOwner === 'graphOwned' && entry.id) {
      violations.push(`Graph-owned entity output ${type} must not return a persisted entity; route raw construction data to an explicit persistence node`);
    }
  }
  return violations;
}

export function createTaskResult({
  taskId,
  ok = true,
  entities = [],
  attachments = [],
  tasks = [],
  events = [],
  effects = [],
  data = {},
  raw = null,
  error = null
} = {}) {
  if (!taskId) throw new Error('TaskResult requires taskId');
  return { ok, taskId, entities, attachments, tasks, events, effects, data, raw, error };
}

