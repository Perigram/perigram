import { cncEntities, cncHookContracts } from '../packages/domain-cnc/src/index.js';
import { validateTransition } from '../packages/workflows/src/index.js';
import { validateDomainDraft } from './domain-builder.js';

export function compileWorkflowDraft({ entities = cncEntities, workflows = {}, hookContracts = cncHookContracts } = {}) {
  const draft = {
    entities,
    workflows,
    hookContracts,
    frontendEntities: [],
    summaries: [],
    serviceContracts: {},
    serviceActions: {}
  };
  const validation = validateDomainDraft(draft);
  const machineIssues = [];
  const machines = {};

  for (const [entityType, workflow] of Object.entries(workflows || {})) {
    if (!workflow?.initial || !workflow?.states || !Array.isArray(workflow.transitions)) continue;
    machines[entityType] = toPlainObject(workflow);
    const initialValidation = validateTransition({
      workflow,
      currentState: workflow.initial,
      targetState: workflow.initial
    });
    if (!initialValidation.ok && !workflow.states?.[workflow.initial]?.canUpdateMeta) {
      machineIssues.push({
        area: 'workflows',
        severity: 'warning',
        message: `${entityType} initial state ${workflow.initial} has no self-loop metadata transition`
      });
    }
  }

  const issues = [...validation.issues, ...machineIssues.filter(issue => issue.severity === 'error')];
  const warnings = [...validation.warnings, ...machineIssues.filter(issue => issue.severity !== 'error')];

  return {
    ok: issues.length === 0,
    machines,
    states: Object.fromEntries(Object.entries(machines).map(([type, workflow]) => [type, Object.keys(workflow.states || {})])),
    issues,
    warnings
  };
}

export function workflowInitialState(workflows = {}, entityType, fallback = 'DRAFT') {
  return workflows?.[entityType]?.initial || fallback;
}

export function workflowStateExists(workflows = {}, entityType, state) {
  if (!state) return false;
  return Boolean(workflows?.[entityType]?.states?.[state]);
}

export function collectWorkflowAccess(workflows = {}) {
  const permissions = {};
  for (const workflow of Object.values(workflows || {})) {
    for (const transition of workflow.transitions || []) {
      for (const requirement of transition.access?.permissions || []) {
        const current = permissions[requirement.feature];
        permissions[requirement.feature] = strongestAccess(current, requirement.level || 'read');
      }
    }
  }
  return permissions;
}

export function collectServiceActionAccess(actions = []) {
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
