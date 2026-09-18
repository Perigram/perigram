// Framework-owned types (SPEC §4 tenancy): party types are
// framework-only declarations, present in every registry view regardless of
// mounted packs.
export const frameworkTypes = [
  { id: 'organization', class: 'party', scope: 'system', version: 1, fields: { name: { base: 'string' }, email: { base: 'string', nullable: true } } },
  { id: 'user', class: 'party', scope: 'system', version: 1, fields: { email: { base: 'string' }, name: { base: 'string', nullable: true } } }
];
