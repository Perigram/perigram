import { computed, ref } from 'vue';
import { normalizeWorkflow } from '~/packages/workflows/src/index.js';
import { createCreatedWorkflow } from './useProcessDesignerNodeRecords.js';

// Lifecycle/status-machine editing for the created entity of the selected
// producer node. The page remains the composition root: the selected entity
// record is injected and mutated in place.
export function useProcessDesignerWorkflow({ selectedEntity, cncDomain } = {}) {
  const newStateId = ref('');

  function workflowForEntity(profile = {}) {
    if (profile.lifecycle?.mode === 'domainDefault' && cncDomain.workflows?.[profile.entityType]) return normalizeWorkflow(cncDomain.workflows[profile.entityType]);
    if (profile.lifecycle?.workflow) return normalizeWorkflow(profile.lifecycle.workflow);
    return normalizeWorkflow(createCreatedWorkflow());
  }

  const lifecycleWorkflow = computed(() => workflowForEntity(selectedEntity.value));
  const lifecycleRegion = computed(() => lifecycleWorkflow.value.regions?.main || lifecycleWorkflow.value.regions?.[lifecycleWorkflow.value.primaryRegion] || null);
  const lifecycleStateIds = computed(() => Object.keys(lifecycleRegion.value?.states || {}).filter(key => !key.includes('.')));
  const lifecycleStateEntries = computed(() => lifecycleStateIds.value.map(value => ({
    label: lifecycleRegion.value?.states?.[value]?.label || value,
    value
  })));
  const lifecycleStateOptions = computed(() => lifecycleStateEntries.value);
  const lifecycleTransitions = computed(() => lifecycleRegion.value?.transitions || []);

  function ensureCustomLifecycleRegion() {
    selectedEntity.value.lifecycle ||= {};
    if (selectedEntity.value.lifecycle.mode !== 'custom') {
      selectedEntity.value.lifecycle = {
        mode: 'custom',
        workflow: workflowForEntity(selectedEntity.value)
      };
    }
    const workflow = normalizeWorkflow(selectedEntity.value.lifecycle.workflow || createCreatedWorkflow());
    selectedEntity.value.lifecycle.workflow = workflow;
    const regionId = workflow.primaryRegion || 'main';
    workflow.regions[regionId] ||= { id: regionId, label: 'Lifecycle', initial: 'CREATED', states: { CREATED: { canUpdateMeta: true } }, transitions: [] };
    return workflow.regions[regionId];
  }

  function addLifecycleState() {
    const id = newStateId.value.trim().toUpperCase().replace(/\s+/g, '_');
    if (!id) return;
    const region = ensureCustomLifecycleRegion();
    region.states[id] ||= { canUpdateMeta: true };
    if (!region.initial) region.initial = id;
    newStateId.value = '';
  }

  function addLifecycleTransition() {
    const region = ensureCustomLifecycleRegion();
    const states = Object.keys(region.states);
    if (states.length < 2) return;
    region.transitions.push({ from: states[0], to: states[1], access: { processRoleIds: [] } });
  }

  function updateTransition(index, updates) {
    const region = ensureCustomLifecycleRegion();
    region.transitions[index] = { ...region.transitions[index], ...updates };
  }

  function updateTransitionRoles(index, roleIds) {
    const region = ensureCustomLifecycleRegion();
    const transition = region.transitions[index] || {};
    region.transitions[index] = {
      ...transition,
      access: {
        ...(transition.access || {}),
        processRoleIds: roleIds
      }
    };
  }

  function removeLifecycleTransition(index) {
    const region = ensureCustomLifecycleRegion();
    region.transitions.splice(index, 1);
  }

  return {
    newStateId,
    lifecycleWorkflow,
    lifecycleRegion,
    lifecycleStateIds,
    lifecycleStateEntries,
    lifecycleStateOptions,
    lifecycleTransitions,
    workflowForEntity,
    ensureCustomLifecycleRegion,
    addLifecycleState,
    addLifecycleTransition,
    updateTransition,
    updateTransitionRoles,
    removeLifecycleTransition
  };
}
