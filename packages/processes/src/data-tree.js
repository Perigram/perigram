export const PROCESS_DATA_ACCESS = Object.freeze(['item', 'list', 'tree']);
export const PROCESS_MATCHING_MODES = Object.freeze(['longest', 'shortest', 'cross']);

export function createDataTree(value, access = 'item') {
  if (isDataTree(value)) return normalizeDataTree(value);
  if (access === 'tree') return normalizeDataTree(value);
  if (access === 'list') {
    if (!Array.isArray(value)) throw new Error('List data must be an array');
    return { branches: [{ path: [], items: structuredClone(value) }] };
  }
  return { branches: [{ path: [], items: [structuredClone(value)] }] };
}

// Kept as the public constructor name used by orchestration. The second
// argument is access, never a persisted/static packet shape.
export const createDataPacket = createDataTree;

export function normalizeDataTree(tree) {
  if (!tree || typeof tree !== 'object' || !Array.isArray(tree.branches)) {
    throw new Error('Data tree requires branches');
  }
  return { branches: normalizeBranches(tree.branches) };
}

export const normalizeDataPacket = normalizeDataTree;

export function isDataTree(value) {
  return Boolean(value && typeof value === 'object' && Array.isArray(value.branches));
}

// The single unwrap home for authored socket defaults (SPEC §20): a draft
// carries the plain value; a normalized definition wraps it in a data
// tree. Both are the same fact — every reader goes through here.
export function authoredSocketDefault(value) {
  if (value == null) return '';
  if (isDataTree(value)) {
    const items = value.branches.flatMap(branch => branch.items || []);
    return items.length ? items[0] : '';
  }
  return value;
}

export function packetValue(tree, access = 'item') {
  const normalized = normalizeDataTree(tree);
  if (access === 'tree') return structuredClone(normalized);
  if (access === 'list') {
    if (!normalized.branches.length) return [];
    if (normalized.branches.length !== 1) throw new Error('Expected one data branch');
    return structuredClone(normalized.branches[0].items);
  }
  const items = normalized.branches.flatMap(branch => branch.items);
  if (items.length !== 1) throw new Error(`Expected one data item, received ${items.length}`);
  return structuredClone(items[0]);
}

export function mapDataPacket(tree, mapper) {
  const normalized = normalizeDataTree(tree);
  return {
    branches: normalized.branches.map(branch => ({
      path: [...branch.path],
      items: branch.items.map((item, index) => mapper(item, { path: [...branch.path], index }))
    }))
  };
}

// Async per-item map over a packet (the extract read's projection seam is
// async); branch/item topology preserved exactly like mapDataPacket.
export async function mapDataPacketAsync(tree, mapper) {
  const normalized = normalizeDataTree(tree);
  const branches = [];
  for (const branch of normalized.branches) {
    const items = [];
    for (let index = 0; index < branch.items.length; index += 1) {
      items.push(await mapper(branch.items[index], { path: [...branch.path], index }));
    }
    branches.push({ path: [...branch.path], items });
  }
  return { branches };
}

export function solveDataTrees(inputs = [], solve, options = {}) {
  const access = inputs.map(input => input.access || 'item');
  const trees = inputs.map(input => applyInputTransforms(normalizeDataTree(input.tree), input.transforms));
  const drivers = trees.map((tree, index) => ({ tree, access: access[index], index }))
    .filter(input => input.access !== 'tree');
  if (!drivers.length) {
    return collectSolves([{ path: [], itemIndex: null, values: trees.map(tree => structuredClone(tree)) }], solve, options.outputAccess);
  }
  const matching = PROCESS_MATCHING_MODES.includes(options.matching) ? options.matching : 'longest';
  const branchLengths = drivers.map(input => input.tree.branches.length);
  const branchSelections = matching === 'cross'
    ? cartesianIndices(branchLengths)
    : Array.from({ length: matchedCount(branchLengths, matching) }, (_, index) => drivers.map(() => index));
  if (!branchSelections.length) return { branches: [] };
  const master = [...drivers].sort((left, right) => right.tree.branches.length - left.tree.branches.length || left.index - right.index)[0];
  const invocations = [];
  for (const branchSelection of branchSelections) {
    let driverCursor = 0;
    const branches = trees.map((tree, index) => access[index] === 'tree'
      ? null
      : branchAt(tree, branchSelection[driverCursor++], matching));
    if (branches.some((branch, index) => access[index] !== 'tree' && !branch)) continue;
    const itemInputs = branches.flatMap((branch, index) => access[index] === 'item' ? [branch.items.length] : []);
    const itemCount = matching === 'cross' ? 1 : (itemInputs.length ? matchedCount(itemInputs, matching) : 1);
    const masterDriverIndex = drivers.findIndex(driver => driver.index === master.index);
    const masterBranch = branchAt(master.tree, branchSelection[masterDriverIndex], matching);
    for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
      if (matching === 'cross' && itemInputs.length > 1) {
        for (const indices of cartesianIndices(itemInputs)) {
          let itemCursor = 0;
          invocations.push({
            path: [...masterBranch.path],
            itemIndex,
            values: trees.map((tree, index) => valueForAccess(tree, branches[index], access[index], indices, () => itemCursor++))
          });
        }
      } else {
        invocations.push({
          path: [...masterBranch.path],
          itemIndex,
          values: trees.map((tree, index) => valueForAccess(tree, branches[index], access[index], [itemIndex], () => 0, matching))
        });
      }
    }
  }
  return collectSolves(invocations, solve, options.outputAccess || 'item');
}

export function combineDataPackets(packets, mapper, options = {}) {
  return solveDataTrees(packets.map(tree => ({ tree, access: 'item' })), mapper, options);
}

export function crossDataPackets(left, right, mapper = values => values) {
  return solveDataTrees([{ tree: left, access: 'item' }, { tree: right, access: 'item' }], mapper, { matching: 'cross' });
}

export function flattenDataPacket(tree) {
  const normalized = normalizeDataTree(tree);
  return { branches: [{ path: [], items: normalized.branches.flatMap(branch => branch.items) }] };
}

export function graftDataPacket(tree) {
  const normalized = normalizeDataTree(tree);
  return {
    branches: normalized.branches.flatMap(branch => branch.items.map((item, index) => ({
      path: [...branch.path, index], items: [structuredClone(item)]
    })))
  };
}

export function simplifyDataPacket(tree) {
  const normalized = normalizeDataTree(tree);
  if (!normalized.branches.length) return normalized;
  let prefixLength = 0;
  const shortest = Math.min(...normalized.branches.map(branch => branch.path.length));
  while (prefixLength < shortest) {
    const value = normalized.branches[0].path[prefixLength];
    if (!normalized.branches.every(branch => branch.path[prefixLength] === value)) break;
    prefixLength += 1;
  }
  return { branches: normalized.branches.map(branch => ({ path: branch.path.slice(prefixLength), items: branch.items })) };
}

export function selectDataBranch(tree, path = []) {
  const branch = normalizeDataTree(tree).branches.find(item => pathKey(item.path) === pathKey(path));
  if (!branch) throw new Error(`Data tree has no branch ${formatPath(path)}`);
  return { branches: [{ path: [...branch.path], items: structuredClone(branch.items) }] };
}

export function transposeDataPacket(tree) {
  const normalized = normalizeDataTree(tree);
  if (normalized.branches.length < 2) return normalized;
  const length = Math.max(...normalized.branches.map(branch => branch.items.length));
  return {
    branches: Array.from({ length }, (_, index) => ({
      path: [index],
      items: normalized.branches.map(branch => structuredClone(branch.items[index] ?? null))
    }))
  };
}

export function treeStats(tree) {
  const normalized = normalizeDataTree(tree);
  return {
    branchCount: normalized.branches.length,
    itemCount: normalized.branches.reduce((total, branch) => total + branch.items.length, 0),
    branches: normalized.branches.map(branch => ({ path: [...branch.path], itemCount: branch.items.length }))
  };
}

export function cleanDataTree(tree) {
  return {
    branches: normalizeDataTree(tree).branches
      .map(branch => ({ path: [...branch.path], items: branch.items.filter(item => item != null) }))
      .filter(branch => branch.items.length)
  };
}

export function transformDataTree(tree, transforms = {}) {
  return applyInputTransforms(normalizeDataTree(tree), transforms);
}

function applyInputTransforms(tree, transforms = {}) {
  let result = tree;
  if (transforms?.simplify) result = simplifyDataPacket(result);
  if (transforms?.flatten) result = flattenDataPacket(result);
  if (transforms?.graft) result = graftDataPacket(result);
  return result;
}

function collectSolves(invocations, solve, outputAccess = 'item') {
  const branches = new Map();
  for (const invocation of invocations) {
    const result = solve(invocation.values, { path: [...invocation.path], index: invocation.itemIndex });
    if (result === undefined) continue;
    const values = outputAccess === 'tree' ? normalizeDataTree(result).branches : null;
    if (values) {
      for (const branch of values) appendBranch(branches, [...invocation.path, ...branch.path], branch.items);
      continue;
    }
    const items = outputAccess === 'list' ? result : [result];
    if (!Array.isArray(items)) throw new Error(`${outputAccess} output must be an array`);
    const path = outputAccess === 'list' && invocation.itemIndex != null
      ? [...invocation.path, invocation.itemIndex]
      : invocation.path;
    appendBranch(branches, path, items);
  }
  return { branches: [...branches.values()].sort(compareBranches) };
}

function appendBranch(branches, path, items) {
  const key = pathKey(path);
  const current = branches.get(key) || { path: [...path], items: [] };
  current.items.push(...structuredClone(items));
  branches.set(key, current);
}

function valueForAccess(tree, branch, access, indices, nextIndex, matching = 'longest') {
  if (access === 'tree') return structuredClone(tree);
  if (access === 'list') return structuredClone(branch.items);
  const index = indices[nextIndex()] ?? indices[0] ?? 0;
  if (!branch.items.length) return undefined;
  if (matching === 'shortest') return structuredClone(branch.items[index]);
  return structuredClone(branch.items[Math.min(index, branch.items.length - 1)]);
}

function branchAt(tree, index, matching) {
  if (!tree.branches.length) return null;
  if (matching === 'shortest') return tree.branches[index] || null;
  return tree.branches[Math.min(index, tree.branches.length - 1)];
}

function matchedCount(lengths, matching) {
  if (!lengths.length || lengths.some(length => length === 0)) return 0;
  if (matching === 'shortest') return Math.min(...lengths);
  return Math.max(...lengths);
}

function cartesianIndices(lengths) {
  return lengths.reduce((rows, length) => rows.flatMap(row => Array.from({ length }, (_, index) => [...row, index])), [[]]);
}

function normalizeBranches(branches) {
  const seen = new Set();
  return branches.map(branch => {
    if (!branch || !Array.isArray(branch.path) || !branch.path.every(Number.isInteger)) {
      throw new Error('Data tree branch paths must contain integers');
    }
    if (!Array.isArray(branch.items)) throw new Error(`Data branch ${formatPath(branch.path)} requires items`);
    const key = pathKey(branch.path);
    if (seen.has(key)) throw new Error(`Duplicate data branch ${formatPath(branch.path)}`);
    seen.add(key);
    return { path: [...branch.path], items: structuredClone(branch.items) };
  }).sort(compareBranches);
}

function compareBranches(left, right) {
  const length = Math.max(left.path.length, right.path.length);
  for (let index = 0; index < length; index += 1) {
    if (left.path[index] == null) return -1;
    if (right.path[index] == null) return 1;
    if (left.path[index] !== right.path[index]) return left.path[index] - right.path[index];
  }
  return 0;
}

function pathKey(path) { return path.join(';'); }
function formatPath(path) { return `{${path.join(';')}}`; }
