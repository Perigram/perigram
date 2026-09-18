// Framework-owned types (SPEC §4 tenancy): party types are
// framework-only declarations, present in every registry view regardless of
// mounted packs.
export const frameworkTypes = [
  { id: 'organization', class: 'party', scope: 'system', version: 1, fields: { name: { base: 'string' }, email: { base: 'string', nullable: true } } },
  { id: 'user', class: 'party', scope: 'system', version: 1, fields: { email: { base: 'string' }, name: { base: 'string', nullable: true } } },
  // Framework machinery types: file storage, revisions, process definitions.
  // They keep explicit feature services; the declarations put them in every
  // registry view (tenancy, ref targets) but they are flagged `framework`
  // and never project as authorable instances — their services own them.
  { id: 'artifact', framework: true, class: 'file', scope: 'system', version: 1, payload: { mime: 'application/octet-stream' }, fields: { filename: { base: 'string' } }, render: { label: 'File', icon: 'pi pi-file' } },
  { id: 'entity-revision', framework: true, class: 'file', scope: 'system', version: 1, fields: { note: { base: 'string', nullable: true } }, render: { label: 'Revision', icon: 'pi pi-history' } },
  {
    id: 'process-definition', framework: true, class: 'process', scope: 'system', version: 1,
    fields: { name: { base: 'string' } },
    states: { main: { initial: 'DRAFT', values: ['DRAFT', 'ACTIVE', 'ARCHIVED'], terminal: ['ARCHIVED'] } },
    transitions: [
      { from: 'DRAFT', to: 'ACTIVE' },
      { from: 'ACTIVE', to: 'ARCHIVED' },
      { from: 'DRAFT', to: 'ARCHIVED' }
    ],
    render: { label: 'Process definition', icon: 'pi pi-sitemap' }
  }
];
