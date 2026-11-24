import { resolveCreateDialogInputs } from '#shared/ui-mapping/index.js';

// The launch context's parent binding for an editor-protocol create: the
// create dialog supplies this reference on its hidden lineage row, so the
// same binding must reach a create that opens the editor directly. The
// row contract (accepted parent types) stays with the shared create-dialog
// resolver.
export function scopedLineageData(action = {}, { scopeTypeId = '', scopeId = '', type = null, bundle = null } = {}) {
  const parentTypeId = String(scopeTypeId || '');
  const parentId = String(scopeId || '');
  if (!parentTypeId || !parentId) return {};
  const row = resolveCreateDialogInputs(action, type, bundle)
    .find(candidate => candidate.lineage?.accepts?.includes(parentTypeId));
  return row ? { [row.id]: parentId } : {};
}
