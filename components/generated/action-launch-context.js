import { resolveCreateDialogInputs } from '#shared/ui-mapping/index.js';

// The launch parent binding for a direct editor create: the create
// dialog's lineage row contract supplies the row, and the host submits
// the parent id the dialog would have seeded. A contextless launch binds
// nothing and takes the blank editor.
export function scopedLineagePayload(action = {}, { scopeTypeId = '', scopeId = '', type = null, bundle = null } = {}) {
  const parentTypeId = String(scopeTypeId || '');
  const parentId = String(scopeId || '');
  if (!parentTypeId || !parentId) return {};
  const row = resolveCreateDialogInputs(action, type, bundle)
    .find(candidate => candidate.lineage?.accepts?.includes(parentTypeId));
  return row ? { [row.id]: parentId } : {};
}
