// Diff (SPEC §11): version stamping, evolution classification, and the
// declared migration gate. A breaking change on a type with persisted
// instances passes only when the next declaration carries `migrate` steps
// covering every breaking change; the server boundary executes covered
// steps against instances. Rename intent is never inferred from the diff —
// it is declared step territory.
import { collectStateEntries } from './states.js';

function statePathsByAxis(states = {}) {
  return Object.fromEntries(Object.entries(states).map(([axisName, axis]) => [
    axisName,
    collectStateEntries(axis).map(entry => entry.path)
  ]));
}

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

  const previousStates = statePathsByAxis(previous.states || {});
  const nextStates = statePathsByAxis(next.states || {});
  for (const [axisName, previousPaths] of Object.entries(previousStates)) {
    const nextPaths = nextStates[axisName] || [];
    for (const statePath of previousPaths) {
      if (!nextPaths.includes(statePath)) {
        changes.push({ severity: 'breaking', kind: 'remove-state', axis: axisName, state: statePath });
      }
    }
  }
  // Additive canonical paths are minor: a new node/axis extends the machine
  // without invalidating stored leaf paths. A rename is never inferred from
  // the remove/add pair; it is declared migration intent.
  for (const [axisName, nextPaths] of Object.entries(nextStates)) {
    const previousPaths = previousStates[axisName] || [];
    for (const statePath of nextPaths) {
      if (!previousPaths.includes(statePath)) {
        changes.push({ severity: 'minor', kind: 'add-state', axis: axisName, state: statePath });
      }
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

const STEP_KINDS = ['rename-enum-value', 'rename-field', 'add-default-field', 'remove-field', 'retype-field'];

function nonEmpty(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function normalizeMigrateSteps(steps) {
  if (steps == null || steps === undefined) return [];
  if (!Array.isArray(steps)) throw new Error('migrate must be an array of steps');
  return steps.map(step => {
    const kind = nonEmpty(step?.kind);
    if (!STEP_KINDS.includes(kind)) throw new Error(`unknown migration step kind ${step?.kind}`);
    if (kind === 'rename-enum-value') {
      const from = nonEmpty(step.from);
      const to = nonEmpty(step.to);
      const axis = nonEmpty(step.axis);
      if (!from || !to) throw new Error('rename-enum-value requires from and to');
      if (!axis) throw new Error('rename-enum-value requires axis');
      return { kind, axis, from, to };
    }
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
    const field = nonEmpty(step.field);
    if (!field) throw new Error(`${kind} requires field`);
    return { kind, field };
  });
}

function labelOf(step) {
  if (step.kind === 'rename-enum-value') return `${step.kind} ${step.axis}.${step.from} -> ${step.to}`;
  if (step.kind === 'rename-field') return `${step.kind} ${step.from} -> ${step.to}`;
  return `${step.kind} ${step.field}`;
}

function changeLabel(change) {
  if (change.kind === 'remove-state') return `remove-state ${change.axis}.${change.state}`;
  if (change.kind === 'remove-edge') return `remove-edge ${change.edge}`;
  return `${change.kind} ${change.field}`;
}

// The one planner: diff + normalized steps + coverage verdict. Every
// breaking change needs one covering step; every declared step must match
// a breaking change (stale steps fail the gate instead of rotting on the
// declaration); rename-enum-value targets must exist in the next enum.
// remove-edge is coverable by nothing (SPEC §11 names no edge step) and
// stays a refusal.
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
  const nextStates = statePathsByAxis(next.states || {});
  const used = new Array(steps.length).fill(false);
  const renameAddsCovered = new Set();

  for (const step of steps) {
    if (step.kind === 'rename-enum-value' && !(nextStates[step.axis] || []).includes(step.to)) {
      errors.push(`rename-enum-value target ${step.axis}.${step.to} is not a state of the next declaration`);
    }
  }

  for (const change of breaking) {
    if (change.kind === 'remove-state') {
      const index = steps.findIndex((step, i) => !used[i]
        && step.kind === 'rename-enum-value'
        && step.axis === change.axis
        && step.from === change.state);
      if (index === -1) {
        errors.push(`${changeLabel(change)} requires a rename-enum-value step`);
      } else {
        used[index] = true;
      }
      continue;
    }
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
    errors.push(`${changeLabel(change)} is not coverable by any declared migration step`);
  }

  steps.forEach((step, i) => {
    if (!used[i]) errors.push(`declared migration step ${labelOf(step)} matches no breaking change`);
  });

  return { diff, steps, breaking, covered: errors.length === 0, errors: Object.freeze(errors) };
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
