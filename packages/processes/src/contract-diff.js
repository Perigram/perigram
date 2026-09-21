// Semantic diff between two compiled process contracts. Both inputs are the
// `compileProcessDefinition` outputs of the currently active definition and
// the definition about to be applied; the runtime never trusts the stored
// `compiled` snapshot, so callers recompile both sides before diffing.

function diffKeyedRecords(previous = {}, next = {}, semanticFields = []) {
  const added = [];
  const removed = [];
  const changed = [];
  for (const id of Object.keys(next)) {
    if (!Object.hasOwn(previous, id)) added.push(id);
  }
  for (const id of Object.keys(previous)) {
    if (!Object.hasOwn(next, id)) removed.push(id);
  }
  for (const id of Object.keys(previous)) {
    if (!Object.hasOwn(next, id)) continue;
    const changes = semanticFields.filter(field => (
      JSON.stringify(fieldValue(previous[id], field)) !== JSON.stringify(fieldValue(next[id], field))
    ));
    if (changes.length) changed.push({ id, changes });
  }
  return { added, removed, changed };
}

function fieldValue(record = {}, field = '') {
  return field.split('.').reduce((value, key) => (value == null ? undefined : value[key]), record);
}

function regionStates(workflow = {}) {
  const states = new Set();
  for (const [regionId, region] of Object.entries(workflow.regions || {})) {
    for (const stateId of Object.keys(region.states || {})) states.add(`${regionId}:${stateId}`);
  }
  return states;
}

function regionTransitions(workflow = {}) {
  const transitions = new Set();
  for (const region of Object.values(workflow.regions || {})) {
    for (const transition of region.transitions || []) {
      transitions.add(`${transition.from}->${transition.to}`);
    }
  }
  return transitions;
}

function regionEntries(workflow = {}) {
  const entries = new Set();
  for (const [regionId, region] of Object.entries(workflow.regions || {})) {
    if (region.initial) entries.add(`${regionId}:${region.initial}`);
  }
  return entries;
}

// Retained primary-region states for one entity type across its producers.
// Shared by the contract diff (removedEntityStatuses) and the Apply
// migration plan (target choices), so both speak the same state set.
export function primaryStates(producerOutputs = {}, typeId = '') {
  const states = new Set();
  for (const output of Object.values(producerOutputs || {})) {
    if (output.typeId !== typeId) continue;
    const region = output.workflow?.regions?.[output.workflow?.primaryRegion] || {};
    for (const stateId of Object.keys(region.states || {})) states.add(stateId);
  }
  return states;
}

function diffWorkflows(previousProducers = {}, nextProducers = {}) {
  const result = {
    addedProducers: Object.keys(nextProducers).filter(id => !Object.hasOwn(previousProducers, id)),
    removedProducers: Object.keys(previousProducers).filter(id => !Object.hasOwn(nextProducers, id)),
    changed: []
  };
  for (const [producerOutputId, previousOutput] of Object.entries(previousProducers)) {
    const nextOutput = nextProducers[producerOutputId];
    if (!nextOutput) continue;
    const previousWorkflow = previousOutput.workflow || {};
    const nextWorkflow = nextOutput.workflow || {};
    const previousStates = regionStates(previousWorkflow);
    const nextStates = regionStates(nextWorkflow);
    const previousTransitions = regionTransitions(previousWorkflow);
    const nextTransitions = regionTransitions(nextWorkflow);
    const entryChanged = !setsEqual(regionEntries(previousWorkflow), regionEntries(nextWorkflow));
    const entry = {
      producerOutputId,
      typeId: nextOutput.typeId || previousOutput.typeId || '',
      addedStates: [...nextStates].filter(state => !previousStates.has(state)),
      removedStates: [...previousStates].filter(state => !nextStates.has(state)),
      addedTransitions: [...nextTransitions].filter(transition => !previousTransitions.has(transition)),
      removedTransitions: [...previousTransitions].filter(transition => !nextTransitions.has(transition)),
      entryChanged
    };
    if (entry.addedStates.length || entry.removedStates.length
      || entry.addedTransitions.length || entry.removedTransitions.length || entryChanged) {
      result.changed.push(entry);
    }
  }
  return result;
}

function diffFieldPolicies(previousProducers = {}, nextProducers = {}) {
  const result = {
    addedProducers: Object.keys(nextProducers).filter(id => !Object.hasOwn(previousProducers, id)),
    removedProducers: Object.keys(previousProducers).filter(id => !Object.hasOwn(nextProducers, id)),
    changed: []
  };
  for (const [producerOutputId, previousOutput] of Object.entries(previousProducers)) {
    const nextOutput = nextProducers[producerOutputId];
    if (!nextOutput) continue;
    const entry = {
      producerOutputId,
      typeId: nextOutput.typeId || previousOutput.typeId || '',
      added: {},
      removed: {}
    };
    for (const section of ['read', 'write', 'private', 'relations']) {
      const previousList = previousOutput.fieldPolicy?.[section] || [];
      const nextList = nextOutput.fieldPolicy?.[section] || [];
      const added = nextList.filter(item => !previousList.includes(item));
      const removed = previousList.filter(item => !nextList.includes(item));
      if (added.length) entry.added[section] = added;
      if (removed.length) entry.removed[section] = removed;
    }
    if (Object.keys(entry.added).length || Object.keys(entry.removed).length) result.changed.push(entry);
  }
  return result;
}

function diffCapabilities(previousActions = {}, nextActions = {}) {
  const previousByType = capabilitiesByTypeId(previousActions);
  const nextByType = capabilitiesByTypeId(nextActions);
  const changed = [];
  for (const typeId of new Set([...Object.keys(previousByType), ...Object.keys(nextByType)])) {
    const previousKinds = previousByType[typeId] || new Set();
    const nextKinds = nextByType[typeId] || new Set();
    const added = [...nextKinds].filter(kind => !previousKinds.has(kind));
    const removed = [...previousKinds].filter(kind => !nextKinds.has(kind));
    if (added.length || removed.length) changed.push({ typeId, added, removed });
  }
  return { changed };
}

function capabilitiesByTypeId(actions = {}) {
  const byType = {};
  for (const action of Object.values(actions)) {
    if (!action.typeId || !action.actionKind) continue;
    (byType[action.typeId] ||= new Set()).add(action.actionKind);
  }
  return byType;
}

function removedEntityStatuses(previousProducers = {}, nextProducers = {}) {
  const typeIds = new Set([
    ...Object.values(previousProducers || {}).map(output => output.typeId),
    ...Object.values(nextProducers || {}).map(output => output.typeId)
  ].filter(Boolean));
  const removed = [];
  for (const typeId of typeIds) {
    const previousStatuses = primaryStates(previousProducers, typeId);
    const nextStatuses = primaryStates(nextProducers, typeId);
    const statuses = [...previousStatuses].filter(state => !nextStatuses.has(state));
    if (statuses.length) removed.push({ typeId, statuses });
  }
  return removed;
}

function setsEqual(left, right) {
  if (left.size !== right.size) return false;
  for (const item of left) {
    if (!right.has(item)) return false;
  }
  return true;
}

export function diffProcessContracts(previous = {}, next = {}) {
  return {
    // The UI contract channels: the emitted screens are projected
    // (typeId/typeList/instanceDetail) and the diff fields follow that
    // vocabulary; `compiled.actions` stays the execution contract, so its
    // diff keeps the execution fields.
    actions: diffKeyedRecords(previous.actions, next.actions, [
      'actionKind', 'typeId', 'producerOutputId', 'commandId', 'trigger.mode', 'access.level', 'inputPolicy.prompt', 'construction.mode'
    ]),
    screens: diffKeyedRecords(previous.screens, next.screens, [
      'route', 'template', 'typeId', 'roleIds', 'required.access', 'sources', 'regions'
    ]),
    roles: diffKeyedRecords(previous.roles, next.roles, ['grants', 'actions']),
    capabilities: diffCapabilities(previous.actions, next.actions),
    workflows: diffWorkflows(previous.producerOutputs, next.producerOutputs),
    fieldPolicies: diffFieldPolicies(previous.producerOutputs, next.producerOutputs),
    removedEntityStatuses: removedEntityStatuses(previous.producerOutputs, next.producerOutputs)
  };
}

export function hasProcessContractChanges(diff = {}) {
  if (!diff || typeof diff !== 'object') return false;
  for (const section of ['actions', 'screens', 'roles']) {
    const record = diff[section];
    if (record && (record.added?.length || record.removed?.length || record.changed?.length)) return true;
  }
  if (diff.capabilities?.changed?.length) return true;
  for (const section of ['workflows', 'fieldPolicies']) {
    const record = diff[section];
    if (record && (record.addedProducers?.length || record.removedProducers?.length || record.changed?.length)) return true;
  }
  if (diff.removedEntityStatuses?.length) return true;
  return false;
}
