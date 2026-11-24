import {
  combineDataPackets,
  cleanDataTree,
  createDataPacket,
  crossDataPackets,
  flattenDataPacket,
  graftDataPacket,
  mapDataPacket,
  mapDataPacketAsync,
  normalizeDataPacket,
  normalizeDataTree,
  packetValue,
  selectDataBranch,
  simplifyDataPacket,
  solveDataTrees,
  transformDataTree,
  transposeDataPacket,
  treeStats
} from './data-tree.js';
import { operationKindOf } from '@perigram/cts';
import { MAKE_LIST_INPUTS } from './node-catalog.js';
import { PROCESS_OPERATION_REGISTRY, CONVERT_UNIT_FACTORS, processOperation, runProcessOperation, stableKey } from './operations.js';
import { isMissingField, missingFieldMarker } from './missing-field.js';

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
  if (kind === 'cts.field') {
    const source = required(packets, 'entity', record);
    const path = String(packets.field
      ? packetValue(packets.field)
      : (record.path || ''));
    return mapDataPacket(source, value => {
      const fieldValue = readPath(value, path);
      if (isMissingField(fieldValue)) return missingFieldMarker(path);
      return fieldValue;
    });
  }
  if (kind === 'cts.read') return executeRead(record, packets, context);
  // Structure species (SPEC §20): compose/decompose/join stay species
  // records end to end, but their data semantics are the open-entry block
  // composition, block projection, and same-type concatenation their
  // catalog ports declare — identical to the legacy v4 twins below.
  if (kind === 'cts.compose') return executeCompose(record, packets);
  if (kind === 'cts.decompose') {
    // Per-facet elimination (SPEC §20): each output is one declared facet
    // read off the instance DTO; a facet the value does not carry reads as
    // the missing-field marker, never as an error.
    const facets = (context.fieldSchemas || []).filter(field => field?.path);
    if (context.outputId) {
      const facet = facets.find(field => field.path === context.outputId);
      if (!facet) {
        throw new Error(`Node ${record.id || kind} does not expose facet ${context.outputId}`);
      }
      return mapDataPacket(required(packets, 'entity', record), value => {
        const facetValue = readPath(value, facet.path);
        return isMissingField(facetValue) ? missingFieldMarker(facet.path) : structuredClone(facetValue);
      });
    }
    return mapDataPacket(required(packets, 'entity', record), value => Object.fromEntries(facets.map(facet => {
      const facetValue = readPath(value, facet.path);
      return [facet.path, isMissingField(facetValue) ? missingFieldMarker(facet.path) : structuredClone(facetValue)];
    })));
  }
  if (kind.startsWith('source.')) return executeSource(record, context);
  if (kind === 'value.cast') return mapDataPacket(required(packets, 'value', record), value => cast(value, record.outputType?.base || record.base));
  if (kind === 'value.select') return combineDataPackets(
    [required(packets, 'condition', record), required(packets, 'left', record), required(packets, 'right', record)],
    ([condition, left, right]) => (condition ? left : right)
  );
  if (kind === 'value.recordField') return spreadListValues(mapDataPacket(required(packets, 'value', record), value => {
    const path = String(packets.key ? packetValue(packets.key) : (record.path || ''));
    const fieldValue = readPath(value, path);
    return isMissingField(fieldValue) ? missingFieldMarker(path) : fieldValue;
  }));
  if (kind === 'value.convertUnit') return mapDataPacket(required(packets, 'value', record), value => convertUnit(value, record.fromUnit, record.toUnit, context.units));
  if (kind === 'value.required') return mapDataPacket(required(packets, 'value', record), value => {
    if (isMissingField(value)) throw new Error(`${record.id || kind} requires a value that is missing at ${value.path}`);
    if (value == null) throw new Error(`${record.id || kind} received a null required value`);
    return value;
  });
  if (kind === 'value.coalesce') return combineDataPackets([required(packets, 'value', record), required(packets, 'fallback', record)], ([value, fallback]) => (
    value == null || isMissingField(value) ? fallback : value
  ));
  if (kind === 'value.validate') return mapDataPacket(required(packets, 'value', record), value => validateValue(value, record));
  // Polymorphic operations evaluate through the registry (SPEC §8
  // atomicity law): one home owns sockets and evaluation.
  if (PROCESS_OPERATION_REGISTRY[kind]) return runProcessOperation(record, packets);
  if (kind === 'value.format') {
    // Template mode: the record input's named `{key}` slots substitute per
    // aligned item beside the `{value}` token; a record-only wire still
    // formats (the value side is the empty broadcast).
    const inputs = [packets.value || createDataPacket(''), packets.record].filter(Boolean);
    return combineDataPackets(inputs, ([value, row]) => format(record, value, row));
  }
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
  if (kind === 'collection.groupBy') return groupByPackets(required(packets, 'items', record), required(packets, 'keys', record), context.outputId);
  if (kind === 'collection.filter') return filterPackets(required(packets, 'items', record), required(packets, 'mask', record));
  if (kind === 'collection.join') {
    // The relational brick: two value lists joined by authored key paths
    // (readPath semantics — 'identity.name' walks the record). Left order
    // is preserved. The inner mode (default) fails on an unmatched left
    // key; the left mode keeps it with `right: null`, so callers branch on
    // the absence instead of stopping the run.
    if (!String(record.leftKey || '').trim() || !String(record.rightKey || '').trim()) {
      throw new Error(`${record.id || kind} requires leftKey and rightKey paths`);
    }
    const joinMode = record.joinMode === 'left' ? 'left' : 'inner';
    const listValue = (side, packet) => {
      const branches = normalizeDataTree(packet).branches.length;
      if (branches > 1) throw new Error(`${record.id || kind} ${side} input has ${branches} data branches`);
      return packetValue(packet, 'list');
    };
    const left = listValue('left', required(packets, 'left', record));
    const right = listValue('right', required(packets, 'right', record));
    const rightByKey = new Map();
    for (const item of right) {
      const key = String(readPath(item, record.rightKey) ?? '');
      if (!key) continue;
      if (rightByKey.has(key)) {
        throw new Error(`${record.id || kind}: right key ${key} matches more than one entry`);
      }
      rightByKey.set(key, item);
    }
    const unmatched = [];
    const pairs = [];
    for (const item of left) {
      const key = String(readPath(item, record.leftKey) ?? '');
      const matched = key ? rightByKey.get(key) : undefined;
      if (matched) pairs.push({ left: item, right: matched });
      else if (joinMode === 'left') pairs.push({ left: item, right: null });
      else unmatched.push(key || '(empty)');
    }
    if (unmatched.length) {
      throw new Error(`${record.id || kind}: unmatched left keys ${unmatched.join(', ')}`);
    }
    return createDataPacket(pairs, 'list');
  }
  if (kind === 'collection.lookup') {
    const keys = packetValue(required(packets, 'keys', record), 'list');
    const items = packetValue(required(packets, 'items', record), 'list');
    const path = String(record.itemsKey || '');
    const byKey = new Map();
    for (const item of items) {
      const value = path ? readPath(item, path) : item;
      if (isMissingField(value) || value == null || value === '') continue;
      const key = stableKey(value);
      if (!byKey.has(key)) byKey.set(key, item);
    }
    const matches = keys.map(key => {
      const value = isMissingField(key) ? null : key;
      const hit = value == null || value === '' ? undefined : byKey.get(stableKey(value));
      return { key: value, found: hit !== undefined, item: hit ?? null };
    });
    return createDataPacket(matches, 'list');
  }
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
  if (kind === 'record.construct') {
    // Compose per aligned tuple (SPEC §18): connected field sources
    // align item-wise — a literal beside a list pairs with every item,
    // lists align index-wise — one record per alignment, list output.
    // Single-item sources compose the single record as before.
    const paths = (record.fields || []).filter(path => packets[path]);
    if (!paths.length) return createDataPacket({});
    return solveDataTrees(paths.map(path => ({ tree: packets[path], access: 'item' })), values => {
      const composed = {};
      for (let index = 0; index < paths.length; index += 1) writePath(composed, paths[index], values[index]);
      return composed;
    }, { matching: record.matching });
  }
  if (kind === 'record.merge') return combineDataPackets(
    [required(packets, 'left', record), required(packets, 'right', record)],
    // Shallow merge, the right side winning; a missing side merges as
    // absent content.
    ([left, right]) => ({
      ...(isMissingField(left) ? {} : left),
      ...(isMissingField(right) ? {} : right)
    })
  );
  if (kind.startsWith('read.')) {
    throw new Error(`Read node ${record.id || kind} uses retired kind ${kind}; loads migrate it to cts.read before execution`);
  }
  throw new Error(`Node ${record.id || kind} is not a data/read operation`);
}

export async function executeProcessEffectNode(record = {}, inputs = {}, invoke, { accessById = new Map() } = {}) {
  if (typeof invoke !== 'function') throw new Error(`Effect executor is required for ${record.kind}`);
  if (record.matching === 'cross') throw new Error(`${record.kind} cannot use Cross matching for mutations`);

  const entries = Object.entries(inputs).map(([id, tree]) => [
    id,
    transformDataTree(normalizeDataPacket(tree), record.inputTransforms?.[id])
  ]);
  assertMutationInputsAlign(record.id || record.kind, entries.map(([, tree]) => tree));

  // A list-valued input (a construction typeList — the parts of one fill)
  // enters each invocation as ONE value: the whole list. Every other
  // input aligns per item — the entity broadcast drives batch mutations.
  const invocations = [];
  const result = solveDataTrees(entries.map(([id, tree]) => ({
    tree,
    access: accessById.get(id) === 'list' ? 'list' : 'item'
  })), (values, location) => {
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
      // A missing value never reaches the handler: an upstream path read
      // matched nothing, and the handler would fail cryptically on the
      // marker. Name the input and the authored path instead.
      for (const [id, value] of Object.entries(invocation.inputs)) {
        if (isMissingField(value)) {
          throw new Error(`${record.id || record.kind} input '${id}' received a missing value (nothing at path '${value.path}')`);
        }
      }
      const value = await invoke(invocation.inputs, { branchPath, itemIndex, single });
      slot.branch.items[slot.itemIndex] = value;
      singleValue = value;
      const entityRef = mutationEntityRef(invocation.inputs.entity, value, record.typeId);
      completedMutations.push({
        operation: record.kind,
        branchPath,
        itemIndex,
        ...(entityRef ? { entityRef } : {})
      });
    } catch (error) {
      const entityRef = mutationEntityRef(invocation.inputs.entity, null, record.typeId);
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

function mutationEntityRef(input, output, typeId) {
  const value = output?.entity || output || input;
  const id = value?.id || value?._id;
  const type = value?.type || value?.typeId || typeId;
  return id && type ? { type, id: String(id) } : null;
}

function serializeMutationError(error) {
  return {
    name: error?.name || 'Error',
    message: error?.message || String(error),
    ...(error?.code ? { code: error.code } : {}),
    ...(error?.statusCode ? { statusCode: error.statusCode } : {}),
    ...(Array.isArray(error?.data?.failures) && error.data.failures.length ? { failures: error.data.failures } : {})
  };
}

// Open-entry block composition shared by the species kind (cts.compose)
// and the legacy v4 compose branch: one block object per aligned tuple of
// connected entries. Without a declared composition the species compose
// has no entry sockets (see nativeStructurePorts) and composes {}.
function executeCompose(record = {}, packets = {}) {
  const mode = record.compositionMode;
  if (!(mode && Array.isArray(record.entries))) return createDataPacket({});
  const entries = record.entries.filter(entry => packets[`entry:${entry.id}`]);
  return combineDataPackets(entries.map(entry => required(packets, `entry:${entry.id}`, record)), values => {
    const block = {};
    entries.forEach((entry, index) => writeOpenBlockEntry(block, mode, entry, values[index]));
    return block;
  });
}

function writeOpenBlockEntry(block, mode, entry, value) {
  // A missing field composes as absent content: the entry is not written.
  if (isMissingField(value)) return;
  if (mode === 'ancestors') {
    const id = value?.id || value?._id;
    if (!entry.key || !entry.typeId || !id) throw new Error(`Lineage entry ${entry.id} requires a key and typed entity reference`);
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



async function executeSource(record, context) {
  if (record.kind === 'source.currentTime') return createDataPacket((context.now || (() => new Date()))().toISOString());
  // Run-context principals: the execution environment resolves the acting
  // user and the active organization through the party read adapters —
  // the graph never sees an author-typed identity.
  if (record.kind === 'source.currentUser') return createDataPacket(await context.currentUser?.());
  if (record.kind === 'source.currentOrganization') return createDataPacket(await context.currentOrganization?.());
  if (record.kind === 'source.processInput') return createDataPacket(readPath(context.inputs || {}, record.path), record.access || 'item');
  if (record.kind === 'source.triggerPayload') return createDataPacket(readPath(context.trigger || {}, record.path), record.access || 'item');
  if (record.kind === 'source.secretRef') return createDataPacket({ secretRef: record.secretRef });
  const access = record.access || (record.kind === 'source.literalList' ? 'list' : record.kind === 'source.literalTree' ? 'tree' : 'item');
  return createDataPacket(structuredClone(record.value), access);
}

// Native species reads only (SPEC §20): the persisted load boundary
// migrates legacy `read.*` records to `cts.read` + select before anything
// executes. A legacy kind reaching here means a caller skipped that
// boundary — fail loudly instead of running a retired vocabulary beside
// the native one.
async function executeRead(record, packets, context) {
  if (record.kind !== 'cts.read') {
    throw new Error(`Read node ${record.id || '(unnamed)'} uses retired kind ${record.kind}; migrate the definition to cts.read`);
  }
  const entityStream = () => packetValue(required(packets, 'entity', record));
  switch (record.select) {
    case 'current':
      return createDataPacket(await context.currentEntity?.(record.typeId));
    case 'parent':
      return createDataPacket(await context.parentEntity?.(entityStream(), record.typeId));
    case 'children':
      return createDataPacket(await context.childEntities?.(entityStream(), record.typeId) || [], 'list');
    case 'related':
      return createDataPacket(await context.relatedEntities?.(entityStream(), record.relationKey || record.relation, record.typeId) || [], 'list');
    case 'all':
      return createDataPacket(await context.queryEntities?.(record.typeId) || [], 'list');
    case 'extract': {
      // The declared projection (SPEC §8 p): the bound type's declaration
      // owns the resolve — the evaluator only routes each instance
      // through the runtime's projection seam. A single broadcast input
      // flattens its list result into the output items (the read yields
      // the projected rows); a list input projects per item, each item
      // the instance's projected value.
      const project = context.projectEntity;
      if (typeof project !== 'function') {
        throw new Error(`Extract read ${record.id || '(unnamed)'} has no projection seam in this environment`);
      }
      if (!record.projection) {
        throw new Error(`Extract read ${record.id || '(unnamed)'} declares no projection`);
      }
      const source = required(packets, 'entity', record);
      const normalizedSource = normalizeDataTree(source);
      const single = normalizedSource.branches.length === 1
        && normalizedSource.branches[0].items.length === 1;
      // A union entity stream (children of a parent with several child
      // types) legally wires into a typed extract; items of other types
      // drop instead of projecting through the wrong declaration.
      const projected = await mapDataPacketAsync(source, async value => {
        if (value && typeof value === 'object' && value.type
          && record.typeId && String(value.type) !== String(record.typeId)) return undefined;
        return project(record.typeId, record.projection, value);
      });
      const filtered = {
        branches: projected.branches
          .map(branch => ({ ...branch, items: branch.items.filter(item => item !== undefined) }))
          .filter(branch => branch.items.length || branch.path.length)
      };
      if (single) {
        const value = packetValue(filtered.length ? filtered : projected);
        return Array.isArray(value) ? createDataPacket(value, 'list') : filtered;
      }
      return filtered;
    }
    default:
      throw new Error(`Read node ${record.id || '(unnamed)'} has no declared select`);
  }
}

function required(inputs, id, record) {
  if (!inputs[id]) throw new Error(`Node ${record.id || record.kind} requires input ${id}`);
  return inputs[id];
}

function validateValue(value, record) {
  if (record.required && (value == null || isMissingField(value))) throw new Error(record.message || 'Value is required');
  if (record.pattern && !new RegExp(record.pattern).test(String(value))) throw new Error(record.message || 'Value does not match');
  if (record.min != null && Number(value) < Number(record.min)) throw new Error(record.message || `Value is below ${record.min}`);
  if (record.max != null && Number(value) > Number(record.max)) throw new Error(record.message || `Value is above ${record.max}`);
  return value;
}

function assertDeclaredBlock(domain, record, block) {
  if (!domain || !record.typeId || !block) return;
  if (!entityBlocks(domain, record.typeId).includes(block)) {
    throw new Error(`Process node ${record.id || record.kind} uses block ${block} outside ${record.typeId}`);
  }
}

function convertUnit(value, from, to, custom = {}) {
  if (!from || !to || from === to) return value;
  const factors = { ...CONVERT_UNIT_FACTORS, ...custom };
  if (!factors[from] || !factors[to]) throw new Error(`Unsupported unit conversion ${from} → ${to}`);
  return Number(value) * factors[from] / factors[to];
}

// `value.cast` re-bases a value whose shape already satisfies the target
// base; pairs beyond the structural re-bases refuse loudly.
function cast(value, base = '') {
  if (base === 'record') {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    throw new Error(`cast to record requires an object (got ${castKind(value)})`);
  }
  if (base === 'list' || base === 'array') {
    if (Array.isArray(value)) return value;
    throw new Error(`cast to ${base} requires an array (got ${castKind(value)})`);
  }
  if (base === 'json') return value;
  if (['string', 'number', 'boolean'].includes(base)) {
    if (typeof value === base) return value;
    throw new Error(`cast to ${base} requires a ${base} (got ${castKind(value)})`);
  }
  throw new Error(`cast does not define → ${base || '(no base)'}`);
}

function castKind(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

// The record-elimination output socket declares List access: a field whose
// value is an array itemizes into one packet item per entry.
function spreadListValues(packet) {
  return {
    branches: packet.branches.map(branch => ({
      path: [...branch.path],
      items: branch.items.flatMap(item => (Array.isArray(item) ? item : [item]))
    }))
  };
}

function format(record, value, row = null) {
  let text = record.template != null ? String(record.template) : '';
  if (record.template && row && typeof row === 'object' && !Array.isArray(row)) {
    for (const [key, cell] of Object.entries(row)) {
      // A missing-field marker leaves its placeholder in place — the
      // gap stays visible in the rendered text instead of stringifying
      // the marker.
      if (isMissingField(cell)) continue;
      text = text.replaceAll(`{${key}}`, String(cell ?? ''));
    }
  }
  if (record.template) return text.replaceAll('{value}', String(value ?? ''));
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
    const serialized = stableKey(key);
    if (seen.has(serialized)) continue;
    seen.add(serialized);
    result.push(item);
  }
  return result;
}

function distinctByValue(values) {
  const seen = new Set();
  return values.filter(value => {
    const serialized = stableKey(value);
    if (seen.has(serialized)) return false;
    seen.add(serialized);
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

function groupByPackets(itemsPacket, keysPacket, outputId = 'groups') {
  const groups = [];
  const groupKeys = [];
  for (const branch of alignSelectorPackets(itemsPacket, keysPacket, 'Group By')) {
    const byKey = new Map();
    for (const [item, key] of branch.pairs) {
      const serialized = stableKey(key);
      if (!byKey.has(serialized)) byKey.set(serialized, []);
      byKey.get(serialized).push(item);
    }
    [...byKey.entries()].forEach(([serialized, items], index) => {
      groups.push({ path: [...branch.path, index], items });
      groupKeys.push({ path: [...branch.path, index], items: [branch.pairs.find(([, key]) => stableKey(key) === serialized)[1]] });
    });
  }
  return outputId === 'keys' ? { branches: groupKeys } : { branches: groups };
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


function readPath(value, path = '') {
  const parts = String(path).split('.').filter(Boolean);
  let current = value;
  for (const key of parts) {
    if (current === null || current === undefined || typeof current !== 'object' || !Object.hasOwn(current, key)) {
      return missingFieldMarker(path);
    }
    current = current[key];
  }
  return current;
}

// Patch application treats a missing path as absent content, not as a
// marker value: append/remove start from an empty list, exactly as they did
// when absent paths collapsed to undefined.

function writePath(target, path, value) {
  const parts = String(path).split('.').filter(Boolean);
  let current = target;
  parts.slice(0, -1).forEach(part => {
    current[part] = current[part] && typeof current[part] === 'object' ? current[part] : {};
    current = current[part];
  });
  if (parts.length) current[parts.at(-1)] = value;
}


