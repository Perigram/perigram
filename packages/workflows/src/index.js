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

export function validateTransition({ workflow, currentState, targetState, role }) {
  if (!workflow) return { ok: false, reason: 'workflow_missing' };
  const from = currentState || workflow.initial;
  const transition = workflow.transitions.find(item => item.from === from && item.to === targetState);
  const selfLoop = from === targetState && workflow.states[from]?.canUpdateMeta;

  if (!transition && !selfLoop) return { ok: false, reason: 'invalid_transition', from, to: targetState };
  if (transition && role !== 'SYSTEM' && !transition.roles?.includes(role)) {
    return { ok: false, reason: 'role_denied', from, to: targetState, allowedRoles: transition.roles || [] };
  }
  return { ok: true, from, to: targetState, transition: transition || null };
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
        role
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
