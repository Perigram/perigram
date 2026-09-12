import { resolveRoleAssignmentAccess } from '#packages/processes/src/index.js';
import { hasPermissionGrant, normalizePermissionGrants } from './access-control.js';
import { canDisplayEntityField, getActiveEntityFieldPolicyEntries } from './entity-field-access.js';

const OWNER_RECOVERY_PERMISSIONS = {
  organizations: { level: 'admin' },
  users: { level: 'admin' }
};

export function previewAssignmentAccess({ compiled = {}, assignment = {}, domain = {}, contexts = [], membership = null } = {}) {
  const access = resolveRoleAssignmentAccess({ compiled, assignment: { status: 'active', ...assignment }, domain });
  const ownerRecovery = membership?.owner === true && !['pending', 'rejected'].includes(membership.status);
  const permissions = ownerRecovery
    ? { ...access.permissions, ...OWNER_RECOVERY_PERMISSIONS }
    : access.permissions;
  const entityContexts = Array.isArray(contexts) ? contexts : [];
  const features = [...new Set([...(domain.entities || []).map(entity => featureForEntityType(domain, entity.type)), ...Object.keys(permissions)])];
  const entities = features.map(feature => {
    const value = permissions[feature];
    const grants = normalizePermissionGrants(value);
    const entityType = entityTypeForFeature(domain, feature);
    const context = entityContexts.find(item => item.entityType === entityType || item.feature === feature) || null;
    const conditional = grants.some(grant => grant.scope || grant.rule || grant.transitions || grant.actions);
    const allowed = context
      ? hasPermissionGrant({ permissions, feature, level: 'read', ...evaluationContext(context, entityType) })
      : conditional ? null : hasPermissionGrant({ permissions, feature, level: 'read', entityType });
    return {
      key: `entity:${feature}`,
      feature,
      entityType,
      allowed,
      explanation: decisionExplanation(allowed, conditional, context),
      fields: entityType ? fieldPreview({ entityType, context, permissions, fieldPolicies: compiled.fieldPolicies || {} }) : []
    };
  });
  const transitions = Object.entries(compiled.workflows || {}).flatMap(([entityType, workflow]) =>
    Object.values(workflow.regions || {}).flatMap(region => (region.transitions || []).map(transition => {
      const feature = featureForEntityType(domain, entityType);
      const context = entityContexts.find(item => item.entityType === entityType || item.feature === feature) || null;
      const selected = (transition.processRoleIds || transition.access?.processRoleIds || []).some(roleId => access.roleIds.includes(roleId));
      const allowed = selected && context
        ? hasPermissionGrant({ permissions, feature, level: 'write', transition, ...evaluationContext(context, entityType) })
        : selected ? null : false;
      return {
        key: `transition:${entityType}:${transition.from}->${transition.to}`,
        entityType,
        transition: `${transition.from}->${transition.to}`,
        allowed,
        explanation: selected ? decisionExplanation(allowed, true, context) : 'Denied because none of the selected roles authorizes this transition.'
      };
    }))
  );
  const selectedActions = new Map((access.actions || []).map(action => [action.actionId, action]));
  const allActions = new Map(Object.values(compiled.roles || {}).flatMap(role => role.actions || []).map(action => [action.actionId, action]));
  const actions = [...allActions.values()].map(candidate => {
    const action = selectedActions.get(candidate.actionId) || candidate;
    const feature = action.feature || featureForEntityType(domain, action.entityType);
    const context = entityContexts.find(item => item.entityType === action.entityType || item.feature === feature) || null;
    const actionName = accessActionName(action.actionKind);
    const conditional = normalizePermissionGrants(permissions[feature]).some(grant => grant.scope || grant.rule || grant.transitions || grant.actions);
    const selected = selectedActions.has(candidate.actionId);
    const allowed = !selected ? false : context
      ? hasPermissionGrant({ permissions, feature, level: 'write', action: actionName, transition: action.status, ...evaluationContext(context, action.entityType) })
      : conditional ? null : true;
    return { ...action, key: `action:${action.actionId}`, allowed, explanation: selected ? decisionExplanation(allowed, conditional, context) : 'Denied because none of the selected roles exposes this action.' };
  });
  const allowedScreens = new Map((access.screens || []).map(screen => [screen.id, screen]));
  const screens = Object.values(compiled.screens || {}).map(screen => {
    const allowedScreen = allowedScreens.get(screen.id);
    const missing = access.incompleteBindings.filter(item => item.screenId === screen.id).map(item => item.binding);
    if (!allowedScreen) {
      return { ...screen, allowed: false, explanation: missing.length ? `Denied because assignment bindings are missing: ${[...new Set(missing)].join(', ')}.` : 'Denied because selected roles do not supply the separately authored required capability.' };
    }
    const requirements = [allowedScreen.required, ...(allowedScreen.sources || []).map(source => source.required)].filter(required => required?.feature);
    const decisions = requirements.map(required => {
      const entityType = entityTypeForFeature(domain, required.feature);
      const context = entityContexts.find(item => item.entityType === entityType || item.feature === required.feature) || null;
      const conditional = normalizePermissionGrants(permissions[required.feature]).some(grant => grant.scope || grant.rule || grant.transitions || grant.actions);
      const actions = Object.entries(required.actions || {}).filter(([, enabled]) => enabled === true).map(([action]) => action);
      if (conditional && !context) return null;
      const args = { permissions, feature: required.feature, level: required.level || 'read', ...(context ? evaluationContext(context, entityType) : { entityType }) };
      return actions.length ? actions.every(action => hasPermissionGrant({ ...args, action })) : hasPermissionGrant(args);
    });
    const allowed = decisions.includes(false) ? false : decisions.includes(null) ? null : true;
    return { ...allowedScreen, allowed, explanation: decisionExplanation(allowed, decisions.includes(null), allowed === null ? null : {}) };
  });
  return {
    roleIds: access.roleIds,
    permissions,
    entities,
    transitions,
    actions,
    screens,
    incompleteBindings: access.incompleteBindings,
    ownerRecovery: ownerRecovery
      ? { applied: true, permissions: OWNER_RECOVERY_PERMISSIONS, explanation: 'Organization and team administration are restored by the active owner membership, not by a process role.' }
      : { applied: false, permissions: {}, explanation: 'No active owner-membership recovery overlay applies.' }
  };
}

function fieldPreview({ entityType, context, permissions, fieldPolicies }) {
  const entity = context?.entity || (context ? contextEntity(context, entityType) : null);
  const auth = { effectivePermissions: permissions, fieldPolicies };
  return getActiveEntityFieldPolicyEntries(entityType, auth).map(field => {
    const allowed = context ? canDisplayEntityField({ auth, entity, entityType, field }) : null;
    return {
      ...field,
      allowed,
      explanation: allowed === true
        ? `Allowed by ${field.feature}:${field.level} and the compiled field policy.`
        : allowed === false
          ? `Denied by ${field.feature}:${field.level} or the compiled field policy for the supplied context.`
          : 'Unresolved until an entity context is supplied to the compiled field policy.'
    };
  });
}

function evaluationContext(context = {}, entityType = '') {
  return {
    entity: context.entity || contextEntity(context, entityType),
    entityType,
    context: { ...(context.context || {}), lineageEntities: context.lineageEntities || {} }
  };
}

function contextEntity(context = {}, entityType = '') {
  return {
    _id: context.entityId,
    entityType,
    lineage: context.lineage || {},
    status: context.status ? { state: { primary: context.status } } : undefined,
    ...(context.fields || {})
  };
}

function decisionExplanation(allowed, conditional, context) {
  if (allowed === true) return 'Allowed by the compiled additive grants for the supplied entity, status, lineage, action, and transition context.';
  if (allowed === false) return 'Denied because no compiled grant satisfies the supplied entity, status, lineage, action, and transition context.';
  if (conditional && !context) return 'Unresolved until an entity, status, lineage, action, or transition context is supplied.';
  return 'Denied because no selected role contributes the required grant.';
}

function accessActionName(actionKind = '') {
  if (actionKind === 'createEntity') return 'create';
  if (actionKind === 'deleteEntity') return 'delete';
  if (actionKind === 'updateEntity' || actionKind === 'archiveEntity') return 'update';
  return 'run';
}

function entityTypeForFeature(domain = {}, feature = '') {
  return (domain.entities || []).find(entity => featureForEntityType(domain, entity.type) === feature)?.type || '';
}

function featureForEntityType(domain = {}, entityType = '') {
  const entity = (domain.entities || []).find(item => item.type === entityType);
  return entity?.collection || domain.fieldAccess?.[entityType]?.feature || entityType;
}
