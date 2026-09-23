// Framework-owned types (SPEC §4 tenancy): party types are
// framework-only declarations, present in every registry view regardless of
// mounted packs.
export const frameworkTypes = [
  {
    id: 'organization',
    class: 'party',
    scope: 'system',
    version: 1,
    name: 'Organization',
    fields: {
      name: { base: 'string', identifier: true },
      email: { base: 'string', nullable: true, label: 'profile.email', display: 'email' }
    }
  },
  {
    id: 'user',
    class: 'party',
    scope: 'system',
    version: 1,
    name: 'User',
    fields: {
      email: { base: 'string', identifier: true, label: 'profile.email', display: 'email' },
      name: { base: 'string', nullable: true }
    }
  },
  // Framework machinery types: file storage, revisions, process definitions.
  // They keep explicit feature services; the declarations put them in every
  // registry view (tenancy, ref targets) but they are flagged `framework`
  // and never project as authorable instances — their services own them.
  {
    id: 'artifact',
    framework: true,
    class: 'file',
    scope: 'system',
    version: 1,
    name: 'File',
    glyph: 'pi pi-file',
    payload: { mime: 'application/octet-stream' },
    fields: {
      filename: { base: 'string', identifier: true, label: 'file.name', display: 'text' }
    }
  },
  {
    id: 'entity-revision',
    framework: true,
    class: 'file',
    scope: 'system',
    version: 1,
    name: 'Revision',
    glyph: 'pi pi-history',
    fields: { note: { base: 'string', nullable: true, label: 'Note', identifier: true } }
  },
  {
    id: 'process-definition', framework: true, class: 'process', scope: 'system', version: 1,
    name: 'Process definition',
    glyph: 'pi pi-sitemap',
    fields: { name: { base: 'string', identifier: true } },
    states: { main: { initial: 'DRAFT', values: ['DRAFT', 'ACTIVE', 'ARCHIVED'], terminal: ['ARCHIVED'] } },
    transitions: [
      { from: 'DRAFT', to: 'ACTIVE' },
      { from: 'ACTIVE', to: 'ARCHIVED' },
      { from: 'DRAFT', to: 'ARCHIVED' }
    ]
  }
];
