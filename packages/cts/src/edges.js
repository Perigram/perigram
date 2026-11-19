// Edges (SPEC §6): exactly three kinds — children (lineage), relations,
// provenance — every declaration carries integrity.
const EDGE_KINDS = Object.freeze(['children', 'relations', 'provenance']);
export const ON_REMOVE = Object.freeze(['restrict', 'cascade', 'detach']);
export const UNLINK_POLICIES = Object.freeze(['detach', 'delete']);

// The single lineage-key derivation: the storage key a parent's children
// declaration names on the child (`lineage.<lineageKey>`). Authored value
// wins; the fallback is the camel-cased declaring type id plus `Id`
// (`t-3ccnopv0ti` -> `t3ccnopv0tiId`). The domain projection, derived
// indexes, and the UI generator consume the declared key — never the
// children entry's map key.
export function lineageKeyForParent(typeId = '') {
  const camel = String(typeId).replace(/-([a-z0-9])/g, (_, character) => character.toUpperCase());
  return camel ? `${camel}Id` : '';
}

export function normalizeEdges(edges = {}, declaringTypeId = '') {
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
      if (kind === 'relations') {
        const cardinality = declaration.cardinality ?? 'many';
        if (!['one', 'many'].includes(cardinality)) {
          throw new Error(`edge relations.${key}: cardinality must be one or many`);
        }
        normalizedEntry.cardinality = cardinality;
      }
      if (kind === 'relations' && declaration.unlink != null && !UNLINK_POLICIES.includes(declaration.unlink)) {
        throw new Error(`edge relations.${key}: unlink must be one of ${UNLINK_POLICIES.join(' | ')}`);
      }
      if (kind === 'children') {
        const authored = String(declaration.lineageKey || '').trim();
        normalizedEntry.lineageKey = authored || lineageKeyForParent(declaringTypeId);
      }
      if (kind === 'relations' && declaration.where) {
        // The target domain (SPEC §6): a boolean expression over the
        // TARGET instance — checked against every declared target's row at
        // compile, enforced at every ref write, projected to pickers.
        normalizedEntry.where = declaration.where;
      }
      entries[key] = Object.freeze(normalizedEntry);
    }
    normalized[kind] = Object.freeze(entries);
  }
  return Object.freeze(normalized);
}

// Lineage containment is a forest: cycles across distinct types are
// structural corruption. A children entry naming its own declaring type is
// recursion, not a cycle — instance trees stay finite because a parent
// exists before its children (creation binds an existing ancestor), so
// self-edges never enter cycle detection (SPEC §6).
export function checkLineageAcyclic(typeById) {
  const parentsOf = new Map();
  for (const type of typeById.values()) {
    for (const declaration of Object.values(type.edges?.children || {})) {
      for (const childType of declaration.types) {
        if (childType !== type.id) parentsOf.set(childType, type.id);
      }
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
