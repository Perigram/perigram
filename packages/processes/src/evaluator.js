import {
  combineDataPackets,
  cleanDataTree,
  createDataPacket,
  crossDataPackets,
  flattenDataPacket,
  graftDataPacket,
  mapDataPacket,
  normalizeDataPacket,
  packetValue,
  selectDataBranch,
  simplifyDataPacket,
  solveDataTrees,
  transformDataTree,
  transposeDataPacket,
  treeStats
} from './data-tree.js';
import { MAKE_LIST_INPUTS } from './node-catalog.js';

export async function executeProcessDataNode(record = {}, inputs = {}, context = {}) {
  const kind = record.kind;
  const defaultPackets = Object.fromEntries(Object.entries(record.inputDefaults || {})
    .map(([id, value]) => [id, createDataPacket(structuredClone(value))]));
  const rawPackets = {
    ...defaultPackets,
    ...Object.fromEntries(Object.entries(inputs).map(([id, packet]) => [id, normalizeDataPacket(packet)]))
  };
  const packets = Object.fromEntries(Object.entries(rawPackets).map(([id, packet]) => [
    id,
    transformDataTree(packet, record.inputTransforms?.[id])
  ]));
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
  if (kind === 'collection.makeList') {
    const connected = MAKE_LIST_INPUTS.filter(id => packets[id]);
    if (!connected.length) return createDataPacket([], 'list');
    return solveDataTrees(
      connected.map(id => ({ tree: packets[id], access: 'item' })),
      values => values,
      { outputAccess: 'list', matching: record.matching }
    );
  }
  if (kind === 'collection.packArray') {
    return solveDataTrees([{ tree: required(packets, 'value', record), access: 'list' }], ([items]) => structuredClone(items));
  }
  if (kind === 'collection.unpackArray') {
    return solveDataTrees([{ tree: required(packets, 'value', record), access: 'item' }], ([value]) => {
      if (!Array.isArray(value)) throw new Error(`${record.id || kind} requires an array value`);
      return structuredClone(value);
    }, { outputAccess: 'list' });
  }
  if (kind === 'collection.concat') return solveDataTrees([
    { tree: required(packets, 'left', record), access: 'list' },
    { tree: required(packets, 'right', record), access: 'list' }
  ], ([left, right]) => [...left, ...right], { outputAccess: 'list', matching: record.matching });
  if (kind === 'collection.itemAt') {
    const inputs = [{ tree: required(packets, 'items', record), access: 'list' }];
    if (packets.index) inputs.push({ tree: packets.index, access: 'item' });
    return solveDataTrees(inputs, values => (values[1] == null ? null : values[0].at(Number(values[1])) ?? null), { matching: record.matching });
  }
  if (kind === 'collection.slice') {
    const hasStart = Boolean(packets.start);
    const hasEnd = Boolean(packets.end);
    const inputs = [{ tree: required(packets, 'items', record), access: 'list' }];
    if (hasStart) inputs.push({ tree: packets.start, access: 'item' });
    if (hasEnd) inputs.push({ tree: packets.end, access: 'item' });
    return solveDataTrees(inputs, values => {
      let cursor = 1;
      const start = hasStart ? Number(values[cursor++]) : undefined;
      const end = hasEnd ? Number(values[cursor]) : undefined;
      return values[0].slice(start, end);
    }, { outputAccess: 'list', matching: record.matching });
  }
  if (kind === 'collection.count') return solveDataTrees([{ tree: required(packets, 'value', record), access: 'list' }], ([items]) => items.length);
  if (kind === 'collection.distinct') return distinctPackets(required(packets, 'items', record), packets.keys);
  if (kind === 'collection.sort') return sortPackets(required(packets, 'items', record), required(packets, 'keys', record), record.direction);
  if (kind === 'collection.reverse') return solveDataTrees([{ tree: required(packets, 'value', record), access: 'list' }], ([items]) => [...items].reverse(), { outputAccess: 'list' });
  if (kind === 'collection.shift') return solveDataTrees([
    { tree: required(packets, 'items', record), access: 'list' }, { tree: required(packets, 'offset', record), access: 'item' }
  ], ([items, offset]) => shiftValues(items, Number(offset)), { outputAccess: 'list', matching: record.matching });
  if (kind === 'collection.partition') return solveDataTrees([
    { tree: required(packets, 'items', record), access: 'list' }, { tree: required(packets, 'size', record), access: 'item' }
  ], ([items, size]) => partitionValues(items, Number(size)), { outputAccess: 'tree', matching: record.matching });
  if (kind === 'collection.dispatch') return dispatchPackets(required(packets, 'items', record), required(packets, 'mask', record), context.outputId);
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
  if (kind === 'tree.clean') return cleanDataTree(required(packets, 'value', record));
  if (kind === 'tree.stats') return createDataPacket(treeStats(required(packets, 'value', record)));
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
      const entries = record.entries.filter(entry => packets[`entry:${entry.id}`]);
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

export async function executeProcessEffectNode(record = {}, inputs = {}, invoke) {
  if (typeof invoke !== 'function') throw new Error(`Effect executor is required for ${record.kind}`);
  if (record.matching === 'cross') throw new Error(`${record.kind} cannot use Cross matching for mutations`);

  const entries = Object.entries(inputs).map(([id, tree]) => [
    id,
    transformDataTree(normalizeDataPacket(tree), record.inputTransforms?.[id])
  ]);
  assertMutationInputsAlign(record.kind, entries.map(([, tree]) => tree));

  const invocations = [];
  const result = solveDataTrees(entries.map(([, tree]) => ({ tree, access: 'item' })), (values, location) => {
    const marker = invocations.length;
    invocations.push({
      inputs: Object.fromEntries(entries.map(([id], index) => [id, values[index]])),
      location
    });
    return marker;
  }, { matching: record.matching });
  const slots = result.branches.flatMap(branch => branch.items.map((marker, itemIndex) => ({ branch, marker, itemIndex })));
  const single = slots.length === 1;
  const failures = [];
  const completedMutations = [];
  let singleValue;

  // Continue-and-collect: every aligned item is invoked in branch/item order.
  // A failed item is recorded in `failures` and its result slot, and iteration
  // continues — later items are still attempted and earlier writes are not
  // rolled back. No collection-wide atomicity is claimed.
  for (const slot of slots) {
    const invocation = invocations[slot.marker];
    const branchPath = [...slot.branch.path];
    const itemIndex = invocation.location.index ?? slot.itemIndex;
    try {
      const value = await invoke(invocation.inputs, { branchPath, itemIndex, single });
      slot.branch.items[slot.itemIndex] = value;
      singleValue = value;
      const entityRef = mutationEntityRef(invocation.inputs.entity, value, record.entityType);
      completedMutations.push({
        operation: record.kind,
        branchPath,
        itemIndex,
        ...(entityRef ? { entityRef } : {})
      });
    } catch (error) {
      const entityRef = mutationEntityRef(invocation.inputs.entity, null, record.entityType);
      const failure = {
        operation: record.kind,
        branchPath,
        itemIndex,
        ...(entityRef ? { entityRef } : {}),
        error: serializeMutationError(error)
      };
      slot.branch.items[slot.itemIndex] = failure;
      failures.push(failure);
    }
  }
  const tree = { branches: result.branches };
  if (!failures.length) {
    // Zero-failure runs keep the historical output contract: a single
    // invocation returns the bare effect result, exactly as before.
    return single ? singleValue : tree;
  }
  return { result: tree, failures, completedMutations };
}

function assertMutationInputsAlign(operation, trees) {
  if (trees.length < 2) return;
  const branchCount = Math.max(...trees.map(tree => tree.branches.length));
  for (const tree of trees) {
    if (![1, branchCount].includes(tree.branches.length)) {
      throw new Error(`${operation} mutation input branches must be scalar or aligned`);
    }
    if (tree.branches.length === 1 && branchCount > 1 && tree.branches[0].items.length > 1) {
      throw new Error(`${operation} cannot broadcast a list across tree branches`);
    }
  }
  const alignedTrees = trees.filter(tree => tree.branches.length === branchCount);
  for (let branchIndex = 0; branchIndex < branchCount; branchIndex += 1) {
    const paths = alignedTrees.map(tree => pathKey(tree.branches[branchIndex].path));
    if (new Set(paths).size > 1) throw new Error(`${operation} mutation input branch paths must align`);
    const lengths = trees.map(tree => tree.branches[Math.min(branchIndex, tree.branches.length - 1)]?.items.length || 0);
    const itemCount = Math.max(...lengths);
    if (lengths.some(length => length !== 1 && length !== itemCount)) {
      throw new Error(`${operation} mutation input items must be scalar or aligned`);
    }
  }
}

function mutationEntityRef(input, output, entityType) {
  const value = output?.entity || output || input;
  const id = value?.id || value?._id || value?.identity?.uid;
  const type = value?.type || value?.entityType || entityType;
  return id && type ? { type, id: String(id) } : null;
}

function serializeMutationError(error) {
  return {
    name: error?.name || 'Error',
    message: error?.message || String(error),
    ...(error?.code ? { code: error.code } : {}),
    ...(error?.statusCode ? { statusCode: error.statusCode } : {})
  };
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
  if (mode === 'relations') {
    writePath(block, key, structuredClone(value));
    return;
  }
  writePath(block, key, structuredClone(value));
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
  if (record.kind === 'source.processInput') return createDataPacket(readPath(context.inputs || {}, record.path), record.access || 'item');
  if (record.kind === 'source.triggerPayload') return createDataPacket(readPath(context.trigger || {}, record.path), record.access || 'item');
  if (record.kind === 'source.secretRef') return createDataPacket({ secretRef: record.secretRef });
  const access = record.access || (record.kind === 'source.literalList' ? 'list' : record.kind === 'source.literalTree' ? 'tree' : 'item');
  return createDataPacket(structuredClone(record.value), access);
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
    return combineDataPackets([left, required(packets, 'right', record)], ([a, b]) => compare(record.operation, a, b), { matching: record.matching });
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
  }, { matching: record.matching });
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
    }, { matching: record.matching });
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
  }, { matching: record.matching });
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
    ], ([value, min, max]) => Math.min(Number(max), Math.max(Number(min), Number(value))), { matching: record.matching });
  }
  return combineDataPackets([
    required(packets, 'left', record),
    required(packets, 'right', record)
  ], ([left, right]) => math(record.operation, left, right), { matching: record.matching });
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

function distinctPackets(itemsPacket, keysPacket) {
  if (keysPacket) {
    return {
      branches: alignSelectorPackets(itemsPacket, keysPacket, 'Distinct').map(branch => ({
        path: [...branch.path],
        items: distinctByKey(branch.pairs)
      }))
    };
  }
  return {
    branches: normalizeDataPacket(itemsPacket).branches.map(branch => ({
      path: [...branch.path],
      items: distinctByValue(branch.items)
    }))
  };
}

function distinctByKey(pairs) {
  const seen = new Set();
  const result = [];
  for (const [item, key] of pairs) {
    const serialized = JSON.stringify(key);
    if (seen.has(serialized)) continue;
    seen.add(serialized);
    result.push(item);
  }
  return result;
}

function distinctByValue(values) {
  const seen = [];
  return values.filter(value => {
    if (seen.some(previous => same(previous, value))) return false;
    seen.push(value);
    return true;
  });
}

function shiftValues(values, offset) {
  if (!values.length) return [];
  const normalized = ((Math.trunc(offset) % values.length) + values.length) % values.length;
  return [...values.slice(normalized), ...values.slice(0, normalized)];
}

function partitionValues(values, size) {
  if (!Number.isInteger(size) || size < 1) throw new Error('Partition size must be a positive integer');
  return {
    branches: Array.from({ length: Math.ceil(values.length / size) }, (_, index) => ({
      path: [index], items: structuredClone(values.slice(index * size, (index + 1) * size))
    }))
  };
}

function alignSelectorPackets(itemsPacket, maskPacket, nodeKind) {
  const items = normalizeDataPacket(itemsPacket);
  const mask = normalizeDataPacket(maskPacket);
  if (items.branches.length !== mask.branches.length) {
    throw new Error(`${nodeKind} requires one mask branch per item branch (${items.branches.length} vs ${mask.branches.length})`);
  }
  return items.branches.map((branch, index) => {
    const maskBranch = mask.branches[index];
    if (pathKey(branch.path) !== pathKey(maskBranch.path)) {
      throw new Error(`${nodeKind} requires the mask branches to match the item branch paths`);
    }
    if (branch.items.length !== maskBranch.items.length) {
      throw new Error(`${nodeKind} requires one mask entry per item (branch ${formatPath(branch.path)} has ${branch.items.length} items but the mask has ${maskBranch.items.length})`);
    }
    return {
      path: [...branch.path],
      pairs: branch.items.map((item, itemIndex) => [structuredClone(item), maskBranch.items[itemIndex]])
    };
  });
}

function pathKey(path) { return path.join(';'); }
function formatPath(path) { return `{${path.join(';')}}`; }

function dispatchPackets(itemsPacket, maskPacket, outputId = 'true') {
  const keep = outputId !== 'false';
  return {
    branches: alignSelectorPackets(itemsPacket, maskPacket, 'Dispatch').map(branch => ({
      path: [...branch.path],
      items: branch.pairs.filter(([, include]) => Boolean(include) === keep).map(([item]) => item)
    }))
  };
}

function sortPackets(itemsPacket, keysPacket, direction = 'asc') {
  return {
    branches: alignSelectorPackets(itemsPacket, keysPacket, 'Sort').map(branch => ({
      path: [...branch.path],
      items: sortByKeys(branch.pairs, direction)
    }))
  };
}

function sortByKeys(pairs, direction) {
  const descending = direction === 'desc';
  const entries = pairs.map(([item, key], index) => ({ item, key, index }));
  entries.sort((left, right) => {
    const result = compareKeyValues(left.key, right.key);
    if (result !== 0) return descending ? -result : result;
    return left.index - right.index;
  });
  return entries.map(entry => entry.item);
}

function compareKeyValues(left, right) {
  const leftNull = left == null;
  const rightNull = right == null;
  if (leftNull && rightNull) return 0;
  if (leftNull) return 1;
  if (rightNull) return -1;
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function groupByPackets(itemsPacket, keysPacket) {
  const branches = [];
  for (const branch of alignSelectorPackets(itemsPacket, keysPacket, 'Group By')) {
    const groups = new Map();
    for (const [item, key] of branch.pairs) {
      const serialized = JSON.stringify(key);
      if (!groups.has(serialized)) groups.set(serialized, []);
      groups.get(serialized).push(item);
    }
    [...groups.values()].forEach((items, index) => {
      branches.push({ path: [...branch.path, index], items });
    });
  }
  return { branches };
}

function filterPackets(itemsPacket, maskPacket) {
  return {
    branches: alignSelectorPackets(itemsPacket, maskPacket, 'Filter').map(branch => ({
      path: branch.path,
      items: branch.pairs.filter(([, include]) => include).map(([item]) => item)
    }))
  };
}

function unzipPacket(packet) {
  const values = flattenDataPacket(packet).branches[0].items;
  const width = Math.max(0, ...values.map(value => Array.isArray(value) ? value.length : 0));
  return {
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
