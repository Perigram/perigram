export function resolveArtifactEditingContract({ artifact = {}, domainUi, canEdit = false } = {}) {
  const kind = artifact.data?.type || '';
  const creation = domainUi.getAttachmentCreation(kind);
  const editor = domainUi.getAttachmentEditor(kind);
  return {
    creation,
    editor,
    canReplaceFile: Boolean(canEdit && ['upload', 'capture', 'editor'].includes(creation.mode))
  };
}

export function artifactRevisionOptions(revisions = []) {
  return revisions.map(item => ({ label: `v${item.data?.number || 0}`, value: item._id }));
}
