import { normalizeWorkflow } from '@perigram/core';
import { normalizeStateFieldPolicy } from './designer.js';
import { isDataTree } from './data-tree.js';
import {
  processDefaultValue,
  actionExposureRoleIdsForInput,
  compileActionAccessWindows,
  buildActionGraphContext,
  isEntityTargetHandle,
  outputWindowForHandle,
  compileGrantForAssignment,
  actionTypeId,
  declaredTransitionSources,
  actionTargetState,
  normalizeActionAccess,
  clonePlain,
  workflowTransitionSources
} from './compiler-core.js';

export function compileLifecycle(profile = {}, domain = {}) {
  const lifecycle = profile.lifecycle || {};
  if (lifecycle.mode === 'custom') return lifecycle.workflow ? normalizeWorkflow(lifecycle.workflow) : null;
  // 'defaultCreated' and 'domainDefault' share one contract now: the
  // declared machine when the domain carries one, otherwise the draft's
  // seeded vocabulary (handled by the caller), otherwise no machine. The
  // historical CREATED minting is gone — authored vocabulary only.
  const workflow = domain.workflows?.[profile.typeId] || null;
  return workflow ? normalizeWorkflow(workflow) : null;
}

// State nesting is authored by wiring a state node into another state node
// (SPEC §7): source child, target parent, edge role `type` label `nested`.
export function stateNestingPairs(process = {}) {
  const nodeById = new Map((process.graph?.nodes || []).map(node => [String(node.id), node]));
  const valueOf = node => {
    if (!node || node.type !== 'ctsState') return '';
    const refId = String(node.data?.refId || node.id);
    return String(node.data?.value || process.ctsTypes?.[refId]?.value || '');
  };
  const pairs = [];
  for (const edge of process.graph?.edges || []) {
    const source = nodeById.get(String(edge.source));
    const target = nodeById.get(String(edge.target));
    if (source?.type !== 'ctsState' || target?.type !== 'ctsState') continue;
    const handle = String(edge.targetHandle || '').replace(/^(input|data):/, '');
    if (handle !== 'state') continue;
    // The wire points from parent to child: the source state is the parent,
    // the state it feeds into (the target's `state` input) is its child.
    const parent = valueOf(source);
    const child = valueOf(target);
    if (child && parent && child !== parent) pairs.push({ child, parent });
  }
  return pairs;
}

function findStateEntry(states = {}, value = '', path = []) {
  const name = String(value || '');
  if (!name) return null;
  for (const [key, definition] of Object.entries(states || {})) {
    if (key === name) return { definition, container: states, name: key, path: [...path, key] };
    const nested = definition?.states && findStateEntry(definition.states, name, [...path, key]);
    if (nested) return nested;
  }
  return null;
}

function nestRegionStates(region = {}, pairs = []) {
  let progressed = true;
  let guard = 0;
  while (progressed && guard++ < 200) {
    progressed = false;
    for (const { child, parent } of pairs) {
      const childEntry = findStateEntry(region.states, child);
      const parentEntry = findStateEntry(region.states, parent);
      if (!childEntry || !parentEntry) continue;
      if (childEntry.container === region.states) {
        // still flat: attach under parent
      } else {
        continue;
      }
      if (childEntry.path.join('.') === parentEntry.path.join('.')) continue;
      parentEntry.definition.states ||= {};
      parentEntry.definition.states[childEntry.name] = childEntry.definition;
      parentEntry.definition.initial ||= childEntry.name;
      delete childEntry.container[childEntry.name];
      progressed = true;
    }
  }
}

// Canonical dotted path of a state value in the (possibly nested) tree.
function stateCanonicalPath(region = {}, value = '') {
  const entry = findStateEntry(region.states, value);
  return entry ? entry.path.join('.') : '';
}

export function compileWorkflows(process = {}, domain = {}, lineageBindings = []) {
  const workflows = {};
  const actionWindows = compileActionAccessWindows(process, domain, lineageBindings);
  const graphContext = buildActionGraphContext(process);
  for (const output of Object.values(process.producerOutputs || {})) {
    const workflow = compileLifecycle(output, domain);
    if (workflow) workflows[output.producerOutputId] = workflow;
  }

  const builders = new Map(Object.entries(workflows).map(([producerOutputId, workflow]) => [
    producerOutputId,
    workflowBuilderFromWorkflow(workflow)
  ]));

  // Graph-derived vocabulary (SPEC §7): the draft's state records seed the
  // machine for every producer of their type; nothing else supplies states.
  const stateRecordsByType = new Map();
  for (const record of Object.values(process.ctsTypes || {})) {
    if (record?.kind !== 'state' || !record.value) continue;
    if (!record.typeId) continue;
    const list = stateRecordsByType.get(record.typeId) || [];
    list.push(record);
    stateRecordsByType.set(record.typeId, list);
  }
  // Unscoped state value tokens bind through their ENTRY WIRES (SPEC §7):
  // the wire from a state token into a construct or transition of a type is
  // the token's type binding — the same rule the designer's connection gate
  // applies. An unscoped token seeds exactly the producers its wires feed,
  // never every producer (a shared vocabulary must be wired where it is
  // meant). The wire is identified structurally — state record node into a
  // process-node record — because normalization carries handles, not
  // declaration labels.
  const ctsRecordsByGraphNode = new Map((process.graph?.nodes || []).map(node => [
    String(node.id),
    (process.ctsTypes || {})[String(node.data?.refId || node.id)]
  ]));
  const processRecordsByGraphNode = new Map((process.graph?.nodes || []).map(node => [
    String(node.id),
    (process.processNodes || {})[String(node.data?.refId || node.id)]
  ]));
  for (const edge of process.graph?.edges || []) {
    const state = ctsRecordsByGraphNode.get(String(edge.source));
    if (!state || state.kind !== 'state' || !state.value || state.typeId) continue;
    const target = processRecordsByGraphNode.get(String(edge.target));
    if (!target) continue;
    const targetType = target?.typeId || target?.targetTypeId || '';
    if (!targetType) continue;
    const list = stateRecordsByType.get(targetType) || [];
    if (!list.some(record => record.id === state.id)) list.push(state);
    stateRecordsByType.set(targetType, list);
  }
  for (const output of Object.values(process.producerOutputs || {})) {
    // A custom-authored lifecycle is the contract as written: vocabulary
    // seeding never replaces it.
    if (output.lifecycle?.mode === 'custom') continue;
    const records = stateRecordsByType.get(output.typeId) || [];
    if (!records.length) continue;
    // A declared vocabulary replaces the fallback machine entirely: no
    // synthesized CREATED — the draft's records are the whole vocabulary
    // and the construct's state default is the initial.
    const builder = workflowBuilderFromWorkflow();
    builders.set(output.producerOutputId, builder);
    const region = primaryRegionBuilder(builder);
    for (const record of records) {
      region.states[record.value] ||= {
        canUpdateMeta: true,
        ...(record.label ? { label: record.label } : {}),
        ...((record.severity || record.color) ? { severity: record.severity || record.color } : {}),
        ...(record.icon ? { icon: record.icon } : {})
      };
    }
  }

  // Per-state field policy authors on the typed operations (SPEC §7): a
  // transition declares its target state's facet, a construct its initial
  // state's. First declaration of a state owns the facet (the guard
  // precedent).
  const buildersByType = new Map();
  for (const output of Object.values(process.producerOutputs || {})) {
    if (!builders.has(output.producerOutputId)) continue;
    buildersByType.set(output.typeId, [...(buildersByType.get(output.typeId) || []), builders.get(output.producerOutputId)]);
  }
  for (const record of Object.values(process.processNodes || {})) {
    if (record?.kind !== 'cts.transition' && record?.kind !== 'cts.construct') continue;
    const facet = normalizeStateFieldPolicy(record.fieldPolicy);
    if (!facet || !record.typeId) continue;
    const rawTarget = record.kind === 'cts.transition'
      ? (record.state?.to ?? record.inputDefaults?.state)
      : record.inputDefaults?.state;
    const target = isDataTree(rawTarget) ? processDefaultValue(rawTarget) : rawTarget;
    if (!target || typeof target !== 'string') continue;
    for (const builder of buildersByType.get(record.typeId) || []) {
      const region = primaryRegionBuilder(builder);
      region.states[target] ||= { canUpdateMeta: true };
      region.states[target].fieldPolicy ||= facet;
    }
  }

  for (const [actionId, action] of Object.entries(process.actions || {})) {
    const kind = action.actionKind || 'createEntity';
    if (!['createEntity', 'updateEntity'].includes(kind)) continue;
    const typeId = actionTypeId(action) || actionWindows.get(actionId)?.outputs?.[0]?.typeId || actionWindows.get(actionId)?.input?.typeId;
    if (!typeId) continue;

    if (!action.producerOutputId) {
      const to = actionTargetState(action, process);
      const access = normalizeActionAccess(action.access);
      if (kind !== 'updateEntity' || !to) continue;
      const outputs = Object.values(process.producerOutputs || {})
        .filter(output => output.typeId === typeId);
      for (const output of outputs) {
        const workflowBuilder = builders.get(output.producerOutputId);
        if (!workflowBuilder) continue;
        const regionId = action.state?.axis || workflowBuilder.primaryRegion;
        const region = workflowBuilder.regions[regionId] || primaryRegionBuilder(workflowBuilder);
        // A transition compiles concrete declared state-to-state edges.
        // The from-states are the arrival states of instances on its
        // entity wire — the wiring's status windows, exactly what the
        // producer-bound branch and the action window derive from. An
        // authored `from` narrows to that one edge (legacy reference
        // data); nothing wildcard or enumerated enters the machine.
        const wiredFroms = declaredTransitionSources(actionId, action, typeId, graphContext, actionWindows)
          .map(source => source.status)
          .filter(Boolean);
        if (!wiredFroms.length) continue;
        for (const from of wiredFroms) {
          addWorkflowState(region, from);
          addWorkflowState(region, to);
          upsertWorkflowTransition(region, {
            from,
            to,
            processRoleIds: actionExposureRoleIdsForInput(action, access, null),
            ...(action.trigger?.mode === 'event' ? { processOwned: true } : {}),
            ...(action.guard ? { guard: action.guard } : {})
          });
        }
      }
      continue;
    }

    const builder = primaryRegionBuilder(ensureWorkflowBuilder(builders, action.producerOutputId));

    if (kind === 'createEntity') {
      const targetState = actionTargetState(action, process);
      if (targetState) {
        addWorkflowState(builder, targetState);
        // The construct's state default is the machine's initial (SPEC §7):
        // no declaration owns an initial.
        if (!builder.initial) builder.initial = targetState;
      }
      continue;
    }

    const to = actionTargetState(action, process);
    const access = normalizeActionAccess(action.access);
    if (!to) continue;

    for (const source of declaredTransitionSources(actionId, action, typeId, graphContext, actionWindows)) {
      const from = source.status;
      if (!from) continue;
      addWorkflowState(builder, from);
      addWorkflowState(builder, to);
      upsertWorkflowTransition(builder, {
        from,
        to,
        processRoleIds: actionExposureRoleIdsForInput(action, access, source.window),
        ...(action.trigger?.mode === 'event' ? { processOwned: true } : {}),
        ...(action.guard ? { guard: action.guard } : {})
      });
    }
  }

  const nestingPairs = stateNestingPairs(process);
  for (const [producerOutputId, builder] of builders) {
    if (!Object.values(builder.regions).some(region => Object.keys(region.states).length)) continue;
    for (const region of Object.values(builder.regions)) {
      applyStatusDefinitionMetadata(region, process.producerOutputs?.[producerOutputId]?.typeId, process.stateDefinitions);
      nestRegionStates(region, nestingPairs);
      if (region.initial) region.initial = stateCanonicalPath(region, region.initial) || region.initial;
      region.transitions = (region.transitions || [])
        .map(transition => ({
          ...transition,
          from: stateCanonicalPath(region, transition.from) || transition.from,
          to: stateCanonicalPath(region, transition.to) || transition.to
        }))
        .filter(transition => transition.from && transition.to && transition.from !== transition.to);
      // A machine requires an entry (SPEC §7): the construct's state
      // default authors it; when none is authored yet, the first declared
      // state record supplies a deterministic entry so the vocabulary
      // compiles — authoring the construct default replaces it.
      if (!region.initial) {
        region.initial = Object.keys(region.states)[0] || '';
      }
    }
    workflows[producerOutputId] = normalizeWorkflow({
      ...builder.contracts,
      schemaVersion: 2,
      primaryRegion: builder.primaryRegion,
      regions: Object.fromEntries(Object.entries(builder.regions).map(([regionId, region]) => [regionId, {
        ...region.contracts,
        initial: region.initial,
        states: region.states,
        transitions: region.transitions
      }]))
    });
  }

  return workflows;
}

function applyStatusDefinitionMetadata(builder, typeId, stateDefinitions = {}) {
  for (const definition of Object.values(stateDefinitions || {})) {
    if (definition.typeId && definition.typeId !== typeId) continue;
    const stateId = definition.stateId || definition.id;
    if (!stateId) continue;
    const decorated = {
      label: definition.label || stateId,
      color: definition.color || definition.severity || '',
      severity: definition.severity || definition.color || '',
      icon: definition.icon || '',
      ...(definition.lifecycle ? { lifecycle: clonePlain(definition.lifecycle) } : {})
    };
    const parentStatusId = definition.parentStatusId || '';
    if (parentStatusId) {
      const parent = builder.states[parentStatusId];
      if (!parent) continue;
      parent.states ||= {};
      const canonicalChild = `${parentStatusId}.${stateId}`;
      const flattenedExisting = builder.states[canonicalChild];
      const existing = parent.states[canonicalChild] || parent.states[stateId] || flattenedExisting;
      if (existing) {
        if (flattenedExisting) {
          parent.states = { [stateId]: { ...flattenedExisting, ...decorated } };
          if (!parent.initial) parent.initial = stateId;
          delete builder.states[canonicalChild];
        } else {
          parent.states[canonicalChild] = { ...existing, ...decorated };
          delete parent.states[stateId];
        }
        continue;
      }
      parent.states[stateId] = { ...(parent.states[stateId] || {}), ...decorated };
      continue;
    }
    if (!builder.states[stateId]) continue;
    builder.states[stateId] = { ...(builder.states[stateId] || {}), ...decorated };
  }
}

const WORKFLOW_STRUCTURAL_KEYS = new Set(['schemaVersion', 'primaryRegion', 'initial', 'states', 'transitions', 'regions']);
const REGION_STRUCTURAL_KEYS = new Set(['id', 'initial', 'states', 'transitions']);

function carriedContracts(source = {}, structuralKeys) {
  return Object.fromEntries(Object.entries(source).filter(([key]) => !structuralKeys.has(key)));
}

function workflowBuilderFromWorkflow(workflow = {}) {
  const sourceRegions = workflow.regions && typeof workflow.regions === 'object' ? workflow.regions : {};
  const primaryRegion = workflow.primaryRegion || (sourceRegions.main ? 'main' : Object.keys(sourceRegions)[0]) || 'main';
  const regions = {};
  for (const [regionId, region] of Object.entries(sourceRegions)) {
    regions[regionId] = {
      contracts: carriedContracts(region, REGION_STRUCTURAL_KEYS),
      initial: region.initial || '',
      states: { ...(region.states || {}) },
      transitions: [...(region.transitions || [])]
    };
  }
  if (!Object.keys(regions).length) {
    regions[primaryRegion] = { contracts: {}, initial: '', states: {}, transitions: [] };
  }
  return {
    contracts: carriedContracts(workflow, WORKFLOW_STRUCTURAL_KEYS),
    primaryRegion,
    regions
  };
}

function primaryRegionBuilder(builder) {
  return builder.regions[builder.primaryRegion] || Object.values(builder.regions)[0];
}

function ensureWorkflowBuilder(builders, typeId) {
  if (!builders.has(typeId)) {
    builders.set(typeId, workflowBuilderFromWorkflow());
  }
  return builders.get(typeId);
}

function addWorkflowState(builder, state) {
  if (!state) return;
  builder.states[state] ||= { canUpdateMeta: true };
}

function upsertWorkflowTransition(builder, transition) {
  const existing = builder.transitions.find(item => item.from === transition.from && item.to === transition.to);
  if (existing) {
    existing.processRoleIds = [...new Set([...(existing.processRoleIds || []), ...(transition.processRoleIds || [])])];
    if (transition.access?.permissions?.length) {
      existing.access ||= {};
      existing.access.permissions = mergeTransitionPermissions(existing.access.permissions || [], transition.access.permissions);
    }
    if (transition.access?.system) {
      existing.access ||= {};
      existing.access.system = true;
    }
    if (transition.deadline === true) existing.deadline = true;
    // First declaration of an edge owns its guard (SPEC §7).
    if (!existing.guard && transition.guard) existing.guard = transition.guard;
    return;
  }
  builder.transitions.push(transition);
}

function mergeTransitionPermissions(existing = [], next = []) {
  const merged = [...existing];
  for (const permission of next) {
    if (merged.some(item => item.feature === permission.feature && item.level === permission.level && item.typeId === permission.typeId)) continue;
    merged.push(permission);
  }
  return merged;
}

