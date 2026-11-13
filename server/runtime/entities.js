// Type-id canonicalization for the runtime. The registry view is the whole
// catalog: org and pack type ids are their own storage ids (SPEC §19), so
// normalization is string canonicalization alone.
export function normalizeTypeId(type) {
  return String(type || '');
}
