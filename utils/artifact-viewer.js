export function resolveArtifactViewer({ artifact = {}, revision = null, domainUi } = {}) {
  const attachment = revision?.attachments?.primary || artifact.attachments?.primary || null;
  const hasFile = Boolean(attachment?.fileId);
  const mode = domainUi.getAttachmentPreview(artifact.data?.type || '').mode;
  const fileUrl = !hasFile ? '' : revision?._id
    ? `/api/entity-revisions/${encodeURIComponent(revision._id)}/file`
    : domainUi.getDownloadEndpoint('artifact', artifact._id);
  return { attachment, fileUrl, hasFile, mode };
}
