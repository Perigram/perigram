import { STATUS_MAPPINGS } from './status-engine.js';
import { cncWorkflows } from '~/packages/domain-cnc/src/index.js';
import { getPrimaryState, getWorkflowRegions, normalizeWorkflow } from '~/packages/workflows/src/index.js';

export function getWorkflowStatusActions({
  entityType,
  state,
  workflows = cncWorkflows,
  mappings = STATUS_MAPPINGS,
  t = value => value
} = {}) {
  const workflow = workflowForEntityType(entityType, workflows);
  if (!workflow || !state) return [];
  const normalized = normalizeWorkflow(workflow);
  const currentPrimary = getPrimaryState(state, state);

  return Object.entries(getWorkflowRegions(normalized))
    .flatMap(([regionId, region]) => (region.transitions || [])
      .filter(transition => transition.from === resolveRegionState(state, regionId, currentPrimary, region.initial))
      .map(transition => ({
        ...transition,
        region: regionId,
        path: region.states?.[transition.to]?.path || [transition.to],
        lifecycle: transition.lifecycle || region.states?.[transition.to]?.lifecycle || null
      })))
    .filter(transition => resolveActionDisplay(transition) !== 'hidden')
    .map(transition => createStatusAction(transition, mappings, t));
}

export function hasWorkflow(entityType, workflows = cncWorkflows) {
  return Boolean(workflowForEntityType(entityType, workflows));
}

export function workflowStateCount(entityType, workflows = cncWorkflows) {
  const workflow = workflowForEntityType(entityType, workflows);
  if (!workflow) return 0;
  const states = Object.values(getWorkflowRegions(normalizeWorkflow(workflow)))
    .flatMap(region => Object.keys(region.states || {}));
  return new Set(states).size;
}

export function hasMeaningfulWorkflowStatus(entityType, workflows = cncWorkflows) {
  return workflowStateCount(entityType, workflows) !== 1;
}

function workflowForEntityType(entityType, workflows = {}) {
  if (workflows?.[entityType]) return workflows[entityType];
  const normalizedType = normalizeEntityType(entityType);
  const key = Object.keys(workflows || {}).find(candidate => normalizeEntityType(candidate) === normalizedType);
  return key ? workflows[key] : null;
}

function normalizeEntityType(value) {
  return String(value || '').replace(/[_-]/g, '').toLowerCase();
}

export function resolveActionDisplay(transition = {}) {
  if (transition.display === false || transition.displayBtn === false) return 'hidden';
  if (transition.display === 'hidden' || transition.display === 'menu' || transition.display === 'inline') return transition.display;
  if (transition.displayBtn === true) return 'inline';
  if (transition.from && transition.from === transition.to) return 'hidden';
  return 'inline';
}

export function createStatusAction(transition = {}, mappings = STATUS_MAPPINGS, t = value => value) {
  const mapping = mappings[transition.to] || mappings[String(transition.to).toLowerCase()] || {};
  return {
    label: transition.label || translateStatusLabel(transition.to, mapping.label, t),
    to: transition.to,
    region: transition.region || 'main',
    path: transition.path || [transition.to],
    intent: transition.intent || null,
    severity: mapping.severity || 'secondary',
    icon: mapping.icon || 'pi pi-arrow-right',
    display: resolveActionDisplay(transition),
    lifecycle: transition.lifecycle || null
  };
}

function resolveRegionState(state, regionId, primary, fallback) {
  if (state && typeof state === 'object') {
    return state.active?.[regionId] || state.regions?.[regionId]?.state || (regionId === 'main' ? primary : fallback);
  }
  return regionId === 'main' ? primary : fallback;
}

function translateStatusLabel(state, labelKey, t) {
  if (labelKey) {
    const translated = t(labelKey);
    if (translated && translated !== labelKey) return translated;
  }

  return String(state)
    .replace(/[_-]/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, char => char.toUpperCase());
}
