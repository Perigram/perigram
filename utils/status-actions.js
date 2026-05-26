import { STATUS_MAPPINGS } from './status-engine.js';
import { cncWorkflows } from '~/packages/domain-cnc/src/index.js';

export function getWorkflowStatusActions({
  entityType,
  state,
  workflows = cncWorkflows,
  mappings = STATUS_MAPPINGS,
  t = value => value
} = {}) {
  const workflow = workflows[entityType];
  if (!workflow || !state) return [];

  return (workflow.transitions || [])
    .filter(transition => transition.from === state)
    .filter(transition => resolveActionDisplay(transition) !== 'hidden')
    .map(transition => createStatusAction(transition, mappings, t));
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
    label: translateStatusLabel(transition.to, mapping.label, t),
    to: transition.to,
    severity: mapping.severity || 'secondary',
    icon: mapping.icon || 'pi pi-arrow-right',
    display: resolveActionDisplay(transition)
  };
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
