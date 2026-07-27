export function normalizeProcessDisplayName(value) {
  return String(value || '')
    .replace(/(?:\s+draft)+$/i, '')
    .trim();
}
