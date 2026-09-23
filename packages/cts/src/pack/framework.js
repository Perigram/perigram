// Framework-owned types (SPEC §4 tenancy): party types are
// framework-only declarations, present in every registry view regardless of
// mounted packs.
export const frameworkTypes = [
  {
    id: 'organization',
    class: 'party',
    scope: 'system',
    version: 1,
    fields: { name: { base: 'string' }, email: { base: 'string', nullable: true } },
    render: {
      groups: [
        { id: 'summary', fields: [
          { path: 'data.type', label: 'organization.type', display: 'text', priority: 10 },
          { path: 'data.email', label: 'profile.email', display: 'email', priority: 20 },
          { path: 'data.phone', label: 'profile.phone', display: 'phone', priority: 30 }
        ] }
      ]
    }
  },
  {
    id: 'user',
    class: 'party',
    scope: 'system',
    version: 1,
    fields: { email: { base: 'string' }, name: { base: 'string', nullable: true } },
    render: {
      groups: [
        { id: 'summary', fields: [
          { path: 'data.email', label: 'profile.email', display: 'email', priority: 10 },
          { path: 'identity.reference', label: 'common.reference', display: 'text', priority: 20 }
        ] }
      ]
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
    payload: { mime: 'application/octet-stream' },
    fields: { filename: { base: 'string' } },
    render: {
      label: 'File',
      icon: 'pi pi-file',
      groups: [
        { id: 'summary', fields: [
          { path: 'data.type', label: 'file.type', display: 'text', priority: 10 },
          { path: 'attachments.primary.name', fallbackPaths: ['data.filename'], label: 'file.name', display: 'text', priority: 20 }
        ] },
        { id: 'relations', fields: [
          { path: 'lineage.nestingRunId', label: 'entities.nestingRun', display: 'entityRef', typeId: 'nestingRun', priority: 40 }
        ] }
      ]
    }
  },
  {
    id: 'entity-revision',
    framework: true,
    class: 'file',
    scope: 'system',
    version: 1,
    fields: { note: { base: 'string', nullable: true } },
    render: {
      label: 'Revision',
      icon: 'pi pi-history',
      groups: [
        { id: 'summary', fields: [
          { path: 'data.scope', label: 'revision.scope', display: 'text', priority: 10 },
          { path: 'data.number', label: 'revision.number', prefix: 'v', display: 'number', priority: 20 },
          { path: 'data.shortHash', label: 'revision.hash', display: 'code', priority: 30 }
        ] },
        { id: 'relations', fields: [
          { path: 'data.source', label: 'revision.source', display: 'entityRef', priority: 40 }
        ] }
      ]
    }
  },
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
