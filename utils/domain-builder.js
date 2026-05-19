export const DOMAIN_BUILDER_STORAGE_KEY = 'cutkit:domain-builder:v1';

export const CANONICAL_BLOCKS = [
  'identity',
  'lineage',
  'origin',
  'status',
  'specs',
  'attachments',
  'data',
  'summary'
];

export function createDomainDraft({ entities = [], frontendEntities = [], workflows = {}, summaries = [] } = {}) {
  return deepClone({
    entities,
    frontendEntities,
    workflows,
    summaries
  });
}

export function validateDomainDraft(draft = {}) {
  const issues = [];
  const warnings = [];
  const entities = Array.isArray(draft.entities) ? draft.entities : [];
  const frontendEntities = Array.isArray(draft.frontendEntities) ? draft.frontendEntities : [];
  const summaries = Array.isArray(draft.summaries) ? draft.summaries : [];
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
    const states = workflow?.states && typeof workflow.states === 'object' ? Object.keys(workflow.states) : [];
    const stateSet = new Set(states);
    if (!workflow?.initial) issues.push({ area: 'workflows', severity: 'error', message: `${type} workflow is missing initial state` });
    if (workflow?.initial && !stateSet.has(workflow.initial)) issues.push({ area: 'workflows', severity: 'error', message: `${type} initial state does not exist: ${workflow.initial}` });
    if (states.length === 0) issues.push({ area: 'workflows', severity: 'error', message: `${type} workflow has no states` });
    if (!Array.isArray(workflow?.transitions)) issues.push({ area: 'workflows', severity: 'error', message: `${type} workflow transitions must be an array` });

    for (const [index, transition] of (workflow?.transitions || []).entries()) {
      const label = `${type} transition #${index + 1}`;
      if (!stateSet.has(transition.from)) issues.push({ area: 'workflows', severity: 'error', message: `${label} has unknown from state: ${transition.from}` });
      if (!stateSet.has(transition.to)) issues.push({ area: 'workflows', severity: 'error', message: `${label} has unknown to state: ${transition.to}` });
      if (!Array.isArray(transition.roles) || transition.roles.length === 0) {
        issues.push({ area: 'workflows', severity: 'error', message: `${label} must define at least one role` });
      }
      for (const hook of transition.hooks || []) {
        if (!hook?.handler) issues.push({ area: 'workflows', severity: 'error', message: `${label} has a hook without handler` });
      }
    }

    for (const [state, definition] of Object.entries(workflow?.states || {})) {
      const lifecycle = definition?.lifecycle;
      if (!lifecycle) continue;
      const allowedKeys = new Set(['actors', 'attachments', 'data']);
      for (const key of Object.keys(lifecycle)) {
        if (!allowedKeys.has(key)) issues.push({ area: 'workflows', severity: 'error', message: `${type}.${state} lifecycle uses unknown key: ${key}` });
      }
      if (lifecycle.actors && !Array.isArray(lifecycle.actors)) {
        issues.push({ area: 'workflows', severity: 'error', message: `${type}.${state} lifecycle actors must be an array` });
      }
      if (lifecycle.attachments && typeof lifecycle.attachments !== 'object') {
        issues.push({ area: 'workflows', severity: 'error', message: `${type}.${state} lifecycle attachments must be an object` });
      }
      if (lifecycle.data !== undefined && lifecycle.data !== true) {
        issues.push({ area: 'workflows', severity: 'error', message: `${type}.${state} lifecycle data must be true when present` });
      }
    }
  }

  for (const [index, summary] of summaries.entries()) {
    const label = `Summary #${index + 1}`;
    if (!entityTypes.has(summary.entityType)) issues.push({ area: 'summaries', severity: 'error', message: `${label} has unknown entity type: ${summary.entityType}` });
    if (!entityTypes.has(summary.parentType)) issues.push({ area: 'summaries', severity: 'error', message: `${label} has unknown parent type: ${summary.parentType}` });
    if (!summary.parentIdKey) issues.push({ area: 'summaries', severity: 'error', message: `${label} is missing parentIdKey` });
    if (!summary.countField) issues.push({ area: 'summaries', severity: 'error', message: `${label} is missing countField` });
    if (summary.sumFields && (typeof summary.sumFields !== 'object' || Array.isArray(summary.sumFields))) {
      issues.push({ area: 'summaries', severity: 'error', message: `${label} sumFields must be an object` });
    }
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

export function buildWorkflowGraph(workflow = {}) {
  const states = Object.keys(workflow.states || {});
  const nodeWidth = 148;
  const nodeHeight = 44;
  const gapX = 112;
  const gapY = 86;
  const ranks = rankStates(states, workflow);
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
      initial: state === workflow.initial,
      terminal: Boolean(workflow.states?.[state]?.isTerminal)
    };
  });
  const byId = new Map(nodes.map(node => [node.id, node]));
  const edges = (workflow.transitions || [])
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

export function generateDomainCncSource(draft = {}) {
  const normalized = createDomainDraft(draft);
  return [
    `export const cncEntities = ${formatExport(normalized.entities)};`,
    '',
    `export const cncWorkflows = ${formatExport(normalized.workflows)};`,
    '',
    `export const cncSummaries = ${formatExport(normalized.summaries)};`,
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
