import { createError } from 'h3';
import { actionToLevel, normalizePermissionGrants } from '#shared/access-control.js';

// Action execution permissions are derived from the compiled action contract.
// The feature domain is injected so this policy helper does not own domain
// composition or persistence.
export function createActionExecutionAuthHelpers({ getDomain, normalizeTypeId, getEntityFieldAccessPolicy, getCommandDefinition }) {
  function assertCompiledActionAvailable(actionId, auth = {}) {
    const available = auth.roleAssignments?.actions || [];
    // The assignment manifest carries full action records keyed `id`; the
    // lean exposure shape used `actionId`. Both identify the same action.
    if (!available.some(action => (action.actionId ?? action.id) === actionId)) {
      throw createError({ statusCode: 403, message: `Action ${actionId} is not available to the current process role` });
    }
  }
  
  function resolveActionTypeId(action = {}) {
    if (action.actionKind === 'runCommand') return normalizeTypeId(action.typeId || '');
    return normalizeTypeId(action.typeId || action.inputs?.find(input => input.typeId)?.typeId || '');
  }
  
  function createActionExecutionAuth(auth = {}, action = {}, { relationContracts = null, featureForType = null, featureOverride = null } = {}) {
    const resolveFeature = featureForType || resolveInstanceFeature;
    const feature = featureOverride || resolveFeature(resolveActionTypeId(action));
    const permissions = {
      ...(auth.effectivePermissions || {})
    };
    if (feature) {
      const actions = executionActionsForAction(action);
      const primaryAction = Object.keys(actions).find(name => !['view', 'edit'].includes(name)) || 'create';
      appendExecutionGrant(permissions, feature, {
        level: action.access?.level || actionToLevel(primaryAction, 'write'),
        actions
      });
    }
    for (const grant of commandExecutionGrants(action)) {
      appendExecutionGrant(permissions, grant.feature, {
        level: grant.level || 'read',
        actions: grant.actions || { view: true }
      });
    }
    for (const source of constructionSourceGrants(action, relationContracts, resolveFeature)) {
      appendExecutionGrant(permissions, source.feature, {
        level: source.level,
        actions: source.actions
      });
    }
    // An authored unlink-delete relation action is the authorization
    // boundary for deleting its accepted target. Carry that narrow grant
    // into the effect context; the target service still reloads and scopes
    // the actual record before deleting it.
    if (action.relationMutation?.operation === 'unlink' && action.relationMutation?.unlink === 'delete') {
      for (const targetTypeId of [].concat(action.relationMutation.targetTypes || [])) {
        appendExecutionGrant(permissions, resolveFeature(targetTypeId), {
          level: 'admin',
          actions: { view: true, delete: true }
        });
      }
    }
    return {
      ...auth,
      effectivePermissions: permissions
    };
  }
  
  function createRelationLinkExecutionAuth(auth = {}, action = {}, ownerType = '') {
    const executionAuth = createActionExecutionAuth(auth, action);
    const permissions = {
      ...(executionAuth.effectivePermissions || {})
    };
    appendExecutionGrant(permissions, resolveInstanceFeature(ownerType), {
      level: 'write',
      actions: { update: true, edit: true }
    });
    return {
      ...executionAuth,
      effectivePermissions: permissions
    };
  }
  
  function commandExecutionGrants(action = {}) {
    if (action.actionKind !== 'runCommand' || !action.commandId) return [];
    const command = getCommandDefinition?.(action.commandId);
    // The command's own permission rows ride beside its executionGrants:
    // the action a user authorized owns every gate its command declares.
    return [...(command?.access?.permissions || []), ...(command?.access?.executionGrants || [])]
      .filter(grant => grant?.feature)
      .map(grant => ({ level: grant.level || 'read', actions: grant.actions || { view: true }, feature: grant.feature }));
  }
  
  function executionActionsForAction(action = {}) {
    if (action.actionKind === 'runCommand') return { run: true };
    if (action.actionKind === 'updateEntity') return { view: true, update: true, edit: true };
    if (action.actionKind === 'archiveEntity') return { view: true, update: true, edit: true, archive: true };
    if (action.actionKind === 'deleteEntity') return { view: true, delete: true };
    return { create: true };
  }
  
  function appendExecutionGrant(permissions, feature, grant) {
    if (!feature) return;
    permissions[feature] = [
      ...normalizePermissionGrants(permissions[feature]),
      grant
    ];
  }
  
  function constructionSourceGrants(action = {}, relationContracts = null, resolveFeature = resolveInstanceFeature) {
    const sources = [];
    if (action.parentTypeId) {
      sources.push({ typeId: action.parentTypeId, level: 'read', actions: { view: true } });
    }
    // Declared relation targets are the action's own validated inputs: the
    // execution auth grants their read, or the write fails against the very
    // target check the action itself runs. At the effect boundary the
    // contracts arrive resolved (the authored record carries no compiled
    // mutation); compiled-action callers keep reading their own.
    for (const contract of [...(relationContracts || []), ...(action.mutation?.relationContracts || [])]) {
      sources.push({ typeId: contract.targetType, level: 'read', actions: { view: true } });
    }
    for (const field of [
      ...(action.construction?.inputs || []),
      ...(action.inputPolicy?.fields || []),
      ...(action.inputs || [])
    ]) {
      if (field?.typeId && (field.type === 'entity' || field.kind === 'entity' || field.relationKey || field.id === 'parent')) {
        sources.push({ typeId: field.typeId, level: field.access?.level || 'read', actions: { view: true } });
      }
    }
    const seen = new Set();
    return sources.flatMap(source => {
      const feature = resolveFeature(source.typeId);
      const key = `${feature}:${source.level}`;
      if (!feature || seen.has(key)) return [];
      seen.add(key);
      return [{ ...source, feature }];
    });
  }
  
  function resolveActionFeature(action = {}) {
    return resolveInstanceFeature(resolveActionTypeId(action));
  }
  
  function resolveInstanceFeature(typeId = '', domainOverride = null) {
    typeId = normalizeTypeId(typeId);
    const domain = domainOverride || getDomain();
    const entity = (domain?.entities || []).find(item => item.id === typeId || item.type === typeId);
    const fieldPolicy = getEntityFieldAccessPolicy(typeId);
    if (fieldPolicy?.feature) return fieldPolicy.feature;
    if (entity?.feature) return entity.feature;
    if (entity?.collection) return entity.collection;
    return typeId;
  }
  

  return {
    assertCompiledActionAvailable,
    resolveActionTypeId,
    createActionExecutionAuth,
    createRelationLinkExecutionAuth,
    resolveInstanceFeature
  };
}
