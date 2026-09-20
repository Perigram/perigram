// Declaration-check phase (SPEC §12 at the seam): runs before the process
// compiler's own graph validation. The compiler checks the graph (sockets,
// availability, lineage); this phase checks the DECLARATIONS the graph
// touches against a CTS registry view:
//   - every referenced entityType exists in the org view
//   - status transitions target declared states of that type
//   - data/specs field paths land inside real rows (slot-aware: node paths
//     are block paths, row names are slot-stripped). Managed blocks
//     (identity/origin/status/lineage/relations/provenance/summary/
//     attachments) belong to their own facets and are not row-checked;
//     `data.value` is the reserved generic payload slot.
// Best-effort by design (v1): unknown record shapes pass silently; tighten
// by teaching the walker new record kinds, never by loosening checks.
import { slotFor } from './field-schema-rows.js';

const RESERVED_GENERIC_SLOT = 'data.value';

export function checkDeclarationsAgainstCts(processDefinition = {}, registry, organizationId = null) {
  const errors = [];
  const view = registry?.resolveView ? registry.resolveView(organizationId) : new Map();
  const statesByType = new Map();
  const rowRootsByType = new Map();
  for (const type of view.values()) {
    if (type.states?.main?.values) statesByType.set(type.id, new Set(type.states.main.values));
    rowRootsByType.set(type.id, allowedFieldRoots(type));
  }

  const data = processDefinition?.data || processDefinition || {};
  // The canvas graph is presentation (Vue Flow node/edge types, positions,
  // viewport) — declaration checks read semantic records only. Walking it
  // would misread card kinds such as `ctsField` as referenced type ids.
  const { graph: _presentation, ...semantic } = data;

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

  walk(semantic, (node, path) => {
    if (!node || typeof node !== 'object') return;
    // v5 records carry `type` (CTS id); v4 records carry storage entity ids.
    // Both normalize to the view's kebab ids.
    const entityType = typeof node.entityType === 'string' ? node.entityType.replace(/_/g, '-')
      : typeof node.type === 'string' ? node.type.replace(/_/g, '-') : null;
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
    const rowRoots = rowRootsByType.get(entityType);
    if (rowRoots) {
      for (const key of ['field', 'fieldPath']) {
        const fieldPath = node[key];
        const root = fieldRoot(String(fieldPath || ''));
        if (root && !rowRoots.has(root)) {
          errors.push(`${path} uses field ${fieldPath} outside the ${entityType} row`);
        }
      }
    }
  });

  return errors;
}

function allowedFieldRoots(type = {}) {
  const fields = Object.entries(type.fields || {});
  if (!fields.length) return null; // no declared rows: generic payload, not row-checked
  const roots = new Set([RESERVED_GENERIC_SLOT]);
  for (const [name, descriptor] of fields) {
    roots.add(`${slotFor(descriptor, type.class)}.${name}`);
  }
  return roots;
}

// 'data.job.items' -> 'data.job'; 'identity.name' -> null (managed block,
// not row-checked); 'fields.width' -> treated as its root segment.
function fieldRoot(path = '') {
  const clean = path.replace(/^fields\./, '');
  const [block, name] = clean.split('.');
  if ((block === 'data' || block === 'specs') && name) return `${block}.${name}`;
  return null;
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
