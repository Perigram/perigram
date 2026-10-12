// Diff (SPEC §11): version stamping, evolution classification, and the
// declared migration gate. A breaking change on a type with persisted
// instances passes only when the next declaration carries `migrate` steps
// covering every breaking change; the server boundary executes covered
// steps against instances. Rename intent is never inferred from the diff —
// it is declared step territory.
export function diffTypes(previous = {}, next = {}) {
  const changes = [];
  const previousRow = previous.fields || {};
  const nextRow = next.fields || {};

  for (const name of Object.keys(previousRow)) {
    if (!Object.hasOwn(nextRow, name)) {
      changes.push({ severity: 'breaking', kind: 'remove-field', field: name });
      continue;
    }
    const before = signatureOf(previousRow[name]);
    const after = signatureOf(nextRow[name]);
    if (before !== after) {
      const loosened = nextRow[name].nullable === true && previousRow[name].nullable !== true && before.replace('?', '') === after.replace('?', '');
      changes.push(loosened
        ? { severity: 'minor', kind: 'loosen-field', field: name }
        : { severity: 'breaking', kind: 'retype-field', field: name, from: before, to: after });
    }
  }
  for (const name of Object.keys(nextRow)) {
    if (!Object.hasOwn(previousRow, name)) {
      changes.push(nextRow[name].nullable === true
        ? { severity: 'minor', kind: 'add-nullable-field', field: name }
        : { severity: 'breaking', kind: 'add-required-field', field: name });
    }
  }

  const previousChildren = Object.keys(previous.edges?.children || {});
  const nextChildren = Object.keys(next.edges?.children || {});
  for (const key of previousChildren) {
    if (!nextChildren.includes(key)) changes.push({ severity: 'breaking', kind: 'remove-edge', edge: `children.${key}` });
  }
  for (const key of nextChildren) {
    if (!previousChildren.includes(key)) changes.push({ severity: 'minor', kind: 'add-edge', edge: `children.${key}` });
  }

  return Object.freeze({
    from: previous.version || 1,
    to: (previous.version || 1) + (changes.some(change => change.severity === 'breaking') ? 1 : 0),
    changes: Object.freeze(changes),
    breaking: changes.some(change => change.severity === 'breaking')
  });
}

// R7 (SPEC §11): a breaking diff passes only with a covering declared
// migration; an uncovered breaking change (or a declared step matching
// nothing) refuses here. The registry reaches this gate; the server
// boundary reaches the planner directly.
export function requireCompatible(previous, next) {
  const plan = planTypeMigration(previous, next);
  if (!plan.covered) {
    throw new Error(`breaking change to ${next.id} without a covering declared migration (${plan.errors.join('; ')})`);
  }
  return plan.diff;
}

const STEP_KINDS = ['rename-field', 'add-default-field', 'remove-field', 'retype-field', 'remove-edge'];

function nonEmpty(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function normalizeMigrateSteps(steps) {
  if (steps == null || steps === undefined) return [];
  if (!Array.isArray(steps)) throw new Error('migrate must be an array of steps');
  return steps.map(step => {
    const kind = nonEmpty(step?.kind);
    if (!STEP_KINDS.includes(kind)) throw new Error(`unknown migration step kind ${step?.kind}`);
    if (kind === 'rename-field') {
      const from = nonEmpty(step.from);
      const to = nonEmpty(step.to);
      if (!from || !to) throw new Error('rename-field requires from and to');
      return { kind, from, to };
    }
    if (kind === 'add-default-field') {
      const field = nonEmpty(step.field);
      if (!field) throw new Error('add-default-field requires field');
      if (!Object.hasOwn(step, 'value')) throw new Error('add-default-field requires value (null allowed)');
      return { kind, field, value: step.value };
    }
    if (kind === 'retype-field') {
      const field = nonEmpty(step.field);
      if (!field) throw new Error('retype-field requires field');
      if (!step.via || typeof step.via !== 'object' || Array.isArray(step.via)) {
        throw new Error('retype-field requires via: a CEL expression AST evaluated over { value }');
      }
      return { kind, field, via: step.via };
    }
    if (kind === 'remove-edge') {
      const edge = nonEmpty(step.edge);
      if (!edge) throw new Error('remove-edge requires edge (children.<key>)');
      return { kind, edge };
    }
    const field = nonEmpty(step.field);
    if (!field) throw new Error(`${kind} requires field`);
    return { kind, field };
  });
}

function labelOf(step) {
  if (step.kind === 'rename-field') return `${step.kind} ${step.from} -> ${step.to}`;
  if (step.kind === 'remove-edge') return `${step.kind} ${step.edge}`;
  return `${step.kind} ${step.field}`;
}

function changeLabel(change) {
  if (change.kind === 'remove-edge') return `remove-edge ${change.edge}`;
  return `${change.kind} ${change.field}`;
}

// The one planner: diff + normalized steps + coverage verdict. Every
// breaking change needs one covering step; every declared step must match
// a breaking change (stale steps fail the gate instead of rotting on the
// declaration). remove-edge is covered by a declared remove-edge step
// whose execution detaches the stored lineage key on live instances
// (children of the removed edge become roots, SPEC §11).
export function planTypeMigration(previous = {}, next = {}) {
  const diff = diffTypes(previous, next);
  let steps;
  try {
    steps = normalizeMigrateSteps(next.migrate);
  } catch (error) {
    return { diff, steps: [], breaking: [], covered: false, errors: [error.message] };
  }
  const breaking = diff.changes.filter(change => change.severity === 'breaking');
  const errors = [];
  const used = new Array(steps.length).fill(false);
  const renameAddsCovered = new Set();
  const resolved = steps.map(step => ({ ...step }));

  for (const change of breaking) {
    if (change.kind === 'remove-field') {
      const index = steps.findIndex((step, i) => !used[i]
        && (step.kind === 'remove-field' && step.field === change.field
          || step.kind === 'rename-field' && step.from === change.field));
      if (index === -1) {
        errors.push(`${changeLabel(change)} requires a remove-field or rename-field step`);
      } else {
        used[index] = true;
        const matched = steps[index];
        if (matched.kind === 'rename-field') renameAddsCovered.add(matched.to);
      }
      continue;
    }
    if (change.kind === 'add-required-field') {
      const hasRenameCover = renameAddsCovered.has(change.field) || steps.some((step, i) => !used[i]
        && step.kind === 'rename-field'
        && step.to === change.field
        && previous.fields?.[step.from]
        && signatureOf(previous.fields[step.from]) === signatureOf(next.fields?.[change.field]));
      if (hasRenameCover) {
        const index = steps.findIndex((step, i) => step.kind === 'rename-field' && step.to === change.field && !used[i]);
        if (index !== -1) used[index] = true;
        continue;
      }
      const index = steps.findIndex((step, i) => !used[i] && step.kind === 'add-default-field' && step.field === change.field);
      if (index === -1) {
        errors.push(`${changeLabel(change)} requires an add-default-field step`);
      } else {
        used[index] = true;
      }
      continue;
    }
    if (change.kind === 'retype-field') {
      const index = steps.findIndex((step, i) => !used[i] && step.kind === 'retype-field' && step.field === change.field);
      if (index === -1) {
        errors.push(`${changeLabel(change)} requires a retype-field step`);
      } else {
        used[index] = true;
      }
      continue;
    }
    if (change.kind === 'remove-edge') {
      const index = steps.findIndex((step, i) => !used[i] && step.kind === 'remove-edge' && step.edge === change.edge);
      if (index === -1) {
        errors.push(`${changeLabel(change)} requires a remove-edge step`);
      } else {
        used[index] = true;
        // Executor context (SPEC §11): the removed previous entry names
        // the stored lineage key and the child types whose documents
        // carry it.
        const key = change.edge.slice('children.'.length);
        const entry = previous.edges?.children?.[key] || {};
        resolved[index] = {
          ...resolved[index],
          lineageKey: entry.lineageKey || null,
          types: [...(entry.types || [])]
        };
      }
      continue;
    }
    errors.push(`${changeLabel(change)} is not coverable by any declared migration step`);
  }

  steps.forEach((step, i) => {
    if (!used[i]) errors.push(`declared migration step ${labelOf(step)} matches no breaking change`);
  });

  return { diff, steps: Object.freeze(resolved), breaking, covered: errors.length === 0, errors: Object.freeze(errors) };
}

function signatureOf(descriptor = {}) {
  return JSON.stringify({
    base: descriptor.base, unit: descriptor.unit || null, accepts: descriptor.accepts || null,
    itemType: descriptor.itemType ? signatureOf(descriptor.itemType) : null,
    values: descriptor.values || null, tags: descriptor.tags || null,
    fields: descriptor.fields ? Object.fromEntries(Object.entries(descriptor.fields).map(([n, d]) => [n, signatureOf(d)])) : null,
    nullable: descriptor.nullable === true ? '?' : ''
  });
}
