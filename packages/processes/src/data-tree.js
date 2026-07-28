import { PROCESS_DATA_SHAPES } from './types.js';

export function createDataPacket(value, shape = 'item') {
  if (!PROCESS_DATA_SHAPES.includes(shape)) throw new Error(`Unknown data shape ${shape}`);
  if (shape === 'tree') return normalizeTreePacket(value);
  if (shape === 'list') {
    if (!Array.isArray(value)) throw new Error('List data must be an array');
    return { shape, branches: [{ path: [], items: structuredClone(value) }] };
  }
  return { shape, branches: [{ path: [], items: [structuredClone(value)] }] };
}

export function normalizeDataPacket(packet) {
  if (!packet || typeof packet !== 'object' || !PROCESS_DATA_SHAPES.includes(packet.shape)) {
    throw new Error('Data packet requires item, list, or tree shape');
  }
  const branches = normalizeBranches(packet.branches);
  if (packet.shape === 'item' && (branches.length !== 1 || branches[0].items.length !== 1)) {
    throw new Error('Item data must contain exactly one item');
  }
  if (packet.shape === 'list' && branches.length !== 1) {
    throw new Error('List data must contain exactly one branch');
  }
  return { shape: packet.shape, branches };
}

export function packetValue(packet) {
  const normalized = normalizeDataPacket(packet);
  if (normalized.shape === 'item') return structuredClone(normalized.branches[0].items[0]);
  if (normalized.shape === 'list') return structuredClone(normalized.branches[0].items);
  return structuredClone(normalized);
}

export function mapDataPacket(packet, mapper) {
  const normalized = normalizeDataPacket(packet);
  return {
    shape: normalized.shape,
    branches: normalized.branches.map(branch => ({
      path: [...branch.path],
      items: branch.items.map((item, index) => mapper(item, { path: [...branch.path], index }))
    }))
  };
}

export function matchDataPackets(packets = []) {
  if (!packets.length) return { shape: 'item', branches: [] };
  const normalized = packets.map(normalizeDataPacket);
  const shape = resultShape(normalized.map(packet => packet.shape));
  const targetPaths = alignedPaths(normalized);
  return {
    shape,
    branches: targetPaths.map(path => {
      const branches = normalized.map(packet => branchForPath(packet, path, targetPaths));
      const length = alignedLength(branches, path);
      return {
        path,
        rows: Array.from({ length }, (_, index) => branches.map(branch => (
          branch.items.length === 1 ? branch.items[0] : branch.items[index]
        )))
      };
    })
  };
}

export function combineDataPackets(packets, mapper) {
  const matched = matchDataPackets(packets);
  const packet = {
    shape: matched.shape,
    branches: matched.branches.map(branch => ({
      path: [...branch.path],
      items: branch.rows.map((row, index) => mapper(row, { path: [...branch.path], index }))
    }))
  };
  return normalizeDataPacket(packet);
}

export function flattenDataPacket(packet) {
  const normalized = normalizeDataPacket(packet);
  return {
    shape: 'list',
    branches: [{ path: [], items: normalized.branches.flatMap(branch => branch.items) }]
  };
}

export function graftDataPacket(packet) {
  const normalized = normalizeDataPacket(packet);
  const branches = [];
  for (const branch of normalized.branches) {
    branch.items.forEach((item, index) => {
      branches.push({ path: [...branch.path, index], items: [item] });
    });
  }
  return { shape: 'tree', branches };
}

export function simplifyDataPacket(packet) {
  const normalized = normalizeDataPacket(packet);
  if (normalized.shape !== 'tree' || !normalized.branches.length) return normalized;
  let prefixLength = 0;
  const shortest = Math.min(...normalized.branches.map(branch => branch.path.length));
  while (prefixLength < shortest) {
    const value = normalized.branches[0].path[prefixLength];
    if (!normalized.branches.every(branch => branch.path[prefixLength] === value)) break;
    prefixLength += 1;
  }
  return {
    shape: 'tree',
    branches: normalized.branches.map(branch => ({
      path: branch.path.slice(prefixLength),
      items: branch.items
    }))
  };
}

export function selectDataBranch(packet, path = []) {
  const normalized = normalizeDataPacket(packet);
  const key = pathKey(path);
  const branch = normalized.branches.find(item => pathKey(item.path) === key);
  if (!branch) throw new Error(`Data tree has no branch ${formatPath(path)}`);
  return { shape: 'list', branches: [{ path: [], items: structuredClone(branch.items) }] };
}

export function crossDataPackets(left, right, mapper = values => values) {
  const leftItems = flattenDataPacket(left).branches[0].items;
  const rightItems = flattenDataPacket(right).branches[0].items;
  return {
    shape: 'list',
    branches: [{
      path: [],
      items: leftItems.flatMap((leftValue, leftIndex) => rightItems.map((rightValue, rightIndex) => (
        mapper([leftValue, rightValue], { leftIndex, rightIndex })
      )))
    }]
  };
}

export function transposeDataPacket(packet) {
  const normalized = normalizeDataPacket(packet);
  if (normalized.branches.length < 2) return normalized;
  const lengths = new Set(normalized.branches.map(branch => branch.items.length));
  if (lengths.size !== 1) throw new Error('Transpose requires equal branch lengths');
  const length = normalized.branches[0].items.length;
  return {
    shape: 'tree',
    branches: Array.from({ length }, (_, index) => ({
      path: [index],
      items: normalized.branches.map(branch => branch.items[index])
    }))
  };
}

function normalizeTreePacket(value) {
  const source = value?.branches ? value.branches : value;
  return { shape: 'tree', branches: normalizeBranches(source) };
}

function normalizeBranches(branches) {
  if (!Array.isArray(branches)) throw new Error('Data tree branches must be an array');
  const seen = new Set();
  return branches.map(branch => {
    if (!branch || !Array.isArray(branch.path) || !branch.path.every(Number.isInteger)) {
      throw new Error('Data tree branch paths must contain integers');
    }
    if (!Array.isArray(branch.items)) throw new Error(`Data branch ${formatPath(branch.path)} requires an item array`);
    const key = pathKey(branch.path);
    if (seen.has(key)) throw new Error(`Duplicate data branch ${formatPath(branch.path)}`);
    seen.add(key);
    return { path: [...branch.path], items: structuredClone(branch.items) };
  }).sort((left, right) => pathKey(left.path).localeCompare(pathKey(right.path)));
}

function alignedPaths(packets) {
  const multi = packets.filter(packet => packet.branches.length > 1);
  if (!multi.length) {
    const tree = packets.find(packet => packet.shape === 'tree');
    return tree ? tree.branches.map(branch => [...branch.path]) : [[]];
  }
  const expected = multi[0].branches.map(branch => pathKey(branch.path));
  for (const packet of multi.slice(1)) {
    const actual = packet.branches.map(branch => pathKey(branch.path));
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Data tree paths do not align: ${actual.join(', ')} vs ${expected.join(', ')}`);
    }
  }
  return multi[0].branches.map(branch => [...branch.path]);
}

function branchForPath(packet, path, targetPaths) {
  if (packet.branches.length === 1 && targetPaths.length > 1) return packet.branches[0];
  const key = pathKey(path);
  const branch = packet.branches.find(item => pathKey(item.path) === key);
  if (!branch) throw new Error(`Data tree has no matching branch ${formatPath(path)}`);
  return branch;
}

function alignedLength(branches, path) {
  const lengths = branches.map(branch => branch.items.length);
  const nonBroadcast = [...new Set(lengths.filter(length => length !== 1))];
  if (nonBroadcast.length > 1) {
    throw new Error(`Data branch ${formatPath(path)} lengths do not align: ${lengths.join(', ')}`);
  }
  return nonBroadcast[0] || 1;
}

function resultShape(shapes) {
  if (shapes.includes('tree')) return 'tree';
  if (shapes.includes('list')) return 'list';
  return 'item';
}

function pathKey(path) {
  return path.join(';');
}

function formatPath(path) {
  return `{${path.join(';')}}`;
}
