const workflows = new Map();

export function defineWorkflow(type, workflow) {
  if (!type) throw new Error('Workflow type is required');
  if (!workflow?.initial || !workflow?.states || !Array.isArray(workflow?.transitions)) {
    throw new Error(`Workflow ${type} requires initial, states, and transitions`);
  }
  workflows.set(type, Object.freeze({ ...workflow }));
  return getWorkflow(type);
}

export function getWorkflow(type) {
  return workflows.get(type) || null;
}

export function listWorkflows() {
  return Array.from(workflows.entries()).map(([type, workflow]) => ({ type, workflow }));
}

export function validateTransition({ workflow, currentState, currentStatus = null, targetState, role, actorId = null, lifecycle = {} }) {
  if (!workflow) return { ok: false, reason: 'workflow_missing' };
  const from = currentState || workflow.initial;
  const transition = workflow.transitions.find(item => item.from === from && item.to === targetState);
  const stateDefinition = workflow.states[targetState] || {};
  const hasLifecycle = hasLifecyclePayload(lifecycle);
  const selfLoop = from === targetState && (
    workflow.states[from]?.canUpdateMeta ||
    (hasLifecycle && workflow.states[from]?.canUpdateLifecycle !== false && workflow.states[from]?.lifecycle)
  );

  if (!transition && !selfLoop) return { ok: false, reason: 'invalid_transition', from, to: targetState };
  if (transition && role !== 'SYSTEM' && !transition.roles?.includes(role)) {
    return { ok: false, reason: 'role_denied', from, to: targetState, allowedRoles: transition.roles || [] };
  }

  const lifecycleValidation = validateLifecyclePayload(stateDefinition.lifecycle, lifecycle);
  if (!lifecycleValidation.ok) return { ...lifecycleValidation, from, to: targetState };

  const actorValidation = validateActorGuard({
    transition,
    currentStatus,
    targetState,
    actorId,
    role
  });
  if (!actorValidation.ok) return { ...actorValidation, from, to: targetState };

  return { ok: true, from, to: targetState, transition: transition || null };
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

export function validateLifecyclePayload(schema, lifecycle = {}) {
  const normalized = normalizeLifecycle(lifecycle);
  if (!hasLifecyclePayload(normalized)) return { ok: true };
  if (!schema) return { ok: false, reason: 'lifecycle_not_allowed' };

  const allowedActors = Array.isArray(schema.actors) ? schema.actors : [];
  for (const actor of normalized.actors) {
    if (!actor?.userId) return { ok: false, reason: 'invalid_lifecycle_actor' };
    if (actor.capability && allowedActors.length > 0 && !allowedActors.includes(actor.capability)) {
      return { ok: false, reason: 'lifecycle_actor_not_allowed', capability: actor.capability };
    }
  }

  const attachmentSchema = schema.attachments || {};
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

  if (Object.keys(normalized.data).length > 0 && schema.data !== true) {
    return { ok: false, reason: 'lifecycle_data_not_allowed' };
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
      const entity = await entityStore.get(type, id);
      const role = actor?.role || 'SYSTEM';
      const validation = validateTransition({
        workflow,
        currentState: entity?.status?.state,
        targetState,
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
      await entityStore.setStatus(type, id, { state: targetState, userId: actor?.id || 'SYSTEM', metadata, eventId: event?.id || null });

      for (const hook of validation.transition?.hooks || []) {
        if (hooks[hook.handler]) await hooks[hook.handler]({ type, id, actor, metadata }, hook.params || {});
      }

      return { ok: true, event };
    }
  };
}
