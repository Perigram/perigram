// Row ⇄ field-schema translation; synthesis mints flat `fields.*` paths
// (SPEC §13; contract: README Modules entry). Leaf type translation lives
// in the process adapter (`process-grammar.js`).
import { ctsFieldToLegacyType } from './process-grammar.js';

// Synthesis: normalized row fields -> field-schema entries on the flat
// `fields` home. Nested record fields flatten to dotted paths.
export function rowToFieldSchemas(row = {}) {
  const entries = [];
  for (const [name, descriptor] of Object.entries(row || {})) {
    if (descriptor.base === 'record') {
      for (const entry of rowToFieldSchemas(descriptor.fields || {})) {
        const suffix = entry.path.slice('fields.'.length);
        entries.push({
          ...entry,
          path: `fields.${name}.${suffix}`,
          // path-derived labels follow the path; explicit labels stay
          ...(entry.label === entry.path ? { label: `fields.${name}.${suffix}` } : {})
        });
      }
      if (descriptor.legacyJson) {
        const displaced = descriptor.legacyJson === true ? {} : descriptor.legacyJson;
        entries.push({
          path: `fields.${name}`,
          block: 'fields',
          label: displaced.label || descriptor.label || `fields.${name}`,
          type: ctsFieldToLegacyType(displaced.base ? displaced : { base: 'json', nullable: true }),
          writable: displaced.writable !== false && descriptor.writable !== false,
          constructible: displaced.constructible !== false && descriptor.constructible !== false
        });
      }
      continue;
    }
    entries.push({
      path: `fields.${name}`,
      block: 'fields',
      label: descriptor.label || `fields.${name}`,
      type: ctsFieldToLegacyType(descriptor),
      writable: descriptor.writable !== false,
      constructible: descriptor.constructible !== false,
      ...(descriptor.i18n ? { i18n: descriptor.i18n } : {}),
      ...(descriptor.display ? { display: descriptor.display } : {}),
      ...(descriptor.role ? { role: descriptor.role } : {})
    });
  }
  return entries;
}
