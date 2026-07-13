export const DOMAIN_BUILDER_STORAGE_KEY = 'cutkit:domain-builder:v1';

export const CANONICAL_BLOCKS = [
  'identity',
  'lineage',
  'relations',
  'origin',
  'status',
  'specs',
  'attachments',
  'data',
  'summary'
];

export const TYPED_FIELD_TYPES = new Set(['string', 'number', 'boolean', 'enum', 'entityId', 'entityType', 'workflowState', 'attachment', 'array', 'object']);

export function createDomainDraft({ entities = [], frontendEntities = [], workflows = {}, summaries = [], serviceContracts = {}, commands = {}, hookContracts = {} } = {}) {
  const normalizedCommands = commands && typeof commands === 'object' ? commands : {};
  return deepClone({
    entities,
    frontendEntities,
    workflows,
    summaries,
    serviceContracts,
    commands: normalizedCommands,
    hookContracts
  });
}

export function validateDomainDraft(draft = {}) {
  const issues = [];
  const warnings = [];
  const entities = Array.isArray(draft.entities) ? draft.entities : [];
  const frontendEntities = Array.isArray(draft.frontendEntities) ? draft.frontendEntities : [];
  const summaries = Array.isArray(draft.summaries) ? draft.summaries : [];
  const serviceContracts = draft.serviceContracts && typeof draft.serviceContracts === 'object' ? draft.serviceContracts : {};
  const commands = draft.commands && typeof draft.commands === 'object' ? draft.commands : {};
  const hookContracts = draft.hookContracts && typeof draft.hookContracts === 'object' ? draft.hookContracts : {};
  const workflows = draft.workflows && typeof draft.workflows === 'object' ? draft.workflows : {};
  const entityTypes = new Set();
  const collections = new Set();
  const blockSet = new Set(CANONICAL_BLOCKS);

  for (const [index, entity] of entities.entries()) {
    if (!entity?.type) issues.push({ area: 'entities', severity: 'error', message: `Entity #${index + 1} is missing type` });
    if (!entity?.collection) issues.push({ area: 'entities', severity: 'error', message: `${entity?.type || `Entity #${index + 1}`} is missing collection` });
    if (entity?.type && entityTypes.has(entity.type)) issues.push({ area: 'entities', severity: 'error', message: `Duplicate entity type: ${entity.type}` });
    if (entity?.collection && collections.has(entity.collection)) issues.push({ area: 'entities', severity: 'error', message: `Duplicate collection: ${entity.collection}` });
    if (entity?.type) entityTypes.add(entity.type);
    if (entity?.collection) collections.add(entity.collection);

    for (const block of entity.blocks || []) {
      if (!blockSet.has(block)) issues.push({ area: 'entities', severity: 'error', message: `${entity.type} uses unknown block: ${block}` });
    }
  }

  for (const route of frontendEntities) {
    const target = entities.find(entity => normalizeCollection(entity.collection) === normalizeCollection(route.collection));
    if (!target) {
      issues.push({ area: 'routes', severity: 'error', message: `${route.type || route.collection} route references unknown collection: ${route.collection}` });
    }
    if (!route.routes?.single || !route.routes?.list) {
      issues.push({ area: 'routes', severity: 'error', message: `${route.type || route.collection} route must define single and list paths` });
    }
  }

  for (const [type, workflow] of Object.entries(workflows)) {
    if (!entityTypes.has(type)) issues.push({ area: 'workflows', severity: 'error', message: `Workflow references unknown entity type: ${type}` });
    const regions = workflowRegions(workflow);
    if (Object.keys(regions).length === 0) issues.push({ area: 'workflows', severity: 'error', message: `${type} workflow has no regions` });

    for (const [regionId, region] of Object.entries(regions)) {
      const labelPrefix = `${type}.${regionId}`;
      const states = region?.states && typeof region.states === 'object' ? Object.keys(region.states) : [];
      const stateSet = new Set(states);
      if (!region?.initial) issues.push({ area: 'workflows', severity: 'error', message: `${labelPrefix} workflow is missing initial state` });
      if (region?.initial && !stateSet.has(region.initial)) issues.push({ area: 'workflows', severity: 'error', message: `${labelPrefix} initial state does not exist: ${region.initial}` });
      if (states.length === 0) issues.push({ area: 'workflows', severity: 'error', message: `${labelPrefix} workflow has no states` });
      if (!Array.isArray(region?.transitions)) issues.push({ area: 'workflows', severity: 'error', message: `${labelPrefix} workflow transitions must be an array` });

      for (const [index, transition] of (region?.transitions || []).entries()) {
        const label = `${labelPrefix} transition #${index + 1}`;
        if (!stateSet.has(transition.from)) issues.push({ area: 'workflows', severity: 'error', message: `${label} has unknown from state: ${transition.from}` });
        if (!stateSet.has(transition.to)) issues.push({ area: 'workflows', severity: 'error', message: `${label} has unknown to state: ${transition.to}` });
        if (transition.roles) {
          issues.push({ area: 'workflows', severity: 'error', message: `${label} uses legacy roles; use access.permissions` });
        }
        if (!transition.access?.system && !Array.isArray(transition.access?.permissions)) {
          issues.push({ area: 'workflows', severity: 'error', message: `${label} must define access.permissions or access.system` });
        }
        if (transition.display && !['inline', 'menu', 'hidden'].includes(transition.display)) {
          issues.push({ area: 'workflows', severity: 'error', message: `${label} has invalid display: ${transition.display}` });
        }
        for (const hook of transition.hooks || []) {
          if (!hook?.handler) issues.push({ area: 'workflows', severity: 'error', message: `${label} has a hook without handler` });
          else if (!hookContracts[hook.handler]) issues.push({ area: 'workflows', severity: 'error', message: `${label} references unknown hook contract: ${hook.handler}` });
          else validateSettingsObject({
            issues,
            area: 'workflows',
            label: `${label} ${hook.handler} params`,
            fields: hookContracts[hook.handler].parameters || [],
            value: hook.params || {}
          });
        }
      }

      for (const [state, definition] of Object.entries(region?.states || {})) {
        const lifecycle = definition?.lifecycle;
        if (!lifecycle) continue;
        const allowedKeys = new Set(['actors', 'attachments', 'data']);
        for (const key of Object.keys(lifecycle)) {
          if (!allowedKeys.has(key)) issues.push({ area: 'workflows', severity: 'error', message: `${labelPrefix}.${state} lifecycle uses unknown key: ${key}` });
        }
        if (lifecycle.actors && !Array.isArray(lifecycle.actors)) {
          issues.push({ area: 'workflows', severity: 'error', message: `${labelPrefix}.${state} lifecycle actors must be an array` });
        }
        if (lifecycle.attachments && typeof lifecycle.attachments !== 'object') {
          issues.push({ area: 'workflows', severity: 'error', message: `${labelPrefix}.${state} lifecycle attachments must be an object` });
        }
        if (lifecycle.data !== undefined && lifecycle.data !== true) {
          issues.push({ area: 'workflows', severity: 'error', message: `${labelPrefix}.${state} lifecycle data must be true when present` });
        }
      }
    }
  }

  for (const [index, summary] of summaries.entries()) {
    const label = `Summary #${index + 1}`;
    if (!entityTypes.has(summary.sourceType)) issues.push({ area: 'summaries', severity: 'error', message: `${label} has unknown source type: ${summary.sourceType}` });
    if (!entityTypes.has(summary.targetType)) issues.push({ area: 'summaries', severity: 'error', message: `${label} has unknown target type: ${summary.targetType}` });
    if (!summary.targetIdKey) issues.push({ area: 'summaries', severity: 'error', message: `${label} is missing targetIdKey` });
    if (!summary.countField) issues.push({ area: 'summaries', severity: 'error', message: `${label} is missing countField` });
    if (summary.sumFields && (typeof summary.sumFields !== 'object' || Array.isArray(summary.sumFields))) {
      issues.push({ area: 'summaries', severity: 'error', message: `${label} sumFields must be an object` });
    }
  }

  for (const [service, contract] of Object.entries(serviceContracts)) {
    if (contract.service && contract.service !== service) issues.push({ area: 'services', severity: 'error', message: `${service} service id mismatch: ${contract.service}` });
    if (!Array.isArray(contract.actions)) issues.push({ area: 'services', severity: 'error', message: `${service} must define actions` });
    if (!Array.isArray(contract.triggers)) issues.push({ area: 'services', severity: 'error', message: `${service} must define triggers` });
  }

  for (const [id, action] of Object.entries(commands)) {
    if (action.id && action.id !== id) issues.push({ area: 'commands', severity: 'error', message: `${id} command id mismatch: ${action.id}` });
    if (!action.service) issues.push({ area: 'commands', severity: 'error', message: `${id} must define service` });
    if (!action.action) issues.push({ area: 'commands', severity: 'error', message: `${id} must define action` });
    if (action.service && !serviceContracts[action.service]) issues.push({ area: 'commands', severity: 'error', message: `${id} references unknown service: ${action.service}` });
    for (const input of action.input?.entities || []) {
      if (!entityTypes.has(input.type)) issues.push({ area: 'commands', severity: 'error', message: `${id} input references unknown entity type: ${input.type}` });
    }
    for (const output of action.output?.entities || []) {
      if (!entityTypes.has(output)) issues.push({ area: 'commands', severity: 'error', message: `${id} output references unknown entity type: ${output}` });
    }
    if (!Array.isArray(action.access?.permissions)) {
      issues.push({ area: 'commands', severity: 'error', message: `${id} must define access.permissions` });
    }
    validateFieldDescriptors({
      issues,
      area: 'commands',
      label: `${id} parameters`,
      fields: action.input?.parameters || []
    });
  }

  for (const [id, contract] of Object.entries(hookContracts)) {
    if (contract.id && contract.id !== id) issues.push({ area: 'hooks', severity: 'error', message: `${id} hook id mismatch: ${contract.id}` });
    validateFieldDescriptors({
      issues,
      area: 'hooks',
      label: `${id} parameters`,
      fields: contract.parameters || []
    });
  }

  for (const type of entityTypes) {
    if (!workflows[type]) warnings.push({ area: 'workflows', severity: 'warning', message: `${type} has no workflow` });
  }

  return {
    ok: issues.length === 0,
    issues,
    warnings
  };
}

export function buildWorkflowGraph(workflow = {}, regionId = null) {
  const region = workflowRegion(workflow, regionId);
  const states = Object.keys(region.states || {});
  const nodeWidth = 148;
  const nodeHeight = 44;
  const gapX = 112;
  const gapY = 86;
  const ranks = rankStates(states, region);
  const rowsByRank = states.reduce((acc, state) => {
    const rank = ranks.get(state) || 0;
    acc.set(rank, [...(acc.get(rank) || []), state]);
    return acc;
  }, new Map());
  const nodes = states.map((state, index) => {
    const rank = ranks.get(state) || 0;
    const row = (rowsByRank.get(rank) || []).indexOf(state);
    return {
      id: state,
      x: 24 + rank * (nodeWidth + gapX),
      y: 24 + row * (nodeHeight + gapY),
      width: nodeWidth,
      height: nodeHeight,
      initial: state === region.initial,
      terminal: Boolean(region.states?.[state]?.isTerminal)
    };
  });
  const byId = new Map(nodes.map(node => [node.id, node]));
  const edges = (region.transitions || [])
    .filter(transition => byId.has(transition.from) && byId.has(transition.to))
    .map((transition, index, transitions) => {
      const sameDirectionIndex = transitions
        .slice(0, index)
        .filter(item => item.from === transition.from && item.to === transition.to)
        .length;
      const reciprocal = transition.from !== transition.to
        && transitions.some(item => item.from === transition.to && item.to === transition.from);

      return {
        id: `${transition.from}-${transition.to}-${index}`,
        index,
        from: transition.from,
        to: transition.to,
        x1: byId.get(transition.from).x + nodeWidth,
        y1: byId.get(transition.from).y + nodeHeight / 2,
        x2: byId.get(transition.to).x,
        y2: byId.get(transition.to).y + nodeHeight / 2,
        reciprocal,
        sameDirectionIndex,
        reverse: (ranks.get(transition.from) || 0) >= (ranks.get(transition.to) || 0),
        self: transition.from === transition.to
      };
    });
  const columnCount = Math.max(1, ...ranks.values()) + 1;
  const rowCount = Math.max(1, ...Array.from(rowsByRank.values()).map(rows => rows.length));
  const width = Math.max(420, 48 + columnCount * nodeWidth + Math.max(columnCount - 1, 0) * gapX);
  const height = Math.max(220, 72 + rowCount * nodeHeight + Math.max(rowCount - 1, 0) * gapY);

  return { nodes, edges, width, height };
}

function rankStates(states, workflow) {
  const stateSet = new Set(states);
  const ranks = new Map();
  const initial = stateSet.has(workflow.initial) ? workflow.initial : states[0];
  if (!initial) return ranks;

  ranks.set(initial, 0);
  const queue = [initial];
  while (queue.length) {
    const from = queue.shift();
    const fromRank = ranks.get(from) || 0;
    for (const transition of workflow.transitions || []) {
      if (transition.from !== from || !stateSet.has(transition.to) || transition.from === transition.to || ranks.has(transition.to)) continue;
      ranks.set(transition.to, fromRank + 1);
      queue.push(transition.to);
    }
  }

  for (const [index, state] of states.entries()) {
    if (!ranks.has(state)) ranks.set(state, index);
  }
  return ranks;
}

function workflowRegions(workflow = {}) {
  if (workflow?.regions && typeof workflow.regions === 'object') return workflow.regions;
  if (workflow?.states || workflow?.transitions || workflow?.initial) {
    return {
      main: {
        initial: workflow.initial,
        states: workflow.states || {},
        transitions: workflow.transitions || []
      }
    };
  }
  return {};
}

function workflowRegion(workflow = {}, regionId = null) {
  const regions = workflowRegions(workflow);
  const id = regionId || workflow.primaryRegion || (regions.main ? 'main' : Object.keys(regions)[0]);
  return regions[id] || { initial: '', states: {}, transitions: [] };
}

export function generateDomainCncSource(draft = {}) {
  const normalized = createDomainDraft(draft);
  return [
    `export const cncEntities = ${formatExport(normalized.entities)};`,
    '',
    `export const cncWorkflows = ${formatExport(normalized.workflows)};`,
    '',
    `export const cncSummaries = ${formatExport(normalized.summaries)};`,
    '',
    `export const cncServiceContracts = ${formatExport(normalized.serviceContracts)};`,
    '',
    `export const cncCommands = ${formatExport(normalized.commands)};`,
    '',
    `export const cncHookContracts = ${formatExport(normalized.hookContracts)};`,
    '',
    `export const cncFrontendEntities = ${formatExport(normalized.frontendEntities)};`,
    ''
  ].join('\n');
}

export function parseCommaList(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

export function stringifyCommaList(value) {
  return Array.isArray(value) ? value.join(', ') : '';
}

export function parseJsonObject(value, fallback = {}) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function formatExport(value) {
  return JSON.stringify(value, null, 2)
    .replace(/"([^"]+)":/g, '$1:')
    .replace(/"/g, "'");
}

function normalizeCollection(collection) {
  return String(collection || '').replace(/-/g, '_');
}

function validateFieldDescriptors({ issues, area, label, fields }) {
  if (!Array.isArray(fields)) {
    issues.push({ area, severity: 'error', message: `${label} must be an array` });
    return;
  }
  const seen = new Set();
  for (const [index, field] of fields.entries()) {
    const fieldLabel = `${label} field #${index + 1}`;
    if (!field?.name) issues.push({ area, severity: 'error', message: `${fieldLabel} is missing name` });
    if (field?.name && seen.has(field.name)) issues.push({ area, severity: 'error', message: `${label} has duplicate field: ${field.name}` });
    if (field?.name) seen.add(field.name);
    if (!TYPED_FIELD_TYPES.has(field?.type)) issues.push({ area, severity: 'error', message: `${fieldLabel} has invalid type: ${field?.type}` });
    if (field?.type === 'enum' && !Array.isArray(field.options)) issues.push({ area, severity: 'error', message: `${fieldLabel} enum must define options` });
    if (field?.display && !['default', 'debug', 'hidden'].includes(field.display)) issues.push({ area, severity: 'error', message: `${fieldLabel} has invalid display: ${field.display}` });
  }
}

function validateSettingsObject({ issues, area, label, fields, value }) {
  const object = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  validateFieldDescriptors({ issues, area, label, fields });
  const fieldMap = new Map((fields || []).map(field => [field.name, field]));
  for (const field of fields || []) {
    if (field.required && (object[field.name] === undefined || object[field.name] === null || object[field.name] === '')) {
      issues.push({ area, severity: 'error', message: `${label} missing required field: ${field.name}` });
    }
  }
  for (const key of Object.keys(object)) {
    if (!fieldMap.has(key)) issues.push({ area, severity: 'error', message: `${label} has unknown field: ${key}` });
  }
}
