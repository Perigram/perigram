import { parseProcessSocketHandleId } from './ports.js';

// The handle prefix table lives in ports.js alone (the ports contract).
export function normalizeHandle(handle = '') {
  return parseProcessSocketHandleId(handle);
}

export function lineageKeyForTypeId(typeId = '') {
  const camel = String(typeId).replace(/_([a-z0-9])/g, (_, character) => character.toUpperCase());
  return camel ? `${camel}Id` : '';
}

export function lineageRelationsForParent(parentTypeId = '', lineageBindings = []) {
  const relations = (lineageBindings || [])
    .filter(binding => binding.parentTypeId === parentTypeId && binding.childTypeId && binding.lineageKey)
    .map(binding => ({ childType: binding.childTypeId, lineageKey: binding.lineageKey }));
  return relations.length ? relations : null;
}

// The merged hierarchy view UI placement consumes: compiled lineage
// bindings (graph-authored composition) are authoritative per child/parent
// pair; org-authored children edges (containment triples marked
// declared:'org' by the projection) fill every pair the graph never
// composed. System pack containment never participates. Access scoping and
// grant windows keep reading the raw bindings alone; only presentation
// placement (home suppression, detail child regions, contextual actions)
// consumes the merged view.
export function mergedHierarchyBindings(lineageBindings = [], domain = {}) {
  const byPair = new Map();
  for (const triple of domain.containment || []) {
    if (triple.declared !== 'org') continue;
    if (!triple.childType || !triple.parentType || !triple.lineageKey) continue;
    byPair.set(`${triple.childType}:${triple.parentType}`, {
      childTypeId: triple.childType,
      parentTypeId: triple.parentType,
      lineageKey: triple.lineageKey
    });
  }
  for (const binding of lineageBindings || []) {
    if (!binding.childTypeId || !binding.parentTypeId || !binding.lineageKey) continue;
    byPair.set(`${binding.childTypeId}:${binding.parentTypeId}`, binding);
  }
  return [...byPair.values()];
}
