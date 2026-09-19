import { cncDomain } from '@cutkit/domain-cnc';

// The artifact/editor family's scoped view of the legacy attachment-kind
// and surface tables. The server's artifact/files features still serve
// these contracts (the payload-trait flip is the next wave), so this is the
// one client seam that reads them — the global domain UI adapter is gone,
// and no other client module may consume these tables. The artifact
// download URL is the artifact feature's single endpoint (the raw GET
// streams the file), matching the previous adapter behavior exactly.
const attachmentKinds = cncDomain.attachmentKinds || {};

export const artifactSurfaces = cncDomain.ui?.surfaces || [];

export function attachmentKind(kind = '') {
  return attachmentKinds[kind] || null;
}

export function attachmentPreview(kind = '') {
  return attachmentKinds[kind]?.preview || { mode: 'download' };
}

export function attachmentCreation(kind = '') {
  return attachmentKinds[kind]?.creation || { mode: 'workflow' };
}

export function attachmentEditor(kind = '') {
  return attachmentKinds[kind]?.editor || { mode: 'none' };
}

export function artifactDownloadUrl(id = '') {
  return `/api/artifacts/${id}`;
}
