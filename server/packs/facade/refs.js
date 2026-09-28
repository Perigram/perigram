// Ref normalization for the pack's value services: a signature socket of
// base `ref` receives whatever carries instance identity on the wire — a
// typed ref ({ type, id }) from a resolver service, a full DTO from reads
// and construct outputs, or a bare id from authored fallbacks. One shape
// per service parameter, resolved here.
import { normalizeInstanceRef } from '~/packages/core/src/index.js';

export function toInstanceRef(value, acceptedTypes = []) {
  const ref = normalizeInstanceRef(value);
  if (ref) return ref;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const id = value._id ?? value.id ?? value.identity?.uid;
    const type = value.type && typeof value.type === 'string' ? value.type : null;
    if (id != null && (type || acceptedTypes.length === 1)) {
      return { type: type || acceptedTypes[0], id: String(id) };
    }
    return null;
  }
  if (typeof value === 'string' && value && acceptedTypes.length === 1) {
    return { type: acceptedTypes[0], id: value };
  }
  return null;
}

export function toInstanceRefs(value, acceptedTypes = []) {
  return (Array.isArray(value) ? value : [value])
    .map(item => toInstanceRef(item, acceptedTypes))
    .filter(Boolean);
}
