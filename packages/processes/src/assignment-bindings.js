const ASSIGNMENT_PATTERN = /\$assignment\.([A-Za-z0-9_.-]+)/g;

export function discoverAssignmentBindingRequirements({ process = {}, roleIds = [], bindings = {} } = {}) {
  const data = process?.data && typeof process.data === 'object' ? process.data : process;
  const selectedRoles = new Set(Array.isArray(roleIds) ? roleIds : [roleIds].filter(Boolean));
  const requirements = new Map();
  const collect = (value, location, expectedType = null) => collectRequirements(value, location, expectedType, requirements, bindings);

  for (const [roleId, grants] of Object.entries(data.roleGrants || {})) {
    if (!selectedRoles.has(roleId)) continue;
    collect(grants, `roleGrants.${roleId}`);
  }
  for (const [actionId, action] of Object.entries(data.actions || {})) {
    const grants = action.access?.grants || [];
    for (const [index, grant] of grants.entries()) {
      if (!selectedRoles.has(grant?.roleId)) continue;
      collect(grant.scope, `actions.${actionId}.access.grants.${index}.scope`);
      collect(grant.transitions, `actions.${actionId}.access.grants.${index}.transitions`);
      collect(grant.rule, `actions.${actionId}.access.grants.${index}.rule`);
      collect(grant.actions, `actions.${actionId}.access.grants.${index}.actions`);
    }
    if ((action.access?.roleIds || []).some(roleId => selectedRoles.has(roleId))) {
      collect(action.access?.scope, `actions.${actionId}.access.scope`);
      collect(action.access?.rule, `actions.${actionId}.access.rule`);
    }
  }
  for (const [nodeId, node] of Object.entries(data.processNodes || {})) {
    for (const [index, grant] of (node.access?.grants || []).entries()) {
      if (!selectedRoles.has(grant?.roleId)) continue;
      collect(grant, `processNodes.${nodeId}.access.grants.${index}`);
    }
  }
  for (const [screenId, screen] of Object.entries(data.screens || {})) {
    if (screen.roleIds?.length && !screen.roleIds.some(roleId => selectedRoles.has(roleId))) continue;
    collect(screen.route, `screens.${screenId}.route`, 'string');
    collect(screen.scope, `screens.${screenId}.scope`);
    collect(screen.bindings, `screens.${screenId}.bindings`);
    collect(screen.required, `screens.${screenId}.required`);
    for (const [index, source] of (screen.sources || []).entries()) {
      collect(source.identifier, `screens.${screenId}.sources.${index}.identifier`, 'string');
      collect(source.filters, `screens.${screenId}.sources.${index}.filters`);
      collect(source.required, `screens.${screenId}.sources.${index}.required`);
    }
  }

  return [...requirements.values()].sort((left, right) => left.key.localeCompare(right.key));
}

function collectRequirements(value, location, expectedType, requirements, bindings) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectRequirements(item, `${location}.${index}`, expectedType, requirements, bindings));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const childType = comparatorValueType(value, key) || expectedType;
      collectRequirements(child, `${location}.${key}`, childType, requirements, bindings);
    }
    return;
  }
  if (typeof value !== 'string') return;
  for (const match of value.matchAll(ASSIGNMENT_PATTERN)) {
    const key = match[1];
    const bound = getByPath(bindings, key);
    const inferredType = scalarType(bound) || expectedType || 'string';
    const existing = requirements.get(key) || {
      key,
      label: key.replace(/([A-Z])/g, ' $1').replace(/[._-]+/g, ' ').trim() || key,
      type: inferredType,
      locations: []
    };
    if (existing.type === 'string' && inferredType !== 'string') existing.type = inferredType;
    if (!existing.locations.includes(location)) existing.locations.push(location);
    requirements.set(key, existing);
  }
}

function comparatorValueType(parent, key) {
  if (!['equals', 'notEquals', 'includes', 'atLeast'].includes(key)) return null;
  return scalarType(parent[key]);
}

function scalarType(value) {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string' && value) return 'string';
  return null;
}

function getByPath(source = {}, path = '') {
  return String(path).split('.').filter(Boolean).reduce((value, key) => value?.[key], source);
}
