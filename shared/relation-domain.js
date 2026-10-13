// The declared relation target domain (CTS SPEC §6): one evaluator shared
// by the write boundary (R2), the compiled Link option routes, and every
// client picker — the same expression filters what pickers offer and what
// writes accept. Row convention matches transition guards: `{ value }` is
// the target instance's stored row.
import { evaluate } from '#packages/cts/src/index.js';

export function relationDomainRow(entity = {}) {
  if (entity?.fields && typeof entity.fields === 'object') return entity.fields;
  return { ...(entity?.data || {}), ...(entity?.specs || {}) };
}

export function withinRelationDomain(entity = {}, where = null) {
  if (!where) return true;
  try {
    return Boolean(evaluate(where, { value: relationDomainRow(entity) }));
  } catch {
    return false;
  }
}

export function filterByRelationDomain(candidates = [], where = null) {
  if (!where) return candidates;
  return candidates.filter(candidate => withinRelationDomain(
    candidate?.toJSON ? candidate.toJSON() : candidate,
    where
  ));
}
