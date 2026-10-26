// The executor file-output contract (SPEC §24); one parser for every
// consumer of an executor-returned file. Grammar home: the plugin-sdk
// README listing contract.
import { createError } from 'h3';

export function executorPayload(serviceRef, raw) {
  if (raw == null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw createError({ statusCode: 502, message: `Service ${serviceRef} returned a malformed payload` });
  }
  const { base64, mime, name } = raw;
  if (typeof base64 !== 'string' || typeof mime !== 'string' || !mime) {
    throw createError({ statusCode: 502, message: `Service ${serviceRef} payload requires base64 and mime` });
  }
  const normalized = base64.replace(/\s+/g, '');
  const buffer = Buffer.from(normalized, 'base64');
  if (!buffer.length || buffer.toString('base64') !== normalized) {
    throw createError({ statusCode: 502, message: `Service ${serviceRef} payload base64 does not decode` });
  }
  return { buffer, mime, name: typeof name === 'string' && name ? name : null };
}
