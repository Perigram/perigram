import { STATUS_MAPPINGS } from './status-engine.js';
import { cncWorkflows } from '~/packages/domain-cnc/src/index.js';
import { getPrimaryState, getWorkflowRegions, normalizeWorkflow } from '~/packages/workflows/src/index.js';

export function getWorkflowStatusActions({
  typeId,
  state,
  workflows = cncWorkflows,
  mappings = STATUS_MAPPINGS,
  t = value => value
} = {}) {
  const workflow = workflowForTypeId(typeId, workflows);
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

export function hasWorkflow(typeId, workflows = cncWorkflows) {
  return Boolean(workflowForTypeId(typeId, workflows));
}

export function workflowStateCount(typeId, workflows = cncWorkflows) {
  const workflow = workflowForTypeId(typeId, workflows);
  if (!workflow) return 0;
  const states = Object.values(getWorkflowRegions(normalizeWorkflow(workflow)))
    .flatMap(region => Object.keys(region.states || {}));
  return new Set(states).size;
}

export function hasMeaningfulWorkflowStatus(typeId, workflows = cncWorkflows) {
  return workflowStateCount(typeId, workflows) !== 1;
}

function workflowForTypeId(typeId, workflows = {}) {
  if (workflows?.[typeId]) return workflows[typeId];
  const normalizedType = normalizeTypeId(typeId);
  const key = Object.keys(workflows || {}).find(candidate => normalizeTypeId(candidate) === normalizedType);
  return key ? workflows[key] : null;
}

function normalizeTypeId(value) {
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
