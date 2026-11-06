import { definitionDeclaresType } from '~/utils/processDesignerDeclarationEditor.js';

// The declaration-station seam (SPEC §1, owner direction 2026-11-06):
// resolves the active definition whose draft declares a stationed type —
// the document the in-place declaration editor targets. Activation is
// additive (process-definitions README), so the most recently activated
// definition is checked first (`/active`), then the rest of the active
// set; drafts and archived definitions station nothing. In-flight
// requests dedupe per type, so affordances mounting together resolve one
// answer.
const inflight = new Map();

export function useDeclarationStation() {
  async function declaringDefinitionFor(typeId = '') {
    const key = String(typeId || '');
    if (!key) return null;
    if (inflight.has(key)) return inflight.get(key);
    const request = resolveStation(key).finally(() => inflight.delete(key));
    inflight.set(key, request);
    return request;
  }

  return { declaringDefinitionFor };
}

async function resolveStation(typeId) {
  const active = await $fetch('/api/process-definitions/active').catch(() => null);
  if (active && definitionDeclaresType(active.data, typeId)) return String(active._id);
  const list = await $fetch('/api/process-definitions').catch(() => []);
  const actives = (Array.isArray(list) ? list : [])
    .filter(definition => definition?.states?.main === 'ACTIVE'
      && String(definition._id) !== String(active?._id || ''));
  for (const definition of actives) {
    const full = definition.data
      ? definition
      : await $fetch(`/api/process-definitions/${definition._id}`).catch(() => null);
    if (full && definitionDeclaresType(full.data, typeId)) return String(full._id);
  }
  return null;
}
