import { camelCaseId } from '~/packages/processes/src/index.js';

// The type-migration authoring seam (CTS SPEC §11/§14): the apply flow's
// structured refusal (`data.plan` from the cts-types gate) becomes
// declarative-step rows, confirmed rows become class-node `data.migrate`
// state, and consumed steps clear from the tree. Pure over the arrays —
// the page/composables supply nodes, edges, and the stored type view; the
// server re-verifies every step at the declaration post.

// Authored vocabulary per declared type: the class NAME, field-id ->
// authored LABEL, and the tree's CURRENT state values (the next enum).
// Stored declarations back the labels of fields whose tree nodes are gone
// (a removed field's label lives only on the stored descriptor); the tree
// wins everywhere else.
export function declarationVocabulary(nodes = [], edges = [], storedTypes = []) {
  const byType = {};
  const at = typeId => (byType[typeId] ||= { name: '', fields: {}, states: [] });
  for (const type of storedTypes) {
    if (!type?.id) continue;
    const vocabulary = at(type.id);
    if (type.name) vocabulary.name = type.name;
    for (const [fieldId, descriptor] of Object.entries(type.fields || {})) {
      if (descriptor?.label) vocabulary.fields[fieldId] = descriptor.label;
    }
  }
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  for (const node of nodes) {
    if (node.type !== 'ctsClass' || !node.data?.typeId) continue;
    const name = String(node.data.name || '').trim();
    if (name) at(node.data.typeId).name = name;
  }
  for (const edge of edges || []) {
    if (edge.role !== 'type') continue;
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target || target.type !== 'ctsClass' || !target.data?.typeId) continue;
    if (source.type === 'ctsField') {
      const name = String(source.data.name || '').trim();
      const fieldId = camelCaseId(name);
      if (fieldId) at(target.data.typeId).fields[fieldId] = source.data.descriptor?.label || name;
    }
    if (source.type === 'ctsState') {
      const value = String(source.data.value || '').trim();
      if (value) {
        const states = at(target.data.typeId).states;
        if (!states.includes(value)) states.push(value);
      }
    }
  }
  return byType;
}

// One row per breaking change, offered as the declarative step that covers
// it. A remove-field paired with an added required field is the authored
// rename gesture and yields ONE rename-field row covering both changes;
// unpaired adds become add-default-field rows; remove-state becomes a
// rename-enum-value row targeting the type's retained states; remove-edge
// is coverable by nothing (SPEC §11) and renders blocked.
export function typeMigrationRows(plan = {}, vocabulary = {}) {
  const changes = plan.changes || [];
  const fieldLabel = fieldId => vocabulary?.fields?.[fieldId] || fieldId;
  const requiredSteps = plan.requiredSteps || [];
  const rows = [];
  const added = changes.filter(change => change.kind === 'add-required-field');
  const pairedAdds = new Set();
  for (const change of changes) {
    if (change.kind === 'remove-field') {
      const paired = added.find(candidate => !pairedAdds.has(candidate.field));
      if (paired) {
        pairedAdds.add(paired.field);
        rows.push({
          key: `rename-field:${change.field}`,
          kind: 'rename-field',
          field: change.field,
          fieldLabel: fieldLabel(change.field),
          to: paired.field,
          toLabel: fieldLabel(paired.field)
        });
      } else {
        rows.push({
          key: `remove-field:${change.field}`,
          kind: 'remove-field',
          field: change.field,
          fieldLabel: fieldLabel(change.field)
        });
      }
      continue;
    }
    if (change.kind === 'retype-field') {
      rows.push({
        key: `retype-field:${change.field}`,
        kind: 'retype-field',
        field: change.field,
        fieldLabel: fieldLabel(change.field)
      });
      continue;
    }
    if (change.kind === 'remove-state') {
      const targets = (vocabulary?.states || []).filter(value => value !== change.state);
      rows.push({
        key: `rename-enum-value:${change.state}`,
        kind: 'rename-enum-value',
        state: change.state,
        targets,
        to: targets.length === 1 ? targets[0] : null
      });
      continue;
    }
    if (change.kind === 'add-required-field') continue;
    rows.push({
      key: `blocked:${change.edge || change.field || change.state || rows.length}`,
      kind: 'blocked',
      subject: change.edge || change.field || change.state || '',
      reason: requiredSteps.find(message => message.startsWith(`${change.kind} `)) || requiredSteps.join('; ')
    });
  }
  for (const change of added.filter(candidate => !pairedAdds.has(candidate.field))) {
    rows.push({
      key: `add-default-field:${change.field}`,
      kind: 'add-default-field',
      field: change.field,
      fieldLabel: fieldLabel(change.field)
    });
  }
  return rows;
}

// Confirmed answers become migration steps. A rename-field answer holds
// the authored new NAME (the row's paired field id is the prefill); a
// retype answer is 'keep' (default) or 'empty'; an add-default answer is
// the default's text (empty parses as null, numerics as numbers); an enum
// answer is the retained state value. Blocked rows contribute no step.
export function stepsFromTypeMigrationRows(rows = [], answers = {}) {
  const steps = [];
  for (const row of rows) {
    if (row.kind === 'rename-field') {
      const authored = String(answers[row.key] ?? row.toLabel ?? '').trim();
      if (!authored) continue;
      const to = authored === row.toLabel ? row.to : camelCaseId(authored);
      if (to) steps.push({ kind: 'rename-field', from: row.field, to });
      continue;
    }
    if (row.kind === 'rename-enum-value') {
      const to = answers[row.key] || row.to;
      if (to) steps.push({ kind: 'rename-enum-value', axis: 'main', from: row.state, to });
      continue;
    }
    if (row.kind === 'retype-field') {
      // The only two expressions the CEL evaluator honestly supports for a
      // retype today: the incoming value, or a literal null.
      steps.push({
        kind: 'retype-field',
        field: row.field,
        via: answers[row.key] === 'empty'
          ? { op: 'lit', value: null }
          : { op: 'var', name: 'value' }
      });
      continue;
    }
    if (row.kind === 'add-default-field') {
      steps.push({ kind: 'add-default-field', field: row.field, value: parseDefaultValue(answers[row.key]) });
      continue;
    }
    if (row.kind === 'remove-field') steps.push({ kind: 'remove-field', field: row.field });
  }
  return steps;
}

function parseDefaultValue(input) {
  const text = String(input ?? '').trim();
  if (!text) return null;
  return /^-?\d+(?:\.\d+)?$/.test(text) ? Number(text) : text;
}

// Steps land on the matching class node (found by typeId) as transient
// apply-time state read by `compileTreeDeclarations`. An explicitly empty
// step list is consent to CLEAR carried steps (a stale set re-refused by
// the gate with no breaking changes left).
export function writeTypeMigrationSteps(nodes = [], stepsByType = {}) {
  for (const node of nodes) {
    if (node.type !== 'ctsClass' || !node.data?.typeId) continue;
    const steps = stepsByType[node.data.typeId];
    if (!Array.isArray(steps)) continue;
    if (steps.length) node.data.migrate = steps;
    else delete node.data.migrate;
  }
}

// Steps are one-time: once a declaration post consumed them, they clear so
// the next apply can never re-post a stale step set.
export function clearTypeMigrationSteps(nodes = [], typeId = null) {
  for (const node of nodes) {
    if (node.type !== 'ctsClass' || !node.data?.migrate) continue;
    if (typeId && node.data.typeId !== typeId) continue;
    delete node.data.migrate;
  }
}
