// Payload-trait acceptance (SPEC §4): the one home for "does this type's
// declared payload take this file". `payloadAccepts` is the strict form —
// the file's mime must be present and explicitly accepted — which the chat
// materialization seam relies on; the generic construct boundary keeps its
// own permissive missing-mime behavior beside it.

export function mimeMatches(actual = '', accepted = '') {
  if (accepted === '*/*' || accepted === actual) return true;
  if (accepted.endsWith('/*')) return actual.split('/')[0] === accepted.slice(0, -2) && actual.includes('/');
  return false;
}

export function payloadAccepts(payload = null, { mime = null, size = null } = {}) {
  if (!payload) return false;
  const acceptedMime = typeof payload.mime === 'string' ? [payload.mime] : [...(payload.mime || [])];
  if (!mime || !acceptedMime.some(accepted => mimeMatches(mime, accepted))) return false;
  const byteLimit = Number(payload.maxSize);
  if (Number.isFinite(size) && Number.isFinite(byteLimit) && size > byteLimit) return false;
  return true;
}
