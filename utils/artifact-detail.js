import { attachmentCreation, attachmentEditor } from './artifact-ui.js';

export function resolveArtifactEditingContract({ artifact = {}, canEdit = false } = {}) {
  const kind = artifact.data?.type || '';
  const creation = attachmentCreation(kind);
  const editor = attachmentEditor(kind);
  return {
    creation,
    editor,
    canReplaceFile: Boolean(canEdit && ['upload', 'capture', 'editor'].includes(creation.mode))
  };
}

export function artifactRevisionOptions(revisions = []) {
  return revisions.map(item => ({ label: `v${item.data?.number || 0}`, value: item._id }));
}
