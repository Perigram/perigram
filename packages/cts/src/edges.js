// Edges (SPEC §6): exactly three kinds — children (lineage), relations,
// provenance — every declaration carries integrity.
export const EDGE_KINDS = Object.freeze(['children', 'relations', 'provenance']);
export const ON_REMOVE = Object.freeze(['restrict', 'cascade', 'detach']);

export function normalizeEdges(edges = {}) {
  const normalized = {};
  for (const kind of EDGE_KINDS) {
    const declarations = edges[kind];
    if (!declarations) continue;
    const entries = {};
    for (const [key, declaration = {}] of Object.entries(declarations)) {
      const normalizedEntry = { ...declaration };
      if (!Array.isArray(declaration.types) || !declaration.types.length) {
        throw new Error(`edge ${kind}.${key} requires a non-empty types list`);
      }
      normalizedEntry.types = Object.freeze([...declaration.types]);
      normalizedEntry.onRemove = declaration.onRemove || 'restrict';
      if (!ON_REMOVE.includes(normalizedEntry.onRemove)) {
        throw new Error(`edge ${kind}.${key}: onRemove must be one of ${ON_REMOVE.join(' | ')}`);
      }
      entries[key] = Object.freeze(normalizedEntry);
    }
    normalized[kind] = Object.freeze(entries);
  }
  return Object.freeze(normalized);
}

// Lineage containment is a forest: cycles are structural corruption.
export function checkLineageAcyclic(typeById) {
  const parentsOf = new Map();
  for (const type of typeById.values()) {
    for (const declaration of Object.values(type.edges?.children || {})) {
      for (const childType of declaration.types) parentsOf.set(childType, type.id);
    }
  }
  const errors = [];
  for (const start of parentsOf.keys()) {
    const seen = new Set([start]);
    let current = start;
    while (parentsOf.has(current)) {
      current = parentsOf.get(current);
      if (seen.has(current)) {
        errors.push(`lineage cycle: ${[...seen].join(' -> ')} -> ${current}`);
        break;
      }
      seen.add(current);
    }
  }
  return errors;
}
