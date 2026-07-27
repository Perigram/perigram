export function createWorkspaceLeaf(id, selectionKey = '') {
  return { kind: 'leaf', id, selectionKey };
}

export function splitWorkspaceLeaf(root, targetId, orientation, nextLeaf) {
  if (!root || !nextLeaf || !['horizontal', 'vertical'].includes(orientation)) return root;
  if (root.kind === 'leaf') {
    if (root.id !== targetId) return root;
    return {
      kind: 'split',
      id: `split:${root.id}:${nextLeaf.id}`,
      orientation,
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
