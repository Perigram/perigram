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
  const workflow = workflows[entityType];
  if (!workflow || !state) return [];
  const normalized = normalizeWorkflow(workflow);
  const currentPrimary = getPrimaryState(state, state);

  return Object.entries(getWorkflowRegions(normalized))
    .flatMap(([regionId, region]) => (region.transitions || [])
      .filter(transition => transition.from === resolveRegionState(state, regionId, currentPrimary, region.initial))
      .map(transition => ({ ...transition, region: regionId, path: region.states?.[transition.to]?.path || [transition.to] })))
    .filter(transition => resolveActionDisplay(transition) !== 'hidden')
    .map(transition => createStatusAction(transition, mappings, t));
}

export function hasWorkflow(entityType, workflows = cncWorkflows) {
  return Boolean(workflows?.[entityType]);
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
    display: resolveActionDisplay(transition)
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
