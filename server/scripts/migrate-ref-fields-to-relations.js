// One-shot ref-slot migration (SPEC §3/§6): every declared ref or
// list-of-ref field moves from `fields.<key>` to `relations.<key>`, and
// stored process definitions re-address their construct and field paths.
// Dry-run by default; `--apply` persists. Idempotent: re-running is a no-op.
import { connectDB } from '../db/mongo.js';
import { CLASS_COLLECTIONS, frameworkTypes, isRefDescriptor, refAcceptsOf } from '#packages/cts';

const CTS_TYPES = 'cts_types';
const PLUGIN_INSTALLS = 'plugin_installs';
const PROCESS_DEFINITIONS = 'process_definitions';

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function declarationKey(organizationId, typeId) {
  return `${organizationId == null ? '' : String(organizationId)}:${String(typeId || '')}`;
}

export function refFieldSpecs(declaration = {}) {
  return Object.entries(declaration.fields || {})
    .filter(([, descriptor]) => isRefDescriptor(descriptor))
    .map(([key, descriptor]) => ({
      key,
      many: descriptor.base === 'list',
      accepts: refAcceptsOf(descriptor)
    }));
}

async function declarationLookup(db) {
  const exact = new Map();
  const byType = new Map();
  const add = (organizationId, declaration) => {
    if (!declaration?.id) return;
    const key = declarationKey(organizationId, declaration.id);
    if (!exact.has(key)) exact.set(key, declaration);
    const entries = byType.get(declaration.id) || [];
    entries.push({ organizationId, declaration });
    byType.set(declaration.id, entries);
  };
  for (const declaration of frameworkTypes) add(null, declaration);
  for (const declaration of await db.collection(CTS_TYPES).find({}).toArray()) {
    add(declaration.organizationId, declaration);
  }
  for (const install of await db.collection(PLUGIN_INSTALLS).find({}).toArray()) {
    for (const declaration of install.declarations?.types || []) {
      add(install.organizationId, declaration);
    }
  }
  return (organizationId, typeId) => {
    const exactHit = exact.get(declarationKey(organizationId, typeId));
    if (exactHit) return exactHit;
    const candidates = (byType.get(typeId) || []).filter(entry => (
      entry.organizationId == null || String(entry.organizationId) === String(organizationId ?? '')
    ));
    if (candidates.length === 1) return candidates[0].declaration;
    const distinct = new Set((byType.get(typeId) || []).map(entry => entry.declaration));
    return distinct.size === 1 ? [...distinct][0] : null;
  };
}

function normalizeRefValue(value, spec) {
  const declaredTypes = spec.accepts.filter(type => type !== '*');
  const normalizeEntry = entry => {
    if (entry == null) return { value: null };
    if (typeof entry === 'string' || typeof entry === 'number') {
      if (declaredTypes.length !== 1) {
        return { error: `${spec.key} carries an untyped ref for ${declaredTypes.length} accepted types` };
      }
      return { value: { type: declaredTypes[0], id: String(entry) } };
    }
    if (!isRecord(entry)) return { error: `${spec.key} carries a non-ref value` };
    const id = entry.id ?? entry._id;
    if (id == null) return { error: `${spec.key} carries a ref without an id` };
    const type = entry.type || (declaredTypes.length === 1 ? declaredTypes[0] : '');
    if (!type) return { error: `${spec.key} carries an untyped ref for ${declaredTypes.length} accepted types` };
    return { value: { ...entry, type: String(type), id: String(id) } };
  };

  if (!spec.many) {
    if (Array.isArray(value)) {
      if (value.length !== 1) return { error: `${spec.key} is one-valued with ${value.length} stored refs` };
      return normalizeEntry(value[0]);
    }
    return normalizeEntry(value);
  }
  const entries = Array.isArray(value) ? value : [value];
  const normalized = [];
  for (const entry of entries) {
    const outcome = normalizeEntry(entry);
    if (outcome.error) return outcome;
    if (outcome.value != null) normalized.push(outcome.value);
  }
  return { value: normalized };
}

// Pure instance rewrite: a declared ref field under `fields` moves into
// `relations`; a conflicting relation value leaves the document untouched.
export function migrateRefFieldsDocument(document = {}, declaration = {}) {
  const specs = refFieldSpecs(declaration);
  if (!specs.length) return { data: document, changed: false, diagnostics: [] };
  const fields = { ...(document.fields || {}) };
  const relations = { ...(document.relations || {}) };
  const diagnostics = [];
  let changed = false;
  for (const spec of specs) {
    if (!hasOwn(fields, spec.key)) continue;
    const outcome = normalizeRefValue(fields[spec.key], spec);
    if (outcome.error) {
      diagnostics.push(outcome.error);
      continue;
    }
    if (hasOwn(relations, spec.key)
      && JSON.stringify(relations[spec.key] ?? null) !== JSON.stringify(outcome.value ?? null)) {
      diagnostics.push(`${spec.key} carries different values in fields and relations`);
      continue;
    }
    relations[spec.key] = outcome.value;
    delete fields[spec.key];
    changed = true;
  }
  if (!changed) return { data: document, changed: false, diagnostics };
  return {
    data: { ...document, fields, relations },
    changed: true,
    diagnostics
  };
}

function rewriteRefPath(value, specs) {
  if (typeof value !== 'string') return value;
  for (const spec of specs) {
    if (value === `fields.${spec.key}`) return `relations.${spec.key}`;
    if (value === `fields.${spec.key}.id`) return `relations.${spec.key}.id`;
  }
  return value;
}

function rewriteHandle(value, specs) {
  if (typeof value !== 'string') return value;
  for (const spec of specs) {
    if (value === `data:fields.${spec.key}`) return `data:relations.${spec.key}`;
  }
  return value;
}

// Pure process-definition rewrite: construct inputs, pinned field paths,
// defaults, join keys, and canvas handles address the relation slot.
export function migrateProcessDefinitionRefPaths(document = {}, resolveDeclaration = () => null) {
  if (!document.data || typeof document.data !== 'object') {
    return { data: document, changed: false, diagnostics: [] };
  }
  const organizationId = document.organizationId ?? document.data.organizationId ?? null;
  const data = structuredClone(document.data);
  const diagnostics = [];
  let changed = false;
  const definitionSpecs = [...new Map(Object.values(data.processNodes || {})
    .filter(record => isRecord(record) && record.typeId)
    .flatMap(record => refFieldSpecs(resolveDeclaration(organizationId, record.typeId) || {}))
    .map(spec => [spec.key, spec])).values()];
  for (const record of Object.values(data.processNodes || {})) {
    if (!isRecord(record)) continue;
    const specs = refFieldSpecs(resolveDeclaration(organizationId, record.typeId) || {});
    if (!specs.length && record.kind !== 'collection.join') continue;
    const nextPath = rewriteRefPath(record.path, specs);
    if (nextPath !== record.path) {
      record.path = nextPath;
      changed = true;
    }
    const inputs = record.construction?.inputs;
    if (Array.isArray(inputs)) {
      for (const input of inputs) {
        const path = rewriteRefPath(input.path, specs);
        if (path !== input.path) {
          input.path = path;
          changed = true;
        }
        const id = rewriteRefPath(input.id, specs);
        if (id !== input.id) {
          input.id = id;
          changed = true;
        }
      }
    }
    if (isRecord(record.inputDefaults)) {
      for (const key of Object.keys(record.inputDefaults)) {
        const nextKey = rewriteRefPath(key, specs);
        if (nextKey === key) continue;
        record.inputDefaults[nextKey] = record.inputDefaults[key];
        delete record.inputDefaults[key];
        changed = true;
      }
    }
    if (record.kind === 'collection.join') {
      const joinSpecs = specs.length ? specs : definitionSpecs;
      for (const key of ['leftKey', 'rightKey']) {
        const exact = joinSpecs.find(spec => (
          record[key] === `fields.${spec.key}` || record[key] === `fields.${spec.key}.id`
        ));
        if (!exact) continue;
        record[key] = `relations.${exact.key}.id`;
        changed = true;
      }
    }
  }
  const recordByGraphNode = new Map();
  for (const node of data.graph?.nodes || []) {
    const record = data.processNodes?.[node.data?.refId];
    if (node.type === 'processNode' && record) recordByGraphNode.set(node.id, record);
  }
  for (const edge of data.graph?.edges || []) {
    if (!isRecord(edge)) continue;
    const typeIds = [recordByGraphNode.get(edge.source)?.typeId, recordByGraphNode.get(edge.target)?.typeId];
    const specs = [...new Map(typeIds
      .filter(Boolean)
      .flatMap(typeId => refFieldSpecs(resolveDeclaration(organizationId, typeId) || {}))
      .map(spec => [spec.key, spec])).values()];
    if (!specs.length) continue;
    for (const key of ['sourceHandle', 'targetHandle']) {
      const next = rewriteHandle(edge[key], specs);
      if (next !== edge[key]) {
        edge[key] = next;
        changed = true;
      }
    }
  }
  return {
    data: changed ? { ...document, data } : document,
    changed,
    diagnostics
  };
}

export async function runRefFieldMigration(database, { apply = false } = {}) {
  const db = database || await connectDB();
  const resolveDeclaration = await declarationLookup(db);
  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    instances: { scanned: 0, migrated: 0, skipped: 0 },
    definitions: { scanned: 0, migrated: 0, skipped: 0 },
    failures: []
  };

  for (const collection of Object.values(CLASS_COLLECTIONS)) {
    const cursor = db.collection(collection).find({});
    for await (const doc of cursor) {
      summary.instances.scanned += 1;
      const declaration = resolveDeclaration(doc.organizationId, doc.type);
      if (!declaration) {
        summary.instances.skipped += 1;
        continue;
      }
      const result = migrateRefFieldsDocument(doc, declaration);
      if (result.diagnostics.length) {
        summary.failures.push(...result.diagnostics.map(message => `${collection}/${doc._id}: ${message}`));
      }
      if (!result.changed) {
        summary.instances.skipped += 1;
        continue;
      }
      if (apply) {
        const set = {};
        const unset = {};
        for (const spec of refFieldSpecs(declaration)) {
          if (!hasOwn(doc.fields || {}, spec.key)) continue;
          set[`relations.${spec.key}`] = result.data.relations[spec.key] ?? null;
          unset[`fields.${spec.key}`] = '';
        }
        await db.collection(collection).updateOne({ _id: doc._id }, {
          $set: { ...set, updatedAt: new Date().toISOString() },
          $unset: unset
        });
      }
      summary.instances.migrated += 1;
    }
  }

  const definitions = db.collection(PROCESS_DEFINITIONS).find({});
  for await (const definition of definitions) {
    summary.definitions.scanned += 1;
    const result = migrateProcessDefinitionRefPaths(definition, resolveDeclaration);
    if (result.diagnostics.length) {
      summary.failures.push(...result.diagnostics.map(message => `${PROCESS_DEFINITIONS}/${definition._id}: ${message}`));
    }
    if (!result.changed) {
      summary.definitions.skipped += 1;
      continue;
    }
    if (apply) {
      await db.collection(PROCESS_DEFINITIONS).updateOne(
        { _id: definition._id },
        { $set: { data: result.data.data, updatedAt: new Date().toISOString() } }
      );
    }
    summary.definitions.migrated += 1;
  }

  return summary;
}

const invokedDirectly = process.argv[1]?.endsWith('migrate-ref-fields-to-relations.js');
if (invokedDirectly) {
  runRefFieldMigration(null, { apply: process.argv.includes('--apply') }).then(summary => {
    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.failures.length ? 1 : 0);
  });
}
