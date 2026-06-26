const workflows = new Map();

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
  return state?.primary || Object.values(state?.active || {}).find(Boolean) || fallback;
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
    const state = overrides.active?.[id] || overrides.regions?.[id]?.state || region.initial;
    active[id] = state;
    regions[id] = {
      label: region.label || id,
      state,
      path: Array.isArray(overrides.regions?.[id]?.path) ? overrides.regions[id].path : resolveStatePath(region, state)
    };
  }
  const primary = overrides.primary || active[normalized.primaryRegion] || Object.values(active)[0];
  return { schemaVersion: 2, primary, active, regions };
}

export function applyWorkflowTransitionState(currentState, workflow = {}, transition = {}, targetState) {
  const normalized = normalizeWorkflow(workflow);
  const regionId = transition.region || normalized.primaryRegion || 'main';
  const current = currentState && typeof currentState === 'object' && currentState.schemaVersion === 2
    ? currentState
    : createWorkflowState(normalized, { active: { [regionId]: getRegionState(currentState, regionId, getPrimaryState(currentState, targetState)) } });
  const active = { ...(current.active || {}) };
  const regions = { ...(current.regions || {}) };
  const next = targetState || transition.to;
  const region = normalized.regions[regionId];
  active[regionId] = next;
  regions[regionId] = {
    ...(regions[regionId] || {}),
    label: region?.label || regionId,
    state: next,
    path: resolveStatePath(region, next)
  };
  const primary = regionId === normalized.primaryRegion ? next : current.primary || active[normalized.primaryRegion] || next;
  return { schemaVersion: 2, primary, active, regions };
}

export function validateTransition({ workflow, currentState, currentStatus = null, targetState, region = null, path = null, role, actorId = null, lifecycle = {}, requireLifecyclePayload = true }) {
  if (!workflow) return { ok: false, reason: 'workflow_missing' };
  const normalized = normalizeWorkflow(workflow);
  const regionId = region || normalized.primaryRegion || 'main';
  const workflowRegion = normalized.regions[regionId];
  if (!workflowRegion) return { ok: false, reason: 'region_missing', region: regionId };
  const from = currentState || getRegionState(currentStatus, regionId, workflowRegion.initial);
  const transition = workflowRegion.transitions.find(item => item.from === from && item.to === targetState);
  const stateDefinition = workflowRegion.states[targetState] || {};
  const hasLifecycle = hasLifecyclePayload(lifecycle);
  const selfLoop = from === targetState && (
    workflowRegion.states[from]?.canUpdateMeta ||
    (hasLifecycle && workflowRegion.states[from]?.canUpdateLifecycle !== false && workflowRegion.states[from]?.lifecycle)
  );

  if (!transition && !selfLoop) return { ok: false, reason: 'invalid_transition', from, to: targetState, region: regionId };
  const lifecycleValidation = validateLifecyclePayload(stateDefinition.lifecycle, lifecycle, { requireRequired: requireLifecyclePayload });
  if (!lifecycleValidation.ok) return { ...lifecycleValidation, from, to: targetState, region: regionId };

  const actorValidation = validateActorGuard({
    transition,
    currentStatus,
    targetState,
    actorId,
    role
  });
  if (!actorValidation.ok) return { ...actorValidation, from, to: targetState, region: regionId };

  return { ok: true, from, to: targetState, region: regionId, path, transition: transition || null };
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
      await entityStore.setStatus(type, id, { state: applyWorkflowTransitionState(entity?.status?.state, normalized, validation.transition || { region }, targetState), userId: actor?.id || 'SYSTEM', metadata, eventId: event?.id || null });

      for (const hook of validation.transition?.hooks || []) {
        if (hooks[hook.handler]) await hooks[hook.handler]({ type, id, actor, metadata }, hook.params || {});
      }

      return { ok: true, event };
    }
  };
}

function normalizeRegion(id, region = {}) {
  if (!region.initial) throw new Error(`Workflow region ${id} requires initial`);
  if (!region.states || typeof region.states !== 'object') throw new Error(`Workflow region ${id} requires states`);
  const states = flattenStates(region.states);
  return {
    ...region,
    id,
    states,
    transitions: (region.transitions || []).map(transition => ({ region: id, ...transition }))
  };
}

function flattenStates(states = {}, prefix = []) {
  const flat = {};
  for (const [key, value] of Object.entries(states)) {
    const path = [...prefix, key];
    const { states: children, ...definition } = value || {};
    flat[key] = { ...definition, path };
    flat[path.join('.')] = { ...definition, path };
    if (children && typeof children === 'object') {
      Object.assign(flat, flattenStates(children, path));
    }
  }
  return flat;
}

function resolveStatePath(region = {}, state) {
  return region?.states?.[state]?.path || [state];
}
