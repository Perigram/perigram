import {
  combineDataPackets,
  createDataPacket,
  crossDataPackets,
  flattenDataPacket,
  graftDataPacket,
  mapDataPacket,
  normalizeDataPacket,
  packetValue,
  selectDataBranch,
  simplifyDataPacket,
  transposeDataPacket
} from './data-tree.js';

export async function executeProcessDataNode(record = {}, inputs = {}, context = {}) {
  const kind = record.kind;
  const defaultPackets = Object.fromEntries(Object.entries(record.inputDefaults || {})
    .map(([id, value]) => [id, createDataPacket(structuredClone(value))]));
  const packets = {
    ...defaultPackets,
    ...Object.fromEntries(Object.entries(inputs).map(([id, packet]) => [id, normalizeDataPacket(packet)]))
  };
  if (kind.startsWith('source.')) return executeSource(record, context);
  if (kind === 'value.cast' || kind === 'value.parse') return mapDataPacket(required(packets, 'value', record), value => cast(value, record.outputType?.base || record.base));
  if (kind === 'value.convertUnit') return mapDataPacket(required(packets, 'value', record), value => convertUnit(value, record.fromUnit, record.toUnit, context.units));
  if (kind === 'value.toEntityRef') return mapDataPacket(required(packets, 'value', record), value => entityReference(value, record.entityType));
  if (kind === 'value.toJson') return mapDataPacket(required(packets, 'value', record), value => structuredClone(value));
  if (kind === 'value.required') return mapDataPacket(required(packets, 'value', record), value => {
    if (value == null) throw new Error(`${record.id || kind} received a null required value`);
    return value;
  });
  if (kind === 'value.coalesce') return combineDataPackets([required(packets, 'value', record), required(packets, 'fallback', record)], ([value, fallback]) => value ?? fallback);
  if (kind === 'value.validate') return mapDataPacket(required(packets, 'value', record), value => validateValue(value, record));
  if (kind === 'value.math') return executeMath(record, packets);
  if (kind === 'value.string') return executeString(record, packets);
  if (kind === 'value.dateTime') return executeDateTime(record, packets);
  if (kind === 'value.enum') return mapDataPacket(required(packets, 'value', record), value => String(value));
  if (kind === 'value.compare') return combineDataPackets([required(packets, 'left', record), required(packets, 'right', record)], ([left, right]) => compare(record.operation, left, right));
  if (kind === 'value.logic') return executeLogic(record, packets);
  if (kind === 'value.format') return mapDataPacket(required(packets, 'value', record), value => format(record, value));
  if (kind === 'collection.makeList') return createDataPacket([packetValue(required(packets, 'value', record))], 'list');
  if (kind === 'collection.packArray') {
    return createDataPacket(structuredClone(flattenDataPacket(required(packets, 'value', record)).branches[0].items));
  }
  if (kind === 'collection.unpackArray') {
    const value = packetValue(required(packets, 'value', record));
    if (!Array.isArray(value)) throw new Error(`${record.id || kind} requires an array value`);
    return createDataPacket(structuredClone(value), 'list');
  }
  if (kind === 'collection.concat') return createDataPacket([
    ...flattenDataPacket(required(packets, 'left', record)).branches[0].items,
    ...flattenDataPacket(required(packets, 'right', record)).branches[0].items
  ], 'list');
  if (kind === 'collection.itemAt') {
    const values = flattenDataPacket(required(packets, 'items', record)).branches[0].items;
    return createDataPacket(values.at(Number(packetValue(required(packets, 'index', record)))) ?? null);
  }
  if (kind === 'collection.slice') {
    const values = flattenDataPacket(required(packets, 'items', record)).branches[0].items;
    const start = packets.start ? Number(packetValue(packets.start)) : undefined;
    const end = packets.end ? Number(packetValue(packets.end)) : undefined;
    return createDataPacket(values.slice(start, end), 'list');
  }
  if (kind === 'collection.count') return createDataPacket(flattenDataPacket(required(packets, 'value', record)).branches[0].items.length);
  if (kind === 'collection.distinct') return createDataPacket(distinct(flattenDataPacket(required(packets, 'value', record)).branches[0].items), 'list');
  if (kind === 'collection.sort') return createDataPacket(sortValues(flattenDataPacket(required(packets, 'value', record)).branches[0].items, record), 'list');
  if (kind === 'collection.groupBy') return groupByPackets(required(packets, 'items', record), required(packets, 'keys', record));
  if (kind === 'collection.filter') return filterPackets(required(packets, 'items', record), required(packets, 'mask', record));
  if (kind === 'tree.flatten') return flattenDataPacket(required(packets, 'value', record));
  if (kind === 'tree.graft') return graftDataPacket(required(packets, 'value', record));
  if (kind === 'tree.simplify') return simplifyDataPacket(required(packets, 'value', record));
  if (kind === 'tree.branch') return selectDataBranch(required(packets, 'tree', record), packetValue(required(packets, 'path', record)));
  if (kind === 'tree.zip') return combineDataPackets([required(packets, 'left', record), required(packets, 'right', record)], values => values);
  if (kind === 'tree.unzip') return unzipPacket(required(packets, 'value', record));
  if (kind === 'tree.cross') return crossDataPackets(required(packets, 'left', record), required(packets, 'right', record));
  if (kind === 'tree.transpose') return transposeDataPacket(required(packets, 'value', record));
  if (kind === 'record.getField') {
    return mapDataPacket(required(packets, 'block', record), value => {
      const fieldValue = readPath(value, blockLocalPath(record.block, record.path));
      if (record.compositionMode === 'ancestors' && fieldValue != null) {
        return { type: record.type?.entityType, id: fieldValue };
      }
      return fieldValue;
    });
  }
  if (kind === 'record.fieldChange') return mapDataPacket(required(packets, 'value', record), value => ({ entityType: record.entityType, changes: [{ path: record.path, operation: record.operation || 'set', value }] }));
  if (kind === 'record.mergeChanges') return combineDataPackets([required(packets, 'left', record), required(packets, 'right', record)], ([left, right]) => mergePatches(left, right));
  if (kind === 'record.applyChanges') return combineDataPackets([required(packets, 'record', record), required(packets, 'changes', record)], ([value, patch]) => applyPatch(value, patch));
  if (kind === 'record.composeBlock' || kind === 'record.modifyBlock') {
    if (record.compositionMode && Array.isArray(record.entries)) {
      const entries = record.entries;
      const inputIds = [
        ...(kind === 'record.modifyBlock' ? ['block'] : []),
        ...entries.map(entry => `entry:${entry.id}`)
      ];
      return combineDataPackets(inputIds.map(id => required(packets, id, record)), values => {
        const initial = kind === 'record.modifyBlock' ? structuredClone(values[0] || {}) : {};
        const offset = kind === 'record.modifyBlock' ? 1 : 0;
        entries.forEach((entry, index) => {
          writeOpenBlockEntry(initial, record.compositionMode, entry, values[index + offset]);
        });
        return initial;
      });
    }
    const inputIds = [
      ...(kind === 'record.modifyBlock' ? ['block'] : []),
      ...(record.fields || []).filter(path => packets[path])
    ];
    return combineDataPackets(inputIds.map(id => required(packets, id, record)), values => {
      const initial = kind === 'record.modifyBlock' ? structuredClone(values[0] || {}) : {};
      const offset = kind === 'record.modifyBlock' ? 1 : 0;
      inputIds.slice(offset).forEach((path, index) => {
        const value = structuredClone(values[index + offset]);
        if (path === record.block) {
          for (const key of Object.keys(initial)) delete initial[key];
          if (value && typeof value === 'object' && !Array.isArray(value)) Object.assign(initial, value);
          return;
        }
        writePath(initial, blockLocalPath(record.block, path), value);
      });
      return initial;
    });
  }
  if (kind === 'record.construct' || kind === 'record.entityDraft') return createDataPacket(constructRecord(record, packets));
  if (kind === 'record.deconstruct') {
    if (context.outputId) {
      if (!(record.blocks || []).includes(context.outputId)) {
        throw new Error(`Node ${record.id || kind} does not expose block ${context.outputId}`);
      }
      return mapDataPacket(required(packets, 'entity', record), value => structuredClone(value?.[context.outputId]));
    }
    return mapDataPacket(required(packets, 'entity', record), value => (
      Object.fromEntries((record.blocks || []).map(block => [block, structuredClone(value?.[block])]))
    ));
  }
  if (kind === 'record.getBlock') return mapDataPacket(required(packets, 'entity', record), value => structuredClone(value?.[record.block]));
  if (kind === 'predicate.field') return createDataPacket({ kind: 'field', entityType: record.entityType, path: record.path, operation: record.operation, value: packetValue(required(packets, 'value', record)) });
  if (kind === 'predicate.logic') return createDataPacket({
    kind: 'logic',
    entityType: record.entityType,
    operation: record.operation,
    left: packetValue(required(packets, 'left', record)),
    ...(packets.right ? { right: packetValue(packets.right) } : {})
  });
  if (kind.startsWith('read.')) return executeRead(record, packets, context);
  throw new Error(`Node ${record.id || kind} is not a data/read operation`);
}

function writeOpenBlockEntry(block, mode, entry, value) {
  if (mode === 'ancestors') {
    const id = value?.id || value?._id || value?.identity?.uid;
    if (!entry.key || !entry.entityType || !id) throw new Error(`Lineage entry ${entry.id} requires a key and typed entity reference`);
    block[entry.key] = id;
    return;
  }
  const key = String(entry.key || '').trim();
  if (!key) throw new Error(`Block entry ${entry.id} requires a key`);
  const normalized = mode === 'relations' && entry.cardinality === 'many' && !Array.isArray(value)
    ? [value]
    : value;
  writePath(block, key, structuredClone(normalized));
}

function blockLocalPath(block, path) {
  const prefix = `${block}.`;
  return String(path || '').startsWith(prefix) ? String(path).slice(prefix.length) : String(path || '');
}

export function evaluateEntityPredicate(predicate, entity) {
  if (!predicate) return true;
  if (predicate.kind === 'field') return compare(predicate.operation, readPath(entity, predicate.path), predicate.value);
  if (predicate.kind === 'logic') {
    if (predicate.operation === 'not') return !evaluateEntityPredicate(predicate.left, entity);
    const left = evaluateEntityPredicate(predicate.left, entity);
    const right = evaluateEntityPredicate(predicate.right, entity);
    if (predicate.operation === 'and') return left && right;
    if (predicate.operation === 'or') return left || right;
  }
  throw new Error(`Unsupported entity predicate ${predicate.kind}:${predicate.operation}`);
}

export function applyPatch(record, patch) {
  const result = structuredClone(record);
  for (const change of patch?.changes || []) {
    if (change.operation === 'unset') unsetPath(result, change.path);
    else if (change.operation === 'append') writePath(result, change.path, [...(readPath(result, change.path) || []), structuredClone(change.value)]);
    else if (change.operation === 'remove') writePath(result, change.path, (readPath(result, change.path) || []).filter(value => !same(value, change.value)));
    else writePath(result, change.path, structuredClone(change.value));
  }
  return result;
}

async function executeSource(record, context) {
  if (record.kind === 'source.currentTime') return createDataPacket((context.now || (() => new Date()))().toISOString());
  if (record.kind === 'source.processInput') return createDataPacket(readPath(context.inputs || {}, record.path), record.type?.shape);
  if (record.kind === 'source.triggerPayload') return createDataPacket(readPath(context.trigger || {}, record.path), record.type?.shape);
  if (record.kind === 'source.secretRef') return createDataPacket({ secretRef: record.secretRef });
  return createDataPacket(structuredClone(record.value), record.type?.shape || record.shape || 'item');
}

async function executeRead(record, packets, context) {
  if (record.kind === 'read.currentEntity') return createDataPacket(await context.currentEntity?.(record.entityType));
  if (record.kind === 'read.entityById') return createDataPacket(await context.entityById?.(record.entityType, packetValue(required(packets, 'id', record))));
  if (record.kind === 'read.resolveEntityRef') return createDataPacket(await context.resolveEntityRef?.(packetValue(required(packets, 'value', record))));
  if (record.kind === 'read.parent') return createDataPacket(await context.parentEntity?.(packetValue(required(packets, 'value', record)), record.entityType));
  if (record.kind === 'read.children') return createDataPacket(await context.childEntities?.(packetValue(required(packets, 'value', record)), record.entityType) || [], 'list');
  if (record.kind === 'read.related') return createDataPacket(await context.relatedEntities?.(packetValue(required(packets, 'value', record)), record.relationKey || record.relation, record.entityType) || [], 'list');
  if (record.kind === 'read.queryEntities') {
    const predicate = packets.predicate ? packetValue(packets.predicate) : null;
    return createDataPacket(await context.queryEntities?.(record.entityType, predicate) || [], 'list');
  }
  if (record.kind === 'read.filterRecords') {
    const entities = flattenDataPacket(required(packets, 'entities', record)).branches[0].items;
    const predicate = packetValue(required(packets, 'predicate', record));
    return createDataPacket(entities.filter(entity => evaluateEntityPredicate(predicate, entity)), 'list');
  }
  throw new Error(`Unsupported read node ${record.kind}`);
}

function executeString(record, packets) {
  if (record.operation === 'replace') {
    return combineDataPackets([
      required(packets, 'text', record),
      required(packets, 'search', record),
      required(packets, 'replacement', record)
    ], ([text, search, replacement]) => String(text).split(String(search)).join(String(replacement)));
  }
  if (record.operation === 'substring') {
    return combineDataPackets([
      required(packets, 'text', record),
      required(packets, 'start', record),
      ...(packets.end ? [packets.end] : [])
    ], values => String(values[0]).slice(Number(values[1]), values.length > 2 ? Number(values[2]) : undefined));
  }
  if (record.operation === 'split') {
    return createDataPacket(String(packetValue(required(packets, 'text', record)))
      .split(String(packetValue(required(packets, 'separator', record)))), 'list');
  }
  if (record.operation === 'join') {
    return createDataPacket(
      flattenDataPacket(required(packets, 'items', record)).branches[0].items
        .join(String(packetValue(required(packets, 'separator', record))))
    );
  }
  if (record.operation === 'length') {
    return mapDataPacket(required(packets, 'value', record), value => String(value).length);
  }
  const left = required(packets, ['upper', 'lower', 'trim'].includes(record.operation) ? 'value' : 'left', record);
  if (['upper', 'lower', 'trim'].includes(record.operation)) {
    return mapDataPacket(left, value => record.operation === 'upper' ? String(value).toUpperCase()
      : record.operation === 'lower' ? String(value).toLowerCase() : String(value).trim());
  }
  return combineDataPackets([left, required(packets, 'right', record)], ([leftValue, right]) => `${leftValue ?? ''}${right ?? ''}`);
}

function executeLogic(record, packets) {
  const left = required(packets, 'left', record);
  if (['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'startsWith', 'endsWith'].includes(record.operation)) {
    return combineDataPackets([left, required(packets, 'right', record)], ([a, b]) => compare(record.operation, a, b));
  }
  if (['isNull', 'isNotNull'].includes(record.operation)) {
    return mapDataPacket(left, value => compare(record.operation, value, null));
  }
  if (record.operation === 'not') return mapDataPacket(left, value => !value);
  if (!['and', 'or', 'xor', 'nand', 'nor', 'xnor'].includes(record.operation)) {
    throw new Error(`Unsupported logic operation ${record.operation}`);
  }
  return combineDataPackets([left, required(packets, 'right', record)], ([a, b]) => {
    if (record.operation === 'and') return Boolean(a && b);
    if (record.operation === 'or') return Boolean(a || b);
    if (record.operation === 'xor') return Boolean(a) !== Boolean(b);
    if (record.operation === 'nand') return !Boolean(a && b);
    if (record.operation === 'nor') return !Boolean(a || b);
    return Boolean(a) === Boolean(b);
  });
}

function executeDateTime(record, packets) {
  if (['differenceDays', 'differenceHours', 'differenceMinutes'].includes(record.operation)) {
    return combineDataPackets([
      required(packets, 'left', record),
      required(packets, 'right', record)
    ], ([left, right]) => {
      const divisor = record.operation === 'differenceDays' ? 86_400_000
        : record.operation === 'differenceHours' ? 3_600_000 : 60_000;
      return (dateValue(left).getTime() - dateValue(right).getTime()) / divisor;
    });
  }
  const sourceId = ['addDuration', 'subtractDuration', 'addDays', 'addHours', 'addMinutes', 'addMonths'].includes(record.operation) ? 'date' : 'value';
  const source = required(packets, sourceId, record);
  if (['startOfDay', 'endOfDay'].includes(record.operation)) {
    return mapDataPacket(source, item => {
      const date = dateValue(item);
      if (record.operation === 'startOfDay') date.setUTCHours(0, 0, 0, 0);
      else date.setUTCHours(23, 59, 59, 999);
      return date.toISOString();
    });
  }
  const adjustmentId = ['addDuration', 'subtractDuration'].includes(record.operation) ? 'duration' : 'amount';
  return combineDataPackets([source, required(packets, adjustmentId, record)], ([item, adjustment]) => {
    const date = dateValue(item);
    const direction = record.operation.startsWith('subtract') ? -1 : 1;
    if (record.operation === 'addMonths') {
      date.setUTCMonth(date.getUTCMonth() + direction * Number(adjustment));
      return date.toISOString();
    }
    const milliseconds = record.operation === 'addDays'
      ? Number(adjustment) * 86_400_000
      : record.operation === 'addHours'
        ? Number(adjustment) * 3_600_000
        : record.operation === 'addMinutes'
          ? Number(adjustment) * 60_000
          : durationMilliseconds(adjustment);
    date.setTime(date.getTime() + direction * milliseconds);
    return date.toISOString();
  });
}

function executeMath(record, packets) {
  if (['absolute', 'negate', 'round', 'floor', 'ceil', 'sqrt'].includes(record.operation)) {
    return mapDataPacket(required(packets, 'value', record), value => math(record.operation, value));
  }
  if (record.operation === 'clamp') {
    return combineDataPackets([
      required(packets, 'value', record),
      required(packets, 'min', record),
      required(packets, 'max', record)
    ], ([value, min, max]) => Math.min(Number(max), Math.max(Number(min), Number(value))));
  }
  return combineDataPackets([
    required(packets, 'left', record),
    required(packets, 'right', record)
  ], ([left, right]) => math(record.operation, left, right));
}

function dateValue(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date ${value}`);
  return date;
}

function durationMilliseconds(value) {
  if (typeof value === 'number') return value;
  const match = String(value || '').match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  if (!match) throw new Error(`Invalid duration ${value}`);
  return (Number(match[1] || 0) * 86_400 + Number(match[2] || 0) * 3_600
    + Number(match[3] || 0) * 60 + Number(match[4] || 0)) * 1_000;
}

function required(inputs, id, record) {
  if (!inputs[id]) throw new Error(`Node ${record.id || record.kind} requires input ${id}`);
  return inputs[id];
}

function cast(value, base = 'json') {
  if (base === 'string') return String(value);
  if (base === 'number') {
    const result = Number(value);
    if (!Number.isFinite(result)) throw new Error(`Cannot cast ${value} to number`);
    return result;
  }
  if (base === 'integer') {
    const result = Number(value);
    if (!Number.isInteger(result)) throw new Error(`Cannot cast ${value} to integer`);
    return result;
  }
  if (base === 'boolean') {
    if (value === true || value === 'true' || value === 1) return true;
    if (value === false || value === 'false' || value === 0) return false;
    throw new Error(`Cannot cast ${value} to boolean`);
  }
  if (base === 'date' || base === 'dateTime') {
    const result = new Date(value);
    if (Number.isNaN(result.getTime())) throw new Error(`Cannot cast ${value} to ${base}`);
    return base === 'date' ? result.toISOString().slice(0, 10) : result.toISOString();
  }
  return structuredClone(value);
}

function math(operation, left, right) {
  const a = Number(left);
  const b = Number(right);
  if (operation === 'absolute') return Math.abs(a);
  if (operation === 'negate') return -a;
  if (operation === 'round') return Math.round(a);
  if (operation === 'floor') return Math.floor(a);
  if (operation === 'ceil') return Math.ceil(a);
  if (operation === 'sqrt') {
    if (a < 0) throw new Error('Square root requires a non-negative value');
    return Math.sqrt(a);
  }
  if (operation === 'add') return a + b;
  if (operation === 'subtract') return a - b;
  if (operation === 'multiply') return a * b;
  if (operation === 'divide') {
    if (b === 0) throw new Error('Division by zero');
    return a / b;
  }
  if (operation === 'modulo') return a % b;
  if (operation === 'power') return a ** b;
  if (operation === 'min') return Math.min(a, b);
  if (operation === 'max') return Math.max(a, b);
  throw new Error(`Unsupported math operation ${operation}`);
}

function compare(operation, left, right) {
  if (operation === 'eq') return same(left, right);
  if (operation === 'neq') return !same(left, right);
  if (operation === 'gt') return left > right;
  if (operation === 'gte') return left >= right;
  if (operation === 'lt') return left < right;
  if (operation === 'lte') return left <= right;
  if (operation === 'contains') return left?.includes?.(right) || false;
  if (operation === 'startsWith') return String(left).startsWith(String(right));
  if (operation === 'endsWith') return String(left).endsWith(String(right));
  if (operation === 'isNull') return left == null;
  if (operation === 'isNotNull') return left != null;
  throw new Error(`Unsupported comparison ${operation}`);
}

function validateValue(value, record) {
  if (record.required && value == null) throw new Error(record.message || 'Value is required');
  if (record.pattern && !new RegExp(record.pattern).test(String(value))) throw new Error(record.message || 'Value does not match');
  if (record.min != null && Number(value) < Number(record.min)) throw new Error(record.message || `Value is below ${record.min}`);
  if (record.max != null && Number(value) > Number(record.max)) throw new Error(record.message || `Value is above ${record.max}`);
  return value;
}

function convertUnit(value, from, to, custom = {}) {
  if (!from || !to || from === to) return value;
  const factors = { mm: 1, cm: 10, m: 1000, mm2: 1, cm2: 100, m2: 1_000_000, degree: 1, radian: 180 / Math.PI, ...custom };
  if (!factors[from] || !factors[to]) throw new Error(`Unsupported unit conversion ${from} → ${to}`);
  return Number(value) * factors[from] / factors[to];
}

function entityReference(value, entityType) {
  if (!value || typeof value !== 'object') throw new Error('Entity reference conversion requires an entity');
  return { type: entityType || value.type || value.entityType, id: String(value._id || value.id || value.identity?.uid) };
}

function format(record, value) {
  if (record.template) return String(record.template).replaceAll('{value}', String(value ?? ''));
  return new Intl.NumberFormat(record.locale || 'en', record.options || {}).format(value);
}

function distinct(values) {
  const seen = new Set();
  return values.filter(value => {
    const key = JSON.stringify(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortValues(values, record) {
  return [...values].sort((left, right) => {
    const a = record.path ? readPath(left, record.path) : left;
    const b = record.path ? readPath(right, record.path) : right;
    const result = a < b ? -1 : a > b ? 1 : 0;
    return record.direction === 'desc' ? -result : result;
  });
}

function groupByPackets(itemsPacket, keysPacket) {
  const combined = combineDataPackets([itemsPacket, keysPacket], values => values);
  const groups = new Map();
  for (const [item, key] of combined.branches[0].items) {
    const serialized = JSON.stringify(key);
    if (!groups.has(serialized)) groups.set(serialized, []);
    groups.get(serialized).push(item);
  }
  return {
    shape: 'tree',
    branches: [...groups.values()].map((items, index) => ({ path: [index], items }))
  };
}

function filterPackets(itemsPacket, maskPacket) {
  const combined = combineDataPackets([itemsPacket, maskPacket], values => values);
  return {
    shape: combined.shape,
    branches: combined.branches.map(branch => ({
      path: branch.path,
      items: branch.items.filter(([, include]) => include).map(([value]) => value)
    }))
  };
}

function unzipPacket(packet) {
  const values = flattenDataPacket(packet).branches[0].items;
  const width = Math.max(0, ...values.map(value => Array.isArray(value) ? value.length : 0));
  return {
    shape: 'tree',
    branches: Array.from({ length: width }, (_, index) => ({
      path: [index],
      items: values.map(value => value[index])
    }))
  };
}

function constructRecord(record, packets) {
  const result = {};
  for (const path of record.fields || []) {
    if (packets[path]) writePath(result, path, packetValue(packets[path]));
  }
  return result;
}

function mergePatches(left, right) {
  if (left?.entityType && right?.entityType && left.entityType !== right.entityType) {
    throw new Error(`Cannot merge ${left.entityType} and ${right.entityType} patches`);
  }
  return { entityType: left?.entityType || right?.entityType || '', changes: [...(left?.changes || []), ...(right?.changes || [])] };
}

function readPath(value, path = '') {
  return String(path).split('.').filter(Boolean).reduce((current, key) => current?.[key], value);
}

function writePath(target, path, value) {
  const parts = String(path).split('.').filter(Boolean);
  let current = target;
  parts.slice(0, -1).forEach(part => {
    current[part] = current[part] && typeof current[part] === 'object' ? current[part] : {};
    current = current[part];
  });
  if (parts.length) current[parts.at(-1)] = value;
}

function unsetPath(target, path) {
  const parts = String(path).split('.').filter(Boolean);
  const parent = parts.slice(0, -1).reduce((current, key) => current?.[key], target);
  if (parent) delete parent[parts.at(-1)];
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
