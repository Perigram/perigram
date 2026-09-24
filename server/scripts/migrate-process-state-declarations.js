import { connectDB } from '../db/mongo.js';

const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function diagnostic(code, message, details = {}) {
  return { code, message, ...details };
}

function semanticStateId(record = {}, fallback = '') {
  return String(record.id || fallback || '');
}

function stateEntries(records = {}) {
  return Object.entries(records)
    .filter(([, record]) => record?.kind === 'state')
    .map(([key, record]) => ({ key, record, id: semanticStateId(record, key) }));
}

function buildStateLookup(entries) {
  const byId = new Map();
  for (const entry of entries) {
    if (!entry.id) continue;
    if (byId.has(entry.id)) {
      return {
        error: diagnostic(
          'duplicate-state-id',
          `Draft state id ${entry.id} is not stable across ctsTypes records`,
          { stateId: entry.id }
        )
      };
    }
    byId.set(entry.id, entry);
  }
  return { byId };
}

function graphStateNodeId(node = {}) {
  if (node.type !== 'ctsState') return '';
  const data = isRecord(node.data) ? node.data : {};
  return String(data.refId || node.id || '');
}

function resolveGraphState(nodeId, stateById) {
  if (!nodeId) return null;
  const direct = stateById.get(nodeId);
  if (direct) return direct;
  const namespaced = nodeId.startsWith('ctsState:') ? nodeId.slice('ctsState:'.length) : '';
  return namespaced ? stateById.get(namespaced) || null : null;
}

function graphParentRelations(graph = {}, stateById) {
  const relations = new Map();
  const diagnostics = [];
  const nodes = new Map((graph.nodes || [])
    .filter(node => node?.type === 'ctsState')
    .map(node => [String(node.id || ''), node]));

  for (const edge of graph.edges || []) {
    if (edge?.role !== 'type') continue;
    const sourceNodeId = String(edge.source || '');
    const targetNodeId = String(edge.target || '');
    if (!nodes.has(sourceNodeId) || !nodes.has(targetNodeId)) continue;
    const child = resolveGraphState(graphStateNodeId(nodes.get(sourceNodeId)), stateById);
    const parent = resolveGraphState(graphStateNodeId(nodes.get(targetNodeId)), stateById);
    if (!child) {
      diagnostics.push(diagnostic(
        'unresolved-child-state',
        `Declaration nesting edge ${edge.id || `${sourceNodeId}->${targetNodeId}`} has no persisted child ctsTypes record`,
        { edgeId: String(edge.id || ''), childNodeId: sourceNodeId, parentNodeId: targetNodeId }
      ));
      continue;
    }
    if (!parent) {
      diagnostics.push(diagnostic(
        'unresolved-parent-state',
        `Declaration nesting edge ${edge.id || `${sourceNodeId}->${targetNodeId}`} has no persisted parent ctsTypes record`,
        { edgeId: String(edge.id || ''), childStateId: child.id, parentNodeId: targetNodeId }
      ));
      continue;
    }
    if (relations.has(child.id)) {
      diagnostics.push(diagnostic(
        'multiple-parent-states',
        `Draft state ${child.id} declares more than one parent in the declaration graph`,
        { childStateId: child.id, parentStateId: relations.get(child.id).parentId }
      ));
      continue;
    }
    relations.set(child.id, {
      childId: child.id,
      parentId: parent.id,
      edgeId: String(edge.id || '')
    });
  }

  return { relations, diagnostics };
}

function stateCycles(relations) {
  const diagnostics = [];
  const stateIds = new Set(relations.keys());
  for (const childId of stateIds) {
    const seen = new Set([childId]);
    let current = relations.get(childId)?.parentId;
    while (current && stateIds.has(current)) {
      if (seen.has(current)) {
        diagnostics.push(diagnostic(
          'cyclic-state-parents',
          `Draft state ${childId} is part of a parent cycle`,
          { childStateId: childId }
        ));
        break;
      }
      seen.add(current);
      current = relations.get(current)?.parentId;
    }
  }
  return diagnostics;
}

function migrateCtsTypeStates(data = {}) {
  if (data.ctsTypes == null) return { records: null, diagnostics: [] };
  if (!isRecord(data.ctsTypes)) {
    return {
      records: null,
      diagnostics: [diagnostic(
        'invalid-cts-types',
        'data.ctsTypes must be a record map; review it manually'
      )]
    };
  }

  const entries = stateEntries(data.ctsTypes);
  if (!entries.length) return { records: null, diagnostics: [] };
  const lookup = buildStateLookup(entries);
  if (lookup.error) return { records: null, diagnostics: [lookup.error] };

  const graph = isRecord(data.graph) ? data.graph : {};
  const { relations, diagnostics: graphDiagnostics } = graphParentRelations(graph, lookup.byId);
  const diagnostics = [...graphDiagnostics, ...stateCycles(relations)];
  if (diagnostics.length) return { records: null, diagnostics };

  const axisById = new Map();
  const parentById = new Map();
  const visiting = new Set();
  const resolved = new Set();
  const resolveState = id => {
    if (resolved.has(id)) return axisById.get(id);
    if (visiting.has(id)) {
      diagnostics.push(diagnostic(
        'cyclic-state-parents',
        `Draft state ${id} is part of a parent cycle`,
        { childStateId: id }
      ));
      return null;
    }
    visiting.add(id);
    const entry = lookup.byId.get(id);
    let explicitAxis = null;
    if (entry?.record?.axis != null && entry.record.axis !== '') {
      if (typeof entry.record.axis === 'string') {
        explicitAxis = entry.record.axis;
      } else {
        diagnostics.push(diagnostic(
          'invalid-state-axis',
          `Draft state ${id} has a non-string axis`,
          { stateId: id, axis: entry.record.axis }
        ));
      }
    }
    const parentId = relations.get(id)?.parentId || null;
    const parentAxis = parentId ? resolveState(parentId) : null;
    const axis = explicitAxis || parentAxis || 'main';
    if (explicitAxis && parentAxis && explicitAxis !== parentAxis) {
      diagnostics.push(diagnostic(
        'state-axis-parent-mismatch',
        `Draft state ${id} is on axis ${explicitAxis} but its parent is on ${parentAxis}`,
        { stateId: id, axis: explicitAxis, parentAxis, parentStateId: parentId }
      ));
    }
    if (entry?.record?.typeId && parentId) {
      const parent = lookup.byId.get(parentId);
      if (parent?.record?.typeId && parent.record.typeId !== entry.record.typeId) {
        diagnostics.push(diagnostic(
          'state-parent-type-mismatch',
          `Draft state ${id} cannot nest under a state declared for ${parent.record.typeId}`,
          { stateId: id, typeId: entry.record.typeId, parentStateId: parentId, parentTypeId: parent.record.typeId }
        ));
      }
    }
    axisById.set(id, axis);
    parentById.set(id, parentId);
    visiting.delete(id);
    resolved.add(id);
    return axis;
  };

  for (const entry of entries) resolveState(entry.id);
  if (diagnostics.length) return { records: null, diagnostics };

  let changed = false;
  const records = { ...data.ctsTypes };
  for (const entry of entries) {
    const axis = axisById.get(entry.id);
    const parentStateId = parentById.get(entry.id) || null;
    const currentParent = entry.record.parentStateId == null || entry.record.parentStateId === ''
      ? null
      : String(entry.record.parentStateId);
    if (relations.has(entry.id) && currentParent && currentParent !== parentStateId) {
      diagnostics.push(diagnostic(
        'persisted-parent-state-conflict',
        `Draft state ${entry.id} persists parent ${currentParent}, but the declaration graph resolves ${parentStateId}`,
        { stateId: entry.id, persistedParentStateId: currentParent, parentStateId }
      ));
      continue;
    }
    if (!relations.has(entry.id) && currentParent) {
      diagnostics.push(diagnostic(
        'orphaned-parent-state',
        `Draft state ${entry.id} persists parent ${currentParent}, but the declaration graph has no parent edge`,
        { stateId: entry.id, parentStateId: currentParent }
      ));
      continue;
    }
    if (
      entry.record.axis === axis
      && currentParent === parentStateId
      && Object.prototype.hasOwnProperty.call(entry.record, 'parentStateId')
    ) continue;
    records[entry.key] = {
      ...entry.record,
      axis,
      parentStateId
    };
    changed = true;
  }

  if (diagnostics.length) return { records: null, diagnostics };
  return { records: changed ? records : null, diagnostics: [] };
}

function migrateStatusRegions(data = {}) {
  const migrations = data.migrations;
  if (!isRecord(migrations) || !Array.isArray(migrations.statuses)) {
    return { migrations: null, changed: false, diagnostics: [] };
  }
  let changed = false;
  const statuses = migrations.statuses.map(row => {
    if (!isRecord(row) || (row.region != null && row.region !== '')) return row;
    changed = true;
    return { ...row, region: 'main' };
  });
  return {
    migrations: changed ? { ...migrations, statuses } : null,
    changed,
    diagnostics: []
  };
}

/**
 * One-way process-definition migration. Declaration graph edges are the sole
 * source for stable parent ids and nested axes; source values and dotted leaf
 * paths are copied verbatim. Ambiguous declaration graphs are not rewritten.
 */
export function migrateProcessStateDeclarations(data = {}) {
  if (!isRecord(data)) {
    return {
      data,
      changed: false,
      diagnostics: [diagnostic('invalid-process-data', 'Process data must be an object; review it manually')]
    };
  }

  const stateMigration = migrateCtsTypeStates(data);
  const statusMigration = migrateStatusRegions(data);
  const diagnostics = [...stateMigration.diagnostics, ...statusMigration.diagnostics];
  if (diagnostics.length) return { data, changed: false, diagnostics };
  if (!stateMigration.records && !statusMigration.migrations) {
    return { data, changed: false, diagnostics: [] };
  }

  return {
    data: {
      ...data,
      ...(stateMigration.records ? { ctsTypes: stateMigration.records } : {}),
      ...(statusMigration.migrations ? { migrations: statusMigration.migrations } : {})
    },
    changed: true,
    diagnostics: []
  };
}

export async function runProcessStateDeclarationMigration(database, { apply = false } = {}) {
  const db = database || await connectDB();
  const report = {
    mode: apply ? 'apply' : 'dry-run',
    scanned: 0,
    changed: 0,
    applied: 0,
    diagnostics: [],
    failures: []
  };

  for await (const process of db.collection('process_definitions').find({})) {
    report.scanned += 1;
    try {
      const result = migrateProcessStateDeclarations(process.data || {});
      report.diagnostics.push(...result.diagnostics.map(item => ({
        collection: 'process_definitions',
        documentId: String(process._id || ''),
        ...item
      })));
      if (!result.changed) continue;
      report.changed += 1;
      if (!apply) continue;
      const update = await db.collection('process_definitions').updateOne(
        { _id: process._id },
        { $set: { data: result.data } }
      );
      if (update?.matchedCount === 0) throw new Error('process definition disappeared before apply');
      report.applied += 1;
    } catch (error) {
      report.failures.push({
        collection: 'process_definitions',
        documentId: String(process._id || ''),
        error: error?.message || String(error)
      });
    }
  }

  return report;
}

export async function main(argv = process.argv, { database = null, logger = console } = {}) {
  const report = await runProcessStateDeclarationMigration(database, { apply: argv.includes('--apply') });
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
