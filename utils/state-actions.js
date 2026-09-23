import { cncWorkflows } from '~/packages/domain-cnc/src/index.js';
import { getPrimaryState, getWorkflowRegions, normalizeWorkflow } from '~/packages/workflows/src/index.js';
import { resolveStateDisplay } from './state-engine.js';

// Workflow source order: the compiled contract first — a served bundle
// type record (its `states` facet + `transitions`) converts into the same
// v2 machine shape the workflow machinery consumes — then the committed
// `@cutkit/domain-cnc` machines as the verified-live fallback for
// undeclared legacy types (cassette, cassette_design, artifact,
// artifact_template, entity_revision, process_definition), which the
// server status core still resolves as default workflows. Live app
// transition actions come from the status API (`/api/state/actions`),
// which applies the process-compiled workflow server-side; these helpers
// drive development surfaces with local workflow drafts and the
// chrome-visibility questions shared primitives ask.
export function compiledWorkflowFor(typeRecord = null) {
  const axis = typeRecord?.states?.main;
  if (!axis || !Array.isArray(axis.values) || !axis.values.length) return null;
  const states = Object.fromEntries(axis.values.map(value => [value, {}]));
  return {
    schemaVersion: 2,
    primaryRegion: 'main',
    regions: {
      main: {
        initial: axis.initial,
        states,
        transitions: (Array.isArray(typeRecord.transitions) ? typeRecord.transitions : [])
          .map(({ from, to, intent }) => ({ from, to, ...(intent ? { intent } : {}) }))
      }
    },
    // The axis render map rides the machine so derived actions resolve
    // their authored display policy (see `createStatusAction`).
    _stateRender: axis.render || null
  };
}

export function getWorkflowStateActions({
  typeId,
  state,
  workflows = cncWorkflows,
  compiled = null,
  t = value => value
} = {}) {
  const workflow = compiled || workflowForTypeId(typeId, workflows);
  if (!workflow || !state) return [];
  const normalized = normalizeWorkflow(workflow);
  const currentPrimary = getPrimaryState(state, state);
  const stateRender = renderOf(compiled, workflow);

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
    .map(transition => createStatusAction(transition, stateRender, t));
}

export function hasWorkflow(typeId, workflows = cncWorkflows, compiled = null) {
  return Boolean(compiled || workflowForTypeId(typeId, workflows));
}

export function workflowStateCount(typeId, workflows = cncWorkflows, compiled = null) {
  const workflow = compiled || workflowForTypeId(typeId, workflows);
  if (!workflow) return 0;
  const states = Object.values(getWorkflowRegions(normalizeWorkflow(workflow)))
    .flatMap(region => Object.keys(region.states || {}));
  return new Set(states).size;
}

export function hasMeaningfulWorkflowState(typeId, workflows = cncWorkflows, compiled = null) {
  return workflowStateCount(typeId, workflows, compiled) !== 1;
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

// Transition display policy follows the value render map when the source
// is a compiled record (case-sensitive authored keys), so `to` targets
// resolve their authored label/severity/icon.
function renderOf(compiled, workflow) {
  if (compiled?._stateRender) return compiled._stateRender;
  return workflow?._stateRender || null;
}

export function resolveActionDisplay(transition = {}) {
  if (transition.display === false || transition.displayBtn === false) return 'hidden';
  if (transition.display === 'hidden' || transition.display === 'menu' || transition.display === 'inline') return transition.display;
  if (transition.displayBtn === true) return 'inline';
  if (transition.from && transition.from === transition.to) return 'hidden';
  return 'inline';
}

export function createStatusAction(transition = {}, stateRender = null, t = value => value) {
  const policy = resolveStateDisplay(stateRender ? { main: { render: stateRender } } : null, transition.to);
  return {
    label: transition.label || translateStatusLabel(transition.to, policy.label, t),
    to: transition.to,
    region: transition.region || 'main',
    path: transition.path || [transition.to],
    intent: transition.intent || null,
    severity: policy.severity,
    icon: policy.icon,
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
