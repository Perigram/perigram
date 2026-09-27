const workflows = new Map();
const STATE_CHILDREN = Symbol('workflow-state-children');

export function defineWorkflow(type, workflow) {
  if (!type) throw new Error('Workflow type is required');
  const normalized = normalizeWorkflow(workflow);
  workflows.set(type, Object.freeze({ ...normalized }));
  return getWorkflow(type);
}

export function getWorkflow(type) {
  return workflows.get(type) || null;
}

export function listWorkflows() {
  return Array.from(workflows.entries()).map(([type, workflow]) => ({ type, workflow }));
}

export function normalizeWorkflow(workflow = {}) {
  if (!workflow?.initial && !workflow?.regions) {
    throw new Error('Workflow requires regions or an initial state');
  }
  const regions = workflow.regions && typeof workflow.regions === 'object'
    ? Object.fromEntries(Object.entries(workflow.regions).map(([id, region]) => [id, normalizeRegion(id, region)]))
    : {
        main: normalizeRegion('main', {
          initial: workflow.initial,
          states: workflow.states || {},
          transitions: workflow.transitions || []
        })
      };
  const primaryRegion = workflow.primaryRegion || (regions.main ? 'main' : Object.keys(regions)[0]);
  const primary = regions[primaryRegion]?.initial || workflow.initial;
  return {
    ...workflow,
    schemaVersion: 2,
    primaryRegion,
    initial: primary,
    states: regions[primaryRegion]?.states || {},
    transitions: regions[primaryRegion]?.transitions || [],
    regions
  };
}

export function getWorkflowRegions(workflow = {}) {
  return normalizeWorkflow(workflow).regions;
}

export function getWorkflowRegion(workflow = {}, regionId = 'main') {
  return getWorkflowRegions(workflow)[regionId] || null;
}

export function getPrimaryState(statusOrState, fallback = null) {
  const state = statusOrState?.state ?? statusOrState;
  if (typeof state === 'string') return state || fallback;
  return state?.main ?? (state?.primary || Object.values(state?.active || {}).find(Boolean) || fallback);
}

export function getRegionState(statusOrState, regionId = 'main', fallback = null) {
  const state = statusOrState?.state ?? statusOrState;
  if (typeof state === 'string') return regionId === 'main' ? state : fallback;
  return state?.active?.[regionId] || state?.regions?.[regionId]?.state || (regionId === 'main' ? getPrimaryState(state, fallback) : fallback);
}

export function createWorkflowState(workflow = {}, overrides = {}) {
  const normalized = normalizeWorkflow(workflow);
  const active = {};
  const regions = {};
  for (const [id, region] of Object.entries(normalized.regions)) {
    const requested = overrides.active?.[id] || overrides.regions?.[id]?.state || region.initial;
    const state = resolveWorkflowStatePath(region, requested) || region.initial;
    active[id] = state;
    regions[id] = {
      label: region.label || id,
      state,
      path: statePathSegments(state)
    };
  }
  const primaryRegion = normalized.primaryRegion;
  const primary = active[primaryRegion] || Object.values(active)[0];
  return { schemaVersion: 2, primary, active, regions };
}

export function applyWorkflowTransitionState(currentState, workflow = {}, transition = {}, targetState) {
  const normalized = normalizeWorkflow(workflow);
  const regionId = transition.region || normalized.primaryRegion || 'main';
  const defaults = createWorkflowState(normalized);
  const current = currentState && typeof currentState === 'object' && currentState.schemaVersion === 2
    ? currentState
    : isWorkflowActiveMap(currentState)
      ? { ...defaults, active: { ...defaults.active, ...currentState } }
      : defaults;
  const active = { ...defaults.active, ...(current.active || {}) };
  const regions = { ...current.regions || {} };
  const next = resolveWorkflowStatePath(normalized.regions[regionId], targetState || transition.to);
  if (!next) throw new Error(`State ${targetState || transition.to} is not defined for workflow region ${regionId}`);
  const region = normalized.regions[regionId];
  active[regionId] = next;
  regions[regionId] = {
    ...(regions[regionId] || {}),
    label: region?.label || regionId,
    state: next,
    path: statePathSegments(next)
  };
  const primary = regionId === normalized.primaryRegion
    ? next
    : active[normalized.primaryRegion] || active[regionId];
  return { schemaVersion: 2, primary, active, regions };
}

export function validateTransition({ workflow, currentState, currentStatus = null, targetState, region = null, path = null, role, actorId = null, lifecycle = {}, requireLifecyclePayload = true }) {
  if (!workflow) return { ok: false, reason: 'workflow_missing' };
  const normalized = normalizeWorkflow(workflow);
  const regionId = region || normalized.primaryRegion || 'main';
  const workflowRegion = normalized.regions[regionId];
  if (!workflowRegion) return { ok: false, reason: 'region_missing', region: regionId };
  const from = currentState || getRegionState(currentStatus, regionId, workflowRegion.initial);
  const enteredTarget = resolveWorkflowStatePath(workflowRegion, targetState);
  if (!enteredTarget) return { ok: false, reason: 'invalid_transition', from, to: targetState, region: regionId };
  const transition = selectWorkflowTransition(workflowRegion, from, enteredTarget);
  const stateDefinition = workflowRegion.states[enteredTarget] || {};
  const hasLifecycle = hasLifecyclePayload(lifecycle);
  const selfLoop = from === enteredTarget && (
    workflowRegion.states[from]?.canUpdateMeta ||
    (hasLifecycle && workflowRegion.states[from]?.canUpdateLifecycle !== false && workflowRegion.states[from]?.lifecycle)
  );

  // Machine doctrine: the machine declares states; the operated instance
  // supplies the from-state and the action supplies the target. A
  // transition between declared states is legal — explicit edges are
  // authored metadata (menus, legacy v4 data), never the gate.
  const declaredPair = Object.hasOwn(workflowRegion.states, from)
    && Object.hasOwn(workflowRegion.states, enteredTarget);
  if (!transition && !selfLoop && !declaredPair) {
    return { ok: false, reason: 'invalid_transition', from, to: targetState, region: regionId };
  }
  const lifecycleValidation = validateLifecyclePayload(stateDefinition.lifecycle, lifecycle, { requireRequired: requireLifecyclePayload });
  if (!lifecycleValidation.ok) return { ...lifecycleValidation, from, to: targetState, region: regionId };

  const actorValidation = validateActorGuard({
    transition,
    currentStatus,
    targetState: enteredTarget,
    actorId,
    role
  });
  if (!actorValidation.ok) return { ...actorValidation, from, to: targetState, region: regionId };

  return { ok: true, from, to: enteredTarget, region: regionId, path, transition: transition || null };
}

export function normalizeLifecycle(lifecycle = {}) {
  const source = lifecycle && typeof lifecycle === 'object' ? lifecycle : {};
  return {
    actors: Array.isArray(source.actors) ? source.actors : [],
    attachments: source.attachments && typeof source.attachments === 'object' ? source.attachments : {},
    data: source.data && typeof source.data === 'object' ? source.data : {}
  };
}

export function hasLifecyclePayload(lifecycle = {}) {
  const normalized = normalizeLifecycle(lifecycle);
  return normalized.actors.length > 0 ||
    Object.keys(normalized.attachments).length > 0 ||
    Object.keys(normalized.data).length > 0;
}

export function validateLifecyclePayload(schema, lifecycle = {}, options = {}) {
  const { requireRequired = true } = options;
  const normalized = normalizeLifecycle(lifecycle);
  const hasPayload = hasLifecyclePayload(normalized);
  if (!schema) return hasPayload ? { ok: false, reason: 'lifecycle_not_allowed' } : { ok: true };

  const allowedActors = Array.isArray(schema.actors) ? schema.actors : [];
  for (const actor of normalized.actors) {
    if (!actor?.userId) return { ok: false, reason: 'invalid_lifecycle_actor' };
    if (actor.capability && allowedActors.length > 0 && !allowedActors.includes(actor.capability)) {
      return { ok: false, reason: 'lifecycle_actor_not_allowed', capability: actor.capability };
    }
  }

  const attachmentSchema = schema.attachments || {};
  for (const [slot, slotSchema] of Object.entries(attachmentSchema)) {
    if (!requireRequired || !slotSchema?.required) continue;
    const value = normalized.attachments[slot];
    if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) {
      return { ok: false, reason: 'lifecycle_attachment_required', slot };
    }
  }
  if (!hasPayload) return { ok: true };
  for (const [slot, value] of Object.entries(normalized.attachments)) {
    const slotSchema = attachmentSchema[slot];
    if (!slotSchema) return { ok: false, reason: 'lifecycle_attachment_not_allowed', slot };
    if (Array.isArray(value) && slotSchema.multiple === false) {
      return { ok: false, reason: 'lifecycle_attachment_must_be_single', slot };
    }
    if (!Array.isArray(value) && slotSchema.multiple === true) {
      return { ok: false, reason: 'lifecycle_attachment_must_be_array', slot };
    }
  }

  const dataKeys = Object.keys(normalized.data);
  const hasOnlyDeclaredSnapshotData = dataKeys.length === 1 && dataKeys[0] === 'snapshots' && schema.snapshots;
  if (dataKeys.length > 0 && schema.data !== true && !hasOnlyDeclaredSnapshotData) {
    return { ok: false, reason: 'lifecycle_data_not_allowed' };
  }

  const snapshotSchema = schema.snapshots || {};
  const snapshots = normalized.data?.snapshots && typeof normalized.data.snapshots === 'object'
    ? normalized.data.snapshots
    : {};
  for (const [key, snapshot] of Object.entries(snapshotSchema)) {
    if (requireRequired && snapshot?.required && !snapshots[key]) {
      return { ok: false, reason: 'lifecycle_snapshot_required', snapshot: key };
    }
  }
  for (const key of Object.keys(snapshots)) {
    if (!snapshotSchema[key]) return { ok: false, reason: 'lifecycle_snapshot_not_allowed', snapshot: key };
  }

  return { ok: true };
}

export function validateActorGuard({ transition, currentStatus, targetState, actorId, role }) {
  if (role === 'SYSTEM') return { ok: true };

  const actors = normalizeLifecycle(currentStatus?.lifecycle).actors;
  const matchingAssignments = actors.filter(actor => actorAppliesToState(actor, targetState));
  if (matchingAssignments.length > 0 && !matchingAssignments.some(actor => actor.userId === actorId)) {
    return { ok: false, reason: 'actor_denied' };
  }

  const requiredCapabilities = transition?.capabilities || transition?.requiredCapabilities || [];
  if (requiredCapabilities.length === 0) return { ok: true };

  const actorCapabilities = actors
    .filter(actor => actor.userId === actorId && actorAppliesToState(actor, targetState))
    .map(actor => actor.capability);
  const hasCapability = requiredCapabilities.some(capability => actorCapabilities.includes(capability));
  return hasCapability ? { ok: true } : { ok: false, reason: 'capability_denied', requiredCapabilities };
}

function actorAppliesToState(actor, targetState) {
  if (!actor?.userId) return false;
  if (!Array.isArray(actor.states) || actor.states.length === 0) return true;
  return actor.states.includes(targetState) || actor.states.includes('*');
}

export function createTransitionEngine({ entityStore, eventStore, hooks = {}, authorize = () => true } = {}) {
  return {
    async transition({ type, id, targetState, actor, metadata = {} }) {
      const workflow = getWorkflow(type);
      const normalized = normalizeWorkflow(workflow);
      const entity = await entityStore.get(type, id);
      const role = actor?.role || 'SYSTEM';
      const region = metadata?.region || normalized.primaryRegion;
      const validation = validateTransition({
        workflow: normalized,
        currentState: getRegionState(entity?.status, region, normalized.regions[region]?.initial),
        targetState,
        region,
        role,
        actorId: actor?.id,
        currentStatus: entity?.status,
        lifecycle: metadata?.lifecycle || {}
      });
      if (!validation.ok) return validation;
      if (!(await authorize({ type, entity, actor, transition: validation.transition }))) {
        return { ok: false, reason: 'permission_denied' };
      }

      const event = await eventStore.append({ type, id, from: validation.from, to: targetState, actor, metadata });
      await entityStore.setStatus(type, id, { state: applyWorkflowTransitionState(entity?.states, normalized, validation.transition || { region }, targetState), userId: actor?.id || 'SYSTEM', metadata, eventId: event?.id || null });

      for (const hook of validation.transition?.hooks || []) {
        if (hooks[hook.handler]) await hooks[hook.handler]({ type, id, actor, metadata }, hook.params || {});
      }

      return { ok: true, event };
    }
  };
}

export function workflowStateEntries(region = {}) {
  return Object.entries(region?.states || {}).map(([path, definition]) => ({ path, definition }));
}

export function resolveWorkflowStatePath(region = {}, state) {
  if (typeof state !== 'string' || !state || !Object.hasOwn(region?.states || {}, state)) return null;
  let path = state;
  let definition = region.states[state];
  while (definition?.[STATE_CHILDREN] && Object.keys(definition[STATE_CHILDREN]).length) {
    const child = definition.initial;
    if (typeof child !== 'string' || !Object.hasOwn(definition[STATE_CHILDREN], child)) return null;
    path = `${path}.${child}`;
    definition = region.states[path];
  }
  return path;
}

export function workflowTransitionsForState(region = {}, state) {
  for (const ancestor of activeStatePaths(region, state)) {
    const transitions = (region.transitions || []).filter(transition => transition.from === ancestor);
    if (transitions.length) return transitions;
  }
  return [];
}

function selectWorkflowTransition(region, state, targetState, intent = null) {
  const ancestors = activeStatePaths(region, state);
  for (const ancestor of ancestors) {
    const candidates = (region.transitions || []).filter(transition => transition.from === ancestor);
    if (!candidates.length) continue;
    if (intent) return candidates.find(transition => transition.intent === intent) || null;
    return candidates.find(transition => resolveWorkflowStatePath(region, transition.to) === targetState) || null;
  }
  return null;
}

function activeStatePaths(region = {}, state) {
  if (typeof state !== 'string' || !Object.hasOwn(region?.states || {}, state)) return [];
  const segments = state.split('.');
  return segments.map((_, index) => segments.slice(0, index + 1).join('.')).reverse();
}

function isWorkflowActiveMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.schemaVersion === 2 || value.state || value.primary || value.active || value.regions) return false;
  return Object.values(value).every(item => typeof item === 'string');
}

function normalizeRegion(id, region = {}) {
  if (!region.initial) throw new Error(`Workflow region ${id} requires initial`);
  if (!region.states || typeof region.states !== 'object') throw new Error(`Workflow region ${id} requires states`);
  const states = flattenStates(region.states);
  const transitions = (region.transitions || []).map(transition => ({ region: id, ...transition }));
  const normalized = { ...region, id, states, transitions };
  const initial = resolveWorkflowStatePath(normalized, region.initial);
  if (!initial) throw new Error(`Workflow region ${id} initial ${region.initial} is not declared`);
  for (const transition of transitions) {
    if (!Object.hasOwn(states, transition.from)) {
      throw new Error(`Workflow region ${id} transition from ${transition.from} is not declared`);
    }
    if (!resolveWorkflowStatePath(normalized, transition.to)) {
      throw new Error(`Workflow region ${id} transition to ${transition.to} is not declared`);
    }
  }
  return { ...normalized, initial };
}

function flattenStates(states = {}, prefix = [], flat = {}, ancestors = new Set()) {
  for (const [localName, value] of Object.entries(states)) {
    if (!localName) throw new Error('Workflow state local name must be a non-empty path segment');
    if (localName.includes('.') && prefix.length) {
      throw new Error(`Workflow nested state local name ${localName} must be a single path segment`);
    }
    if (ancestors.has(value)) throw new Error(`Workflow state cycle at ${[...prefix, localName].join('.')}`);
    const path = localName.includes('.') ? [localName] : [...prefix, localName];
    const canonicalPath = path.join('.');
    const { states: children, ...definition } = value || {};
    if (Object.hasOwn(flat, canonicalPath)) {
      throw new Error(`Workflow state path collision at ${canonicalPath}`);
    }
    const nextAncestors = new Set(ancestors).add(value);
    const normalizedDefinition = { ...definition, path };
    if (children && typeof children === 'object') {
      Object.defineProperty(normalizedDefinition, STATE_CHILDREN, { value: children });
    }
    flat[canonicalPath] = normalizedDefinition;
    if (children && typeof children === 'object') {
      if (!definition.initial) {
        throw new Error(`Workflow state ${canonicalPath} requires exactly one initial child`);
      }
      if (!Object.hasOwn(children, definition.initial)) {
        throw new Error(`Workflow state ${canonicalPath} initial child ${definition.initial} is not declared`);
      }
      flattenStates(children, path, flat, nextAncestors);
    }
  }
  return flat;
}

function statePathSegments(state) {
  return typeof state === 'string' && state ? state.split('.') : [];
}
