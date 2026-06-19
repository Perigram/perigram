import { cncEntities, cncHookContracts } from '../packages/domain-cnc/src/index.js';
import { getWorkflowRegions, normalizeWorkflow, validateTransition } from '../packages/workflows/src/index.js';
import { validateDomainDraft } from './domain-builder.js';

export function compileWorkflowDraft({ entities = cncEntities, workflows = {}, hookContracts = cncHookContracts } = {}) {
  const entityDefinitions = Array.isArray(entities) && entities.length > 0 ? entities : cncEntities;
  const hookDefinitions = hookContracts && Object.keys(hookContracts).length > 0 ? hookContracts : cncHookContracts;
  const draft = {
    entities: entityDefinitions,
    workflows,
    hookContracts: hookDefinitions,
    frontendEntities: [],
    summaries: [],
    serviceContracts: {},
    commands: {}
  };
  const validation = validateDomainDraft(draft);
  const machineIssues = [];
  const machines = {};

  for (const [entityType, workflow] of Object.entries(workflows || {})) {
    const normalized = normalizeWorkflowSafe(workflow);
    if (!normalized) continue;
    machines[entityType] = toPlainObject(normalized);
    const initialValidation = validateTransition({
      workflow: normalized,
      currentState: normalized.initial,
      targetState: normalized.initial
    });
    if (!initialValidation.ok && !normalized.states?.[normalized.initial]?.canUpdateMeta) {
      machineIssues.push({
        area: 'workflows',
        severity: 'warning',
        message: `${entityType} initial state ${normalized.initial} has no self-loop metadata transition`
      });
    }
  }

  const issues = [...validation.issues, ...machineIssues.filter(issue => issue.severity === 'error')];
  const warnings = [...validation.warnings, ...machineIssues.filter(issue => issue.severity !== 'error')];

  return {
    ok: issues.length === 0,
    machines,
    states: Object.fromEntries(Object.entries(machines).map(([type, workflow]) => [type, workflowStateNames(workflow)])),
    issues,
    warnings
  };
}

export function workflowInitialState(workflows = {}, entityType, fallback = 'DRAFT') {
  return normalizeWorkflowSafe(workflows?.[entityType])?.initial || fallback;
}

export function workflowStateExists(workflows = {}, entityType, state) {
  if (!state) return false;
  return workflowStateNames(workflows?.[entityType]).includes(state);
}

export function collectWorkflowAccess(workflows = {}) {
  const permissions = {};
  for (const workflow of Object.values(workflows || {})) {
    const transitions = Object.values(getWorkflowRegionsSafe(workflow))
      .flatMap(region => region.transitions || []);
    for (const transition of transitions) {
      for (const requirement of transition.access?.permissions || []) {
        const current = permissions[requirement.feature];
        permissions[requirement.feature] = strongestAccess(current, requirement.level || 'read');
      }
    }
  }
  return permissions;
}

export function collectCommandAccess(actions = []) {
  const permissions = {};
  for (const action of actions || []) {
    for (const requirement of action.access?.permissions || []) {
      const current = permissions[requirement.feature];
      permissions[requirement.feature] = strongestAccess(current, requirement.level || 'read');
    }
  }
  return permissions;
}

function strongestAccess(left = 'none', right = 'none') {
  const levels = ['none', 'read', 'write', 'admin'];
  return levels.indexOf(right) > levels.indexOf(left) ? right : left;
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeWorkflowSafe(workflow) {
  try {
    return workflow ? normalizeWorkflow(workflow) : null;
  } catch {
    return null;
  }
}

function getWorkflowRegionsSafe(workflow) {
  try {
    return workflow ? getWorkflowRegions(workflow) : {};
  } catch {
    return {};
  }
}

function workflowStateNames(workflow) {
  const regions = getWorkflowRegionsSafe(workflow);
  return [...new Set(Object.values(regions).flatMap(region => Object.keys(region.states || {})))];
}
