// Declaration-check phase (SPEC §12 at the seam): runs before the process
// compiler's own graph validation. The compiler checks the graph (sockets,
// availability, lineage); this phase checks the DECLARATIONS the graph
// touches against a CTS registry view:
//   - every referenced typeId exists in the org view
//   - status transitions target declared states of that type
//   - data/specs field paths land inside real rows (slot-aware: node paths
//     are block paths, row names are slot-stripped). Managed blocks
//     (identity/origin/status/lineage/relations/provenance/summary/
//     attachments) belong to their own facets and are not row-checked;
//     `data.value` is the reserved generic payload slot.
// Best-effort by design (v1): unknown record shapes pass silently; tighten
// by teaching the walker new record kinds, never by loosening checks. Type
// bindings are positional (typeId/typeId/species-kind `type`), so
// process-vocabulary descriptor strings are never misread as references.
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
    if (output?.typeId && !view.has(output.typeId)) {
      errors.push(`Producer output ${producerOutputId} references unknown type ${output.typeId}`);
    }
  }
  for (const [socketId, socket] of Object.entries(data.sockets || {})) {
    const typeId = socket?.type?.typeId || socket?.typeId;
    if (typeId && !view.has(typeId)) {
      errors.push(`Socket ${socketId} references unknown type ${typeId}`);
    }
  }

  walk(semantic, (node, path) => {
    if (!node || typeof node !== 'object') return;
    // Type bindings are positional: v4 records bind through `typeId`,
    // v5 species records through `typeId` (current) or the legacy bare
    // `type` string. A bare `type` string anywhere else is a
    // process-vocabulary descriptor ('string', 'default', …) — never a
    // type reference — so it is only read on species records, mirroring
    // the kind branch in `setTypeBinding`.
    const kind = typeof node.kind === 'string' ? node.kind : '';
    const typeId = typeof node.typeId === 'string' ? node.typeId.replace(/_/g, '-')
      : typeof node.typeId === 'string' && node.typeId ? node.typeId.replace(/_/g, '-')
      : typeof node.type === 'string' && kind.startsWith('cts.') ? node.type.replace(/_/g, '-') : null;
    if (typeId && !view.has(typeId) && !path.startsWith('producerOutputs') && !path.startsWith('sockets')) {
      errors.push(`${path} references unknown type ${typeId}`);
    }
    if (!typeId || !statesByType.has(typeId)) return;
    const states = statesByType.get(typeId);
    for (const key of ['status', 'targetStatus', 'statusTo', 'toState', 'to']) {
      const value = node[key];
      if (typeof value === 'string' && value && !states.has(value)) {
        errors.push(`${path} moves ${typeId} to undeclared state ${value}`);
      }
    }
    const rowRoots = rowRootsByType.get(typeId);
    if (rowRoots) {
      for (const key of ['field', 'fieldPath']) {
        const fieldPath = node[key];
        const root = fieldRoot(String(fieldPath || ''));
        if (root && !rowRoots.has(root)) {
          errors.push(`${path} uses field ${fieldPath} outside the ${typeId} row`);
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
