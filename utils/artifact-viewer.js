import { artifactDownloadUrl, attachmentPreview } from './artifact-ui.js';

export function resolveArtifactViewer({ artifact = {}, revision = null } = {}) {
  const attachment = revision?.attachments?.primary || artifact.attachments?.primary || null;
  const hasFile = Boolean(attachment?.fileId);
  const mode = attachmentPreview(artifact.data?.type || '').mode;
  const fileUrl = !hasFile ? '' : revision?._id
    ? `/api/instance-revisions/${encodeURIComponent(revision._id)}/file`
    : artifactDownloadUrl(artifact._id);
  return { attachment, fileUrl, hasFile, mode };
}
