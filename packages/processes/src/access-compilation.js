import {
  exposureFieldsOf,
  compileHomeScreenForAssignment,
  compileGrantForAssignment,
  screenAppliesToRole,
  compileScreenForAssignment,
  mergeCompiledScreen,
  screenToNavigation,
  dedupeNavigation,
  requirementHasAuthoredGrant,
  actionTypeId,
  workflowDropsNoOp,
  exposedActionFeature,
  actionExposureRoleIds,
  actionStatusForExposure,
  upsertGrant,
  compileActionAccessWindows,
  buildActionGraphContext,
  effectiveActionParentTypeId,
  actionInputsForExposure,
  resolveEntityFeature,
  compileActionEntityContracts,
  wiringArrivalState,
  normalizeConstruction,
  resolveParentRevision,
  compiledInputPolicy,
  displayActionLabel,
  normalizeActionAccess,
  emptyAssignmentAccess
} from './compiler-core.js';
import { compileScreens } from './screen-compilation.js';
import { projectUiAction } from './ui-contract-projection.js';

export function compileAssignmentAccess({ assignment = {}, roles = {}, screens = {}, actions = {}, lineageBindings = [], domain = {} } = {}) {
  const permissions = {};
  const screenMap = new Map();
  const actionMap = new Map();
  const incompleteBindings = [];
  const roleIds = assignment.roleIds || [];
  for (const roleId of roleIds) {
    const role = roles[roleId];
    if (!role) continue;
    for (const grant of role.grants || []) {
      const compiledGrant = compileGrantForAssignment(grant, assignment);
      if (compiledGrant.incomplete.length) {
        incompleteBindings.push(...compiledGrant.incomplete.map(binding => ({ roleId, feature: grant.feature, binding })));
        continue;
      }
      permissions[grant.feature] ||= [];
      permissions[grant.feature].push(compiledGrant.grant);
    }
    for (const action of role.actions || []) {
      // The manifest action entry is the projected UI contract record; the
      // rich exposure window (status from, feature, contracts) stays in the
      // roles channel for grant derivation and the run API. Its non-projected
      // fields (actionId, typeId, parent context, input policy,
      // relation mutation) ride along under their legacy keys so the legacy
      // renderer surfaces and the server manifest consumers keep working;
      // the projected keys stay authoritative.
      const projected = projectUiAction(action);
      const actionId = action.actionId || action.id;
      const existing = actionMap.get(actionId) || {};
      actionMap.set(actionId, {
        ...existing,
        ...(projected || { ...action, id: actionId }),
        ...exposureFieldsOf(action),
        sourceRoleIds: [...new Set([...(existing.sourceRoleIds || []), roleId])]
      });
    }
  }
  for (const screen of Object.values(screens)) {
    const sourceRoleIds = roleIds.filter(roleId => screenAppliesToRole(screen, roleId));
    if (!sourceRoleIds.length) continue;
    for (const roleId of sourceRoleIds) {
      const compiledScreen = compileScreenForAssignment(screen, assignment, roleId);
      if (compiledScreen.incomplete.length) {
        incompleteBindings.push(...compiledScreen.incomplete.map(binding => ({ roleId, screenId: screen.id, binding })));
        continue;
      }
      if (![screen.required, ...(screen.sources || []).map(source => source.required)].every(required => requirementHasAuthoredGrant(required, permissions))) continue;
      mergeCompiledScreen(screenMap, compiledScreen.screen);
    }
  }
  const screensList = [...screenMap.values()];
  const homeScreen = compileHomeScreenForAssignment({ assignment, screens: screensList, lineageBindings, domain });
  const userScreens = homeScreen ? [homeScreen, ...screensList] : screensList;
  // Detail screens stay paired with their list screen: they open by entity
  // context and never appear as duplicate top-level destinations.
  const screenNavigation = userScreens
    .filter(screen => screen.placement !== 'detail')
    .map(screenToNavigation);
  return {
    roleIds,
    permissions,
    navigation: dedupeNavigation(screenNavigation),
    screens: userScreens,
    actions: [...actionMap.values()],
    incompleteBindings
  };
}

export function compileRoles(process = {}, domain = {}, organizationRoles = {}, lineageBindings = [], workflows = {}) {
  const graphContext = buildActionGraphContext(process);
  const workflowByType = {};
  for (const [producerOutputId, workflow] of Object.entries(workflows || {})) {
    const typeId = process.producerOutputs?.[producerOutputId]?.typeId;
    if (typeId && !workflowByType[typeId]) workflowByType[typeId] = workflow;
  }
  const roles = Object.fromEntries(Object.entries(organizationRoles).map(([roleId, role]) => [roleId, {
    id: role.id || roleId,
    label: role.label || role.id || roleId,
    grants: Array.isArray(process.roleGrants?.[roleId]) ? [...process.roleGrants[roleId]] : [],
    actions: []
  }]));
  for (const profile of Object.values(process.producerOutputs || {})) {
    const feature = resolveEntityFeature(domain, profile.typeId);
    for (const level of ['read', 'write', 'admin']) {
      for (const roleId of profile.allowedRoles?.[level] || []) {
        if (!roles[roleId]) continue;
        roles[roleId].grants ||= [];
        // The authored entity type rides on the grant so screen inference
        // resolves the type the graph actually produces; the feature alone
        // cannot distinguish types sharing one collection (org file-class
        // types all project onto one shared collection).
        upsertGrant(roles[roleId].grants, { feature, level, ...(profile.typeId ? { typeId: profile.typeId } : {}) });
      }
    }
  }
  const actionWindows = compileActionAccessWindows(process, domain, lineageBindings);
  for (const [actionId, action] of Object.entries(process.actions || {})) {
    const access = normalizeActionAccess(action.access);
    const actionWindow = actionWindows.get(actionId);
    const actionTypeId = action.typeId || action.inputs?.find(input => input.typeId)?.typeId || actionWindow?.outputs?.[0]?.typeId || '';
    for (const grant of actionWindow?.grants || []) {
      for (const roleId of grant.roleIds || []) {
        if (!roles[roleId]) continue;
        roles[roleId].grants ||= [];
        upsertGrant(roles[roleId].grants, actionTypeId ? { ...grant, typeId: actionTypeId } : grant);
      }
    }
    if ((action.trigger?.mode || 'manual') !== 'manual') continue;
    const exposedRoleIds = actionExposureRoleIds(action, access, actionWindow);
    for (const roleId of exposedRoleIds) {
      if (!roles[roleId]) continue;
      const feature = exposedActionFeature(action, actionWindow, access, domain);
      const parentTypeId = effectiveActionParentTypeId(action, graphContext.parentIncomingByActionId.get(actionId), lineageBindings);
      const resolvedTypeId = action.typeId || action.inputs?.find(input => input.typeId)?.typeId || actionWindow?.outputs?.[0]?.typeId || null;
      const exposedAction = resolvedTypeId && !action.typeId ? { ...action, typeId: resolvedTypeId } : action;
      if (action.relationMutation?.creator?.typeId) {
        const creatorScope = actionWindow?.grants
          ?.find(grant => grant.roleIds?.includes(roleId))?.scope;
        upsertGrant(roles[roleId].grants, {
          feature: resolveEntityFeature(domain, action.relationMutation.creator.typeId),
          level: 'write',
          ...(creatorScope ? { scope: creatorScope } : {})
        });
      }
      if (action.relationMutation?.operation === 'link') {
        // Entry-level contract: the link reads any accepted target type of
        // the relation entry, so each accepted type's feature is granted.
        for (const targetTypeId of [].concat(action.relationMutation.targetTypes || [])) {
          upsertGrant(roles[roleId].grants, {
            feature: resolveEntityFeature(domain, targetTypeId),
            level: 'read'
          });
        }
      }
      const inputs = actionInputsForExposure(exposedAction, parentTypeId, domain).map(input => (
        input.id === 'entity' && !input.typeId && resolvedTypeId ? { ...input, typeId: resolvedTypeId } : input
      ));
      const outputs = action.outputs || [];
      const exposureState = actionStatusForExposure(
        action,
        actionWindow,
        access,
        process,
        wiringArrivalState(actionId, exposedAction, resolvedTypeId, graphContext, actionWindows)
      );
      // The machine is the authority: a status-mutating action whose edge
      // the machine did not declare (a no-op arrival-to-target pair) is not
      // exposed, so no surface offers a transition execution would refuse.
      if ((action.actionKind || 'createEntity') === 'updateEntity' && exposureState.to
        && workflowDropsNoOp(workflowByType[resolvedTypeId], exposureState.from, exposureState.to)) {
        continue;
      }
      roles[roleId].actions.push({
        actionId: action.id || actionId,
        label: displayActionLabel(action, actionId, process, domain),
        level: 'run',
        actionKind: action.actionKind || 'createEntity',
        commandId: action.commandId || null,
        feature,
        typeId: resolvedTypeId,
        parentTypeId: parentTypeId || null,
        parentRevision: resolveParentRevision(action.parentRevision, parentTypeId, domain),
        state: exposureState,
        relationMutation: action.relationMutation || null,
        construction: (action.actionKind || 'createEntity') === 'createEntity'
          ? normalizeConstruction(action.construction, action.typeId, domain)
          : null,
        inputPolicy: compiledInputPolicy(action, domain),
        inputs,
        outputs,
        contracts: compileActionEntityContracts(exposedAction, inputs, outputs, actionWindow, domain)
      });
    }
  }
  return roles;
}

// Entering a state lands on its initial child, so a status action whose
// arrival leaf equals its target leaf moves nowhere: it is a no-op, not a
// transition, and belongs to neither the execution channel nor the manifest.
