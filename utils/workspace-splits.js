export function createWorkspaceLeaf(id, selectionKey = '') {
  return { kind: 'leaf', id, selectionKey, tabKeys: selectionKey ? [selectionKey] : [] };
}

export function splitWorkspaceLeaf(root, targetId, orientation, nextLeaf) {
  if (!root || !nextLeaf || !['horizontal', 'vertical'].includes(orientation)) return root;
  if (root.kind === 'leaf') {
    if (root.id !== targetId) return root;
    return {
      kind: 'split',
      id: `split:${root.id}:${nextLeaf.id}`,
      orientation,
      sizes: [50, 50],
      children: [root, nextLeaf]
    };
  }
  return {
    ...root,
    children: root.children.map(child => splitWorkspaceLeaf(child, targetId, orientation, nextLeaf))
  };
}

export function updateWorkspaceLeaf(root, targetId, patch = {}) {
  if (!root) return root;
  if (root.kind === 'leaf') return root.id === targetId ? { ...root, ...patch } : root;
  return {
    ...root,
    children: root.children.map(child => updateWorkspaceLeaf(child, targetId, patch))
  };
}

export function updateWorkspaceSplit(root, targetId, sizes) {
  if (!root || !Array.isArray(sizes) || sizes.length !== 2) return root;
  if (root.kind === 'leaf') return root;
  if (root.id === targetId) return { ...root, sizes: normalizeSplitSizes(sizes) };
  return {
    ...root,
    children: root.children.map(child => updateWorkspaceSplit(child, targetId, sizes))
  };
}

export function closeWorkspaceLeaf(root, targetId) {
  if (!root || root.kind === 'leaf') return root;
  const remaining = root.children.filter(child => !(child.kind === 'leaf' && child.id === targetId));
  if (remaining.length === 1) return remaining[0];
  if (remaining.length !== root.children.length) return { ...root, children: remaining };

  const children = root.children.map(child => closeWorkspaceLeaf(child, targetId));
  return children.length === 1 ? children[0] : { ...root, children };
}

export function workspaceLeaves(root) {
  if (!root) return [];
  if (root.kind === 'leaf') return [root];
  return root.children.flatMap(workspaceLeaves);
}

function normalizeSplitSizes(sizes) {
  const normalized = sizes.map(size => Number(size));
  if (normalized.some(size => !Number.isFinite(size) || size <= 0)) return [50, 50];
  const total = normalized[0] + normalized[1];
  return normalized.map(size => (size / total) * 100);
}
