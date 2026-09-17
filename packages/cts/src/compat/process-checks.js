// Declaration-check phase (SPEC §12 at the seam): runs before the process
// compiler's own graph validation. The compiler checks the graph (sockets,
// availability, lineage); this phase checks the DECLARATIONS the graph
// touches against a CTS registry view:
//   - every referenced entityType exists in the org view
//   - status transitions target declared states of that type
//   - field paths land inside real rows — but only for types whose rows are
//     extracted; strangler rows quarantined as `legacy`/`specs` Json skip
//     field checks (checking against a quarantine would be pure noise).
// Best-effort by design (v1): unknown record shapes pass silently; tighten
// by teaching the walker new record kinds, never by loosening checks.
export function checkDeclarationsAgainstCts(processDefinition = {}, registry, organizationId = null) {
  const errors = [];
  const view = registry?.resolveView ? registry.resolveView(organizationId) : new Map();
  const statesByType = new Map();
  const rowPathsByType = new Map();
  for (const type of view.values()) {
    if (type.states?.main?.values) statesByType.set(type.id, new Set(type.states.main.values));
    rowPathsByType.set(type.id, extractableRowPaths(type));
  }

  const data = processDefinition?.data || processDefinition || {};

  for (const [producerOutputId, output] of Object.entries(data.producerOutputs || {})) {
    if (output?.entityType && !view.has(output.entityType)) {
      errors.push(`Producer output ${producerOutputId} references unknown type ${output.entityType}`);
    }
  }
  for (const [socketId, socket] of Object.entries(data.sockets || {})) {
    const entityType = socket?.type?.entityType || socket?.entityType;
    if (entityType && !view.has(entityType)) {
      errors.push(`Socket ${socketId} references unknown type ${entityType}`);
    }
  }

  walk(data, (node, path) => {
    if (!node || typeof node !== 'object') return;
    const entityType = typeof node.entityType === 'string' ? node.entityType : null;
    if (entityType && !view.has(entityType) && !path.startsWith('producerOutputs') && !path.startsWith('sockets')) {
      errors.push(`${path} references unknown type ${entityType}`);
    }
    if (!entityType || !statesByType.has(entityType)) return;
    const states = statesByType.get(entityType);
    for (const key of ['status', 'targetStatus', 'statusTo', 'toState', 'to']) {
      const value = node[key];
      if (typeof value === 'string' && value && !states.has(value)) {
        errors.push(`${path} moves ${entityType} to undeclared state ${value}`);
      }
    }
    const rowPaths = rowPathsByType.get(entityType);
    if (rowPaths) {
      for (const key of ['field', 'fieldPath']) {
        const fieldPath = node[key];
        if (typeof fieldPath === 'string' && fieldPath && !rowPaths.has(rootPath(fieldPath))) {
          errors.push(`${path} uses field ${fieldPath} outside the ${entityType} row`);
        }
      }
    }
  });

  return errors;
}

function extractableRowPaths(type = {}) {
  const fields = Object.entries(type.fields || {}).filter(([, descriptor]) => descriptor.base !== 'json');
  if (!fields.length) return null; // quarantined strangler row: skip field checks
  return new Set(fields.map(([name]) => name));
}

function rootPath(path = '') {
  return String(path).replace(/^fields\./, '').split(/[.[/]/)[0];
}

function walk(value, visit, path = 'definition') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visit, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  visit(value, path);
  for (const [key, item] of Object.entries(value)) {
    if (item && typeof item === 'object') walk(item, visit, `${path}.${key}`);
  }
}
