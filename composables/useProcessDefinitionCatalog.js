export function useProcessDefinitionCatalog({ definitionToCanvas }) {
  function normalizeProcessList(active, all = []) {
    const byId = new Map();
    for (const process of [active, ...(Array.isArray(all) ? all : [])].filter(Boolean)) {
      const id = String(process._id);
      const held = byId.get(id);
      if (!held || (!held.data && process.data)) byId.set(id, process);
    }
    return [...byId.values()].sort(compareProcessDefinitions);
  }

  function pickInitialProcess(active, processes = []) {
    if (active && canProjectProcess(active)) return active;
    return processes.find(process => process.states?.main === 'ACTIVE' && canProjectProcess(process))
      || processes.find(process => process.states?.main === 'DRAFT' && canProjectProcess(process))
      || processes.find(canProjectProcess)
      || active
      || processes[0]
      || null;
  }

  function canProjectProcess(process) {
    try {
      definitionToCanvas(process?.data || {});
      return true;
    } catch {
      return false;
    }
  }

  function compareProcessDefinitions(left, right) {
    const stateRank = { ACTIVE: 0, DRAFT: 1, ARCHIVED: 2 };
    const leftRank = stateRank[left?.states?.main] ?? 3;
    const rightRank = stateRank[right?.states?.main] ?? 3;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return new Date(right?.status?.timestamp || 0) - new Date(left?.status?.timestamp || 0);
  }

  return { canProjectProcess, compareProcessDefinitions, normalizeProcessList, pickInitialProcess };
}
