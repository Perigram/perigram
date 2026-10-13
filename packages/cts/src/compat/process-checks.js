// Declaration-check phase (SPEC §12 at the seam): runs before the process
// compiler's own graph validation. The compiler checks the graph (sockets,
// availability, lineage); this phase checks the DECLARATIONS the graph
// touches against a CTS registry view:
//   - every referenced typeId exists in the org view
//   - authored state values target the draft's own state nodes (SPEC §7:
//     types declare no vocabularies; the draft's state records are the
//     only source)
//   - data/specs field paths land inside real rows (slot-aware: node paths
//     are block paths, row names are slot-stripped). Managed blocks
//     (identity/origin/status/lineage/relations/provenance/summary/
//     attachments) belong to their own facets and are not row-checked;
//     `data.value` is the reserved generic payload slot.
// Best-effort by design (v1): unknown record shapes pass silently; tighten
// by teaching the walker new record kinds, never by loosening checks. Type
// bindings are positional (typeId/typeId/species-kind `type`), so
// process-vocabulary descriptor strings are never misread as references.
import { durationMs } from '../values.js';
import { checkBooleanExpression } from '../expressions.js';


export function checkDeclarationsAgainstCts(processDefinition = {}, registry, organizationId = null) {
  const errors = [];
  const view = registry?.resolveView ? registry.resolveView(organizationId) : new Map();
  const rowRootsByType = new Map();
  for (const type of view.values()) {
    rowRootsByType.set(type.id, allowedFieldRoots(type));
  }
  const data = processDefinition?.data || processDefinition || {};
  // The state vocabulary is draft authoring (SPEC §7): ctsState records
  // carry it. A record is a value token — unscoped records satisfy any
  // bound type; scoped records constrain only their own type.
  const unscopedStateValues = new Set();
  const statesByType = new Map();
  for (const record of Object.values(data.ctsTypes || {})) {
    if (record?.kind !== 'state' || !record.value) continue;
    if (record.typeId == null) {
      unscopedStateValues.add(String(record.value));
      continue;
    }
    const values = statesByType.get(record.typeId) || new Set();
    values.add(String(record.value));
    statesByType.set(record.typeId, values);
  }
  // The canvas graph is presentation (Vue Flow node/edge types, positions,
  // viewport) — declaration checks read semantic records only. Walking it
  // would misread card kinds such as `ctsField` as referenced type ids.
  const { graph: _presentation, ...semantic } = data;

  // Guard rows are row-relative (SPEC §7/§20): the first path segment
  // under `value` must be a declared field of the bound type.
  const rowNamesByType = new Map();
  for (const type of view.values()) {
    const names = Object.keys(type.fields || {});
    if (names.length) rowNamesByType.set(type.id, new Set(names));
  }

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
    if (typeId) {
      const targets = [
        node.state?.to,
        node.inputDefaults?.state
      ].filter(value => typeof value === 'string' && value);
      if (targets.length) {
        const states = statesByType.get(typeId) || new Set();
        for (const value of targets) {
          if (!states.has(value) && !unscopedStateValues.has(value)) {
            errors.push(`${path} moves ${typeId} to undeclared state ${value}`);
          }
        }
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
    // Transition guards (SPEC §7): boolean expression ASTs over { value }.
    // Vocabulary is the boolean subset of §18 — comprehensions are not
    // guard authoring — and field paths are row-checked like any other
    // field reference.
    if (kind === 'cts.transition' && node.guard) {
      errors.push(...checkGuardExpression(node.guard, rowNamesByType.get(typeId), path));
    }
    // State deadlines (SPEC §7): `after` parses as an ISO-8601 duration,
    // `to` is a declared state of the same type's vocabulary (never the
    // state itself), and the deadline guard follows the guard contract.
    if (kind === 'state' && node.deadline) {
      const deadline = node.deadline || {};
      try {
        durationMs(deadline.after);
      } catch {
        errors.push(`${path} deadline: after must be an ISO-8601 duration`);
      }
      const vocabulary = statesByType.get(node.typeId) || new Set();
      if (!deadline.to || deadline.to === node.value) {
        errors.push(`${path} deadline: to must name another declared state`);
      } else if (!vocabulary.has(String(deadline.to)) && !unscopedStateValues.has(String(deadline.to))) {
        errors.push(`${path} deadline: to ${deadline.to} is not declared for ${node.typeId}`);
      }
      if (deadline.guard) {
        errors.push(...checkGuardExpression(deadline.guard, rowNamesByType.get(typeId), `${path} deadline`));
      }
    }
  });

  return errors;
}

// 'data.job.items' -> 'data.job'; 'identity.name' -> null (managed block,
// not row-checked); 'fields.width' -> treated as its root segment.
function fieldRoot(path = '') {
  const clean = String(path).replace(/^fields\./, '');
  const [name] = clean.split('.');
  return name || null;
}

// Guard expression check (SPEC §7): the shared boolean-subset checker
// (expressions.js owns the grammar); transition guards row-check against
// the bound type.
function checkGuardExpression(ast, rowNames, path) {
  return checkBooleanExpression(ast, rowNames, `${path} guard`);
}

function allowedFieldRoots(type = {}) {
  const fields = Object.entries(type.fields || {});
  if (!fields.length) return null; // no declared rows: not row-checked
  return new Set(fields.map(([name]) => name));
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
