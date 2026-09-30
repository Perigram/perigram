import { createError } from 'h3';
import { CLASS_COLLECTIONS, lineageKeyForParent } from '~/packages/cts/src/index.js';
import { hasInstanceAccess } from '../../core/access/service.js';
import { declarationForType } from './service.js';

// The table-import batch construction. N rows as one call: every row constructs through
// the target type's registered construction handler behind the same
// access-engine call as `patch`, quantity expands into N identical
// children (per-piece nesting and traceability need distinct records),
// the declared children edge stamps the parent lineage key, and the
// imported table instance rides every row's provenance.
const BATCH_ROW_LIMIT = 200;
const BATCH_EXPANSION_LIMIT = 500;
const ROW_QUANTITY_LIMIT = 100;

// Pure: quantity expansion. Row 4 of a sheet with quantity 6 becomes six
// identical construction drafts — identical by design, distinct records
// by requirement (they are nested and tracked separately).
export function expandBatchRows(rows = []) {
  const expanded = [];
  const rowIndexes = [];
  let total = 0;
  rows.forEach((row, rowIndex) => {
    const quantity = Math.min(Math.max(Number(row?.quantity) || 1, 1), ROW_QUANTITY_LIMIT);
    total += quantity;
    if (total > BATCH_EXPANSION_LIMIT) {
      throw createError({
        statusCode: 400,
        message: `Batch expansion exceeds ${BATCH_EXPANSION_LIMIT} instances (row ${rowIndex + 1})`
      });
    }
    const { quantity: _drop, ...draft } = row || {};
    for (let copy = 0; copy < quantity; copy += 1) {
      expanded.push(draft);
      rowIndexes.push(rowIndex);
    }
  });
  return { drafts: expanded, rowIndexes };
}

// Pure: one row → one wire-shaped construction draft. Field leaves are
// whitelisted against the declaration (a mapping that targets undeclared
// fields is refused, not silently dropped) and the import provenance
// records the table source and mapping summary.
export function batchRowDraft(row = {}, index, { declaredFields, lineageKey, parentId, source, mode, mapping }) {
  const data = {};
  for (const [key, value] of Object.entries(row.data || {})) {
    if (!declaredFields.has(key)) {
      throw createError({
        statusCode: 400,
        message: `Row ${index + 1} references undeclared field ${key}`
      });
    }
    data[key] = value;
  }
  const name = row.name ?? row.identity?.name;
  const lineage = { ...(row.lineage || {}) };
  if (parentId && lineageKey) lineage[lineageKey] = parentId;
  return {
    ...(name != null && name !== '' ? { identity: { name } } : {}),
    data,
    ...(Object.keys(lineage).length ? { lineage } : {}),
    ...(row.relations ? { relations: row.relations } : {}),
    provenance: {
      op: 'table-import',
      sources: source ? [{ type: source.typeId, id: String(source.id) }] : [],
      effective: { mode, ...(mapping ? { mapping } : {}) }
    }
  };
}

// Resolve the declared children edge from parent type to child type: the
// entry's declared lineage key (SPEC §6 storage key), else the parent's
// camelized id key, else the entry map key — the same derivation the
// list filters and indexes walk.
function parentLineageKey(parentDeclaration, childTypeId) {
  for (const [key, edge] of Object.entries(parentDeclaration?.edges?.children || {})) {
    if ((edge?.types || []).includes(childTypeId)) {
      return edge?.lineageKey || lineageKeyForParent(parentDeclaration.id) || key;
    }
  }
  return null;
}

export async function createBatch({ registry, typeId, body = {}, auth, organizationId = null }) {
  const mode = String(body.mode || 'genericCreate');
  const service = registry.getInstanceService(typeId);
  if (!service) {
    throw createError({ statusCode: 404, statusMessage: `no instance service for type ${typeId}` });
  }
  const handler = service.constructionHandlers?.[mode];
  if (typeof handler !== 'function') {
    throw createError({ statusCode: 400, statusMessage: `type ${typeId} has no ${mode} construction mode` });
  }
  if (!service.processCapabilities?.createModes?.includes(mode)) {
    throw createError({ statusCode: 400, statusMessage: `type ${typeId} is not constructible via ${mode}` });
  }

  const declaration = await declarationForType(typeId, organizationId);
  const declaredFields = new Set(Object.keys(declaration?.fields || {}));

  const rows = Array.isArray(body.rows) ? body.rows : null;
  if (!rows || !rows.length) {
    throw createError({ statusCode: 400, statusMessage: 'batch construction requires rows' });
  }
  if (rows.length > BATCH_ROW_LIMIT) {
    throw createError({ statusCode: 400, statusMessage: `batch construction accepts at most ${BATCH_ROW_LIMIT} rows` });
  }

  let lineageKey = null;
  let parentId = null;
  if (body.parent?.typeId && body.parent?.id) {
    const parentDeclaration = await declarationForType(body.parent.typeId, organizationId);
    if (!parentDeclaration) {
      throw createError({ statusCode: 404, statusMessage: `unknown parent type ${body.parent.typeId}` });
    }
    lineageKey = parentLineageKey(parentDeclaration, typeId);
    if (!lineageKey) {
      throw createError({
        statusCode: 400,
        statusMessage: `type ${body.parent.typeId} declares no children edge to ${typeId} — rows cannot parent there`
      });
    }
    const parentService = registry.getInstanceService(body.parent.typeId);
    const parent = parentService
      ? await parentService.processGetById(String(body.parent.id), { userId: auth.userId, organizationId })
      : null;
    if (!parent) {
      throw createError({ statusCode: 404, statusMessage: `${body.parent.typeId} ${body.parent.id} not found` });
    }
    parentId = String(body.parent.id);
  }

  const { drafts, rowIndexes } = expandBatchRows(rows);
  const prepared = drafts.map((row, position) => batchRowDraft(
    row,
    rowIndexes[position],
    { declaredFields, lineageKey, parentId, source: body.source || null, mode, mapping: body.mapping || null }
  ));

  // The create gate is the same engine call `patch` makes, evaluated
  // against the would-be record (draft lineage plus the declared initial
  // status) so status-scoped create grants decide.
  const initialMain = declaration?.states?.main?.initial || null;
  const gateEntity = {
    typeId,
    states: initialMain ? { main: initialMain } : {},
    lineage: {
      ...(organizationId ? { organizationId: String(organizationId) } : {}),
      ...(parentId && lineageKey ? { [lineageKey]: parentId } : {})
    }
  };
  if (!hasInstanceAccess({
    entity: gateEntity,
    feature: CLASS_COLLECTIONS[declaration.class] || typeId,
    level: 'write',
    auth,
    typeId
  })) {
    throw createError({ statusCode: 403, statusMessage: 'Permission denied' });
  }

  const created = [];
  for (let index = 0; index < prepared.length; index += 1) {
    try {
      created.push(await handler(prepared[index], { userId: auth.userId, organizationId, executionAuth: auth }));
    } catch (error) {
      // Fail-fast with the failing row named and the created count
      // reported — construction is not transactional and partial results
      // must be visible, not silently discarded.
      throw createError({
        statusCode: 422,
        statusMessage: `Row ${rowIndexes[index] + 1} failed: ${error?.statusMessage || error?.message || 'construction failed'} — ${created.length} row(s) already created`
      });
    }
  }
  return { created, count: created.length };
}
