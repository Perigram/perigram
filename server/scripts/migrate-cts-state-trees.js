import { connectDB } from '../db/mongo.js';

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function diagnostic(typeId, axis, code, message, details = {}) {
  return {
    code,
    typeId,
    axis,
    message,
    ...details
  };
}

function invalidValuesDiagnostic(typeId, axis, axisName, values) {
  return diagnostic(
    typeId,
    axisName,
    axisName === 'main' ? 'invalid-axis-values' : 'invalid-secondary-axis-values',
    `${typeId || 'type'} states.${axisName}.values is not an unambiguous string vocabulary; review it manually`,
    { values }
  );
}

function validateFlatAxis(typeId, axisName, axis) {
  if (!isRecord(axis)) {
    return {
      error: diagnostic(
        typeId,
        axisName,
        axisName === 'main' ? 'invalid-axis' : 'invalid-secondary-axis',
        `${typeId || 'type'} states.${axisName} must be a state machine object; review it manually`
      )
    };
  }

  const hasValues = hasOwn(axis, 'values');
  const hasStates = hasOwn(axis, 'states');
  if (!hasValues && !hasStates) {
    return {
      error: diagnostic(
        typeId,
        axisName,
        axisName === 'main' ? 'invalid-axis' : 'invalid-secondary-axis',
        `${typeId || 'type'} states.${axisName} has neither flat values nor a recursive states map; review it manually`
      )
    };
  }
  if (hasValues && hasStates) {
    return {
      error: diagnostic(
        typeId,
        axisName,
        axisName === 'main' ? 'mixed-axis-contract' : 'mixed-secondary-axis-contract',
        `${typeId || 'type'} states.${axisName} contains both flat values and recursive states; review it manually`
      )
    };
  }
  if (!hasValues) return { axis };

  const { values } = axis;
  if (!Array.isArray(values)
    || values.length === 0
    || values.some(value => typeof value !== 'string' || !value.length)
    || values.some(value => value.split('.').some(segment => !segment.length))
    || new Set(values).size !== values.length) {
    return { error: invalidValuesDiagnostic(typeId, axis, axisName, values) };
  }
  if (typeof axis.initial !== 'string' || !values.includes(axis.initial)) {
    return {
      error: diagnostic(
        typeId,
        axisName,
        'invalid-axis-initial',
        `${typeId || 'type'} states.${axisName}.initial must name one declared value; review it manually`,
        { initial: axis.initial }
      )
    };
  }

  const terminal = axis.terminal ?? [];
  if (!Array.isArray(terminal)
    || terminal.some(value => typeof value !== 'string' || !values.includes(value))) {
    return {
      error: diagnostic(
        typeId,
        axisName,
        'invalid-axis-terminal',
        `${typeId || 'type'} states.${axisName}.terminal must contain only declared values; review it manually`,
        { terminal }
      )
    };
  }

  const render = axis.render ?? {};
  if (!isRecord(render)
    || Object.keys(render).some(value => !values.includes(value))
    || Object.values(render).some(policy => !isRecord(policy))) {
    return {
      error: diagnostic(
        typeId,
        axisName,
        'invalid-axis-render',
        `${typeId || 'type'} states.${axisName}.render must map declared values to policy objects; review it manually`,
        { render }
      )
    };
  }

  return { axis, values, terminal, render };
}

function convertFlatAxis(axis, values, terminal, render) {
  const states = {};
  const nodesByPath = new Map();

  // A dotted value is already a canonical leaf path. Create each structural
  // ancestor explicitly, but keep every leaf addressable by its original path
  // so a stored active leaf never needs rewriting during the declaration cut.
  for (const value of values) {
    const segments = value.split('.');
    let level = states;
    let path = [];
    for (const segment of segments) {
      path.push(segment);
      const canonicalPath = path.join('.');
      if (!hasOwn(level, segment)) level[segment] = {};
      const node = level[segment];
      if (canonicalPath === value) nodesByPath.set(value, node);
      if (path.length < segments.length) {
        if (!hasOwn(node, 'states')) node.states = {};
        level = node.states;
      }
    }
  }

  const terminalValues = new Set(terminal);
  for (const value of values) {
    const node = nodesByPath.get(value);
    if (terminalValues.has(value) && !hasOwn(node, 'states')) node.terminal = true;
    if (hasOwn(render, value)) node.policy = structuredClone(render[value]);
  }

  const initial = String(axis.initial);
  const assignNestedInitials = (level, prefix = []) => {
    for (const [name, node] of Object.entries(level)) {
      if (!isRecord(node) || !isRecord(node.states)) continue;
      const path = [...prefix, name];
      const canonicalParent = path.join('.');
      const initialPath = initial === canonicalParent || initial.startsWith(`${canonicalParent}.`)
        ? initial
        : '';
      const initialParts = initialPath ? initialPath.split('.') : [];
      const childIndex = initialParts[path.length];
      const children = Object.keys(node.states);
      node.initial = children.includes(childIndex) ? childIndex : children[0];
      assignNestedInitials(node.states, path);
    }
  };
  assignNestedInitials(states);

  const { values: _values, terminal: _terminal, render: _render, ...axisMetadata } = axis;
  return {
    ...structuredClone(axisMetadata),
    initial: axis.initial,
    states
  };
}

/**
 * One-way persisted CTS declaration migration. The input is never mutated.
 * Ambiguous data is left byte-for-byte untouched and returned as a manual
 * review diagnostic, especially for secondary axes whose values cannot be
 * proven to be a flat string vocabulary.
 */
export function migrateCtsTypeStateTree(document = {}) {
  const typeId = String(document.id || document._id || '');
  const states = document.states;
  if (states == null) return { data: document, changed: false, diagnostics: [] };
  if (!isRecord(states)) {
    return {
      data: document,
      changed: false,
      diagnostics: [diagnostic(
        typeId,
        '',
        'invalid-state-axes',
        `${typeId || 'type'} states must be an axis map; review it manually`
      )]
    };
  }

  const diagnostics = [];
  const nextStates = {};
  let changed = false;
  for (const [axisName, axis] of Object.entries(states)) {
    const validated = validateFlatAxis(typeId, axisName, axis);
    if (validated.error) {
      diagnostics.push(validated.error);
      continue;
    }
    if (!hasOwn(axis, 'values')) {
      nextStates[axisName] = axis;
      continue;
    }
    nextStates[axisName] = convertFlatAxis(
      validated.axis,
      validated.values,
      validated.terminal,
      validated.render
    );
    changed = true;
  }

  if (diagnostics.length) return { data: document, changed: false, diagnostics };
  if (!changed) return { data: document, changed: false, diagnostics: [] };
  return {
    data: {
      ...document,
      states: nextStates
    },
    changed: true,
    diagnostics: []
  };
}

export async function runCtsStateTreeMigration(database, { apply = false } = {}) {
  const db = database || await connectDB();
  const report = {
    mode: apply ? 'apply' : 'dry-run',
    scanned: 0,
    changed: 0,
    applied: 0,
    diagnostics: [],
    failures: []
  };

  for await (const document of db.collection('cts_types').find({})) {
    report.scanned += 1;
    try {
      const result = migrateCtsTypeStateTree(document);
      report.diagnostics.push(...result.diagnostics.map(item => ({
        collection: 'cts_types',
        documentId: String(document._id || ''),
        ...item
      })));
      if (!result.changed) continue;
      report.changed += 1;
      if (!apply) continue;
      const update = await db.collection('cts_types').updateOne(
        { _id: document._id },
        { $set: { states: result.data.states } }
      );
      if (update?.matchedCount === 0) throw new Error('declaration disappeared before apply');
      report.applied += 1;
    } catch (error) {
      report.failures.push({
        collection: 'cts_types',
        documentId: String(document._id || ''),
        error: error?.message || String(error)
      });
    }
  }

  return report;
}

export async function main(argv = process.argv, { database = null, logger = console } = {}) {
  const report = await runCtsStateTreeMigration(database, { apply: argv.includes('--apply') });
  logger.log(JSON.stringify(report, null, 2));
  if (report.failures.length) process.exitCode = 1;
  else if (report.diagnostics.length) process.exitCode = 2;
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
