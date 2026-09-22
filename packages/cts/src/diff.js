// Diff (SPEC §11, core tier): version stamping + refuse-on-breaking.
// Declarative migration steps are deferred until a second real migration exists.
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

  const previousValues = previous.states?.main?.values || [];
  const nextValues = next.states?.main?.values || [];
  for (const value of previousValues) {
    if (!nextValues.includes(value)) changes.push({ severity: 'breaking', kind: 'remove-state', state: value });
  }
  // Additive state values are minor (SPEC §11): new enum entries extend
  // the axis without invalidating stored instances. A rename is not
  // inferred from a remove/add pair — it is declared migration intent.
  for (const value of nextValues) {
    if (!previousValues.includes(value)) changes.push({ severity: 'minor', kind: 'add-state', state: value });
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

// R7 (core): refuse breaking diffs; migrations do not exist yet (SPEC §19).
export function requireCompatible(previous, next) {
  const diff = diffTypes(previous, next);
  if (diff.breaking) {
    const reasons = diff.changes.filter(change => change.severity === 'breaking').map(change => change.kind).join(', ');
    throw new Error(`breaking change to ${next.id} without a declared migration (${reasons}) — declarative migrations are not implemented yet (SPEC §19)`);
  }
  return diff;
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
