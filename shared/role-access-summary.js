// Annotated derived role access summary.
//
// Derives the effective process access of a set of organization role ids from
// the process definition data (semantic records plus, when present, the
// activated `compiled` contract) and annotates every line with the record that
// contributed it. Contributor kinds:
// - `authored-grant`: an explicitly authored record (entity profile
//   allowedRoles, action access, or workflow transition role access).
// - `screen-requirement`: a screen consumes an independently authored grant;
//   its layout never creates backend capability.
// - `rule`: the contribution is conditioned by a status window/rule on the
//   authored action access.
// - `level-fallback`: no level was authored, so the displayed level is the
//   default fallback instead of an authored value.

const VALID_LEVELS = ['read', 'write', 'admin'];
const SUMMARY_GROUPS = ['profiles', 'screens', 'actions', 'transitions'];

export function deriveRoleAccessSummary({ process = {}, roleIds = [] } = {}) {
  const data = process?.data && typeof process.data === 'object' ? process.data : process;
  const roles = Array.isArray(roleIds) ? roleIds : [roleIds].filter(Boolean);
  return {
    profiles: [...profileAccessLines(data, roles), ...roleGrantAccessLines(data, roles)],
    screens: screenAccessLines(data, roles),
    actions: actionAccessLines(data, roles),
    transitions: transitionAccessLines(data, roles)
  };
}

function roleGrantAccessLines(data = {}, roleIds = []) {
  return dedupeLines(roleIds.flatMap(roleId => (data.roleGrants?.[roleId] || []).map((grant, index) => ({
    key: `role-grant:${roleId}:${grant.feature}:${index}`,
    text: grantText(grant.feature, grant),
    contributor: {
      kind: grant.rule || grant.scope || grant.transitions || grant.actions ? 'rule' : 'authored-grant',
      ref: `roleGrants.${roleId}.${index}`,
      label: `authored role grant for ${grant.feature}`
    }
  }))));
}

export function flattenRoleAccessSummary(summary = {}) {
  return SUMMARY_GROUPS.flatMap(group => summary[group] || []);
}

function profileAccessLines(data = {}, roleIds = []) {
  const lines = [];
  for (const [profileId, profile] of Object.entries(data.entityProfiles || {})) {
    for (const level of VALID_LEVELS) {
      if (!(profile.allowedRoles?.[level] || []).some(roleId => roleIds.includes(roleId))) continue;
      lines.push({
        key: `profile:${profile.typeId}:${level}`,
        text: `${profile.typeId}:${level}`,
        contributor: {
          kind: 'authored-grant',
          ref: `entityProfiles.${profileId}.allowedRoles.${level}`,
          label: `entity profile ${profile.label || profile.typeId || profileId}`
        }
      });
    }
  }
  return dedupeLines(lines);
}

function screenAccessLines(data = {}, roleIds = []) {
  const lines = [];
  for (const [screenId, screen] of Object.entries(data.screens || {})) {
    if (!screenAppliesToRoles(screen, roleIds)) continue;
    const required = screen.required || null;
    const name = screen.label || screen.id || screenId;
    lines.push({
      key: `screen:${screen.id || screenId}`,
      text: required?.feature ? grantText(required.feature, required) : `${screen.id || screenId}:screen`,
      contributor: required?.feature
        ? {
            kind: 'screen-requirement',
            ref: `screens.${screenId}.required`,
            label: `screen ${name} consumes separately authored access`
          }
        : {
            kind: 'level-fallback',
            ref: `screens.${screenId}.roleIds`,
            label: `screen ${name} role list (no required access level authored)`
          }
    });
  }
  return dedupeLines(lines);
}

function actionAccessLines(data = {}, roleIds = []) {
  const lines = [];
  for (const [actionId, action] of Object.entries(data.actions || {})) {
    if (!actionRoleIds(action.access).some(roleId => roleIds.includes(roleId))) continue;
    const typeId = actionTypeId(action);
    if (action.actionKind === 'updateEntity' && !typeId) continue;
    const name = action.label || action.id || actionId;
    const authoredLevel = action.access?.level;
    const level = VALID_LEVELS.includes(authoredLevel) ? authoredLevel : 'write';
    const status = actionTargetStatus(action);
    const subject = typeId || name || action.actionKind;
    const matchingGrant = (action.access?.grants || []).find(grant => roleIds.includes(grant?.roleId));
    const text = [
      grantText(subject, { ...action.access, ...matchingGrant, level: matchingGrant?.level || level }),
      status ? `when ${status}` : ''
    ].filter(Boolean).join(' ');
    lines.push({
      key: `action:${actionId}`,
      text,
      contributor: status
        ? {
            kind: 'rule',
            ref: `actions.${actionId}.access`,
            label: `action ${name} access with status window ${status}`
          }
        : VALID_LEVELS.includes(authoredLevel)
          ? {
              kind: 'authored-grant',
              ref: `actions.${actionId}.access`,
              label: `action ${name} access`
            }
          : {
              kind: 'level-fallback',
              ref: `actions.${actionId}.access`,
              label: `action ${name} access (level defaulted to ${level})`
            }
    });
  }
  return dedupeLines(lines);
}

function grantText(subject, grant = {}) {
  const dimensions = [
    grant.scope ? 'scoped' : '',
    grant.actions ? 'actions' : '',
    grant.transitions ? 'transitions' : '',
    grant.rule ? 'rule' : ''
  ].filter(Boolean);
  return `${subject}:${grant.level || 'read'}${dimensions.length ? ` [${dimensions.join(', ')}]` : ''}`;
}

function transitionAccessLines(data = {}, roleIds = []) {
  const lines = [];
  for (const [typeId, workflow] of Object.entries(data.compiled?.workflows || {})) {
    collectWorkflowTransitionLines(lines, typeId, workflow, roleIds, `compiled.workflows.${typeId}`);
  }
  for (const [profileId, profile] of Object.entries(data.entityProfiles || {})) {
    const workflow = profile.lifecycle?.mode === 'custom' ? profile.lifecycle?.workflow : null;
    if (!workflow) continue;
    collectWorkflowTransitionLines(lines, profile.typeId, workflow, roleIds, `entityProfiles.${profileId}.lifecycle.workflow`);
  }
  return dedupeLines(lines);
}

function collectWorkflowTransitionLines(lines, typeId, workflow = {}, roleIds = [], refBase = '') {
  for (const [regionId, region] of Object.entries(workflow.regions || {})) {
    for (const transition of region.transitions || []) {
      const accessRoleIds = transition.processRoleIds || transition.access?.processRoleIds || [];
      if (!accessRoleIds.some(roleId => roleIds.includes(roleId))) continue;
      lines.push({
        key: `transition:${typeId}:${transition.from}->${transition.to}`,
        text: `${typeId}:${transition.from}->${transition.to}`,
        contributor: {
          kind: 'authored-grant',
          ref: `${refBase}.regions.${regionId}.transitions`,
          label: `workflow transition ${typeId} ${transition.from}->${transition.to} role access`
        }
      });
    }
  }
}

function actionRoleIds(access = {}) {
  return [...new Set([
    ...(Array.isArray(access.roleIds) ? access.roleIds : []),
    ...(Array.isArray(access.grants) ? access.grants.map(grant => grant?.roleId).filter(Boolean) : [])
  ])];
}

function actionTypeId(action = {}) {
  return action.typeId
    || action.outputs?.find(output => output.typeId)?.typeId
    || action.inputs?.find(input => input.typeId)?.typeId
    || '';
}

function actionTargetStatus(action = {}) {
  return action.access?.stateTo
    || action.state?.to
    || action.outputs?.find(output => typeof output.status === 'string')?.status
    || '';
}

function screenAppliesToRoles(screen = {}, roleIds = []) {
  return !screen.roleIds?.length || roleIds.some(roleId => screen.roleIds.includes(roleId));
}

function dedupeLines(lines = []) {
  const seen = new Set();
  return lines.filter(line => {
    if (seen.has(line.key)) return false;
    seen.add(line.key);
    return true;
  });
}
