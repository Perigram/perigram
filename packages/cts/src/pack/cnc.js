// CNC starter type pack (SPEC §16): the acceptance fixture. Every family of
// the collapse table (§15) appears: file, item, group, process, edges,
// operators, triggers, payload traits. State vocabularies are process-graph
// authoring (SPEC §7) and never ride pack declarations.

export const cncTypePack = [
  {
    id: 'material',
    class: 'file',
    version: 1,
    name: 'Material',
    glyph: 'pi-box',
    fields: {
      code: { base: 'string', identifier: true },
      thickness: { base: 'quantity', unit: 'mm' }
    }
  },
  {
    id: 'occs',
    name: 'Occs',
    class: 'file',
    version: 1,
    payload: { mime: ['application/perigram+occs'], accept: ['.occs'], maxSize: 5 * 1024 * 1024 },
    fields: {
      title: { base: 'string', identifier: true, label: 'Title', nullable: true },
      parameters: { base: 'list', itemType: { base: 'record', fields: {
        name: { base: 'string' }, value: { base: 'quantity', unit: 'mm' } } } },
      graph: { base: 'json' }
    },
    revisions: 'geometry',
    operators: {
      edit: { id: 'edit', species: 'mutate',
        input: { base: 'ref', accepts: ['occs'] } }
    }
  },
  {
    id: 'cut-plan',
    name: 'Cut Plan',
    class: 'file',
    version: 1,
    fields: {
      title: { base: 'string', identifier: true, label: 'Title', nullable: true },
      geometry: { base: 'list', itemType: { base: 'record', fields: {
        outer: { base: 'list', itemType: { base: 'record', fields: {
          x: { base: 'quantity', unit: 'mm' }, y: { base: 'quantity', unit: 'mm' } } } },
        holes: { base: 'list', itemType: { base: 'list', itemType: { base: 'record', fields: {
          x: { base: 'quantity', unit: 'mm' }, y: { base: 'quantity', unit: 'mm' } } } } } } } },
      source: { base: 'ref', accepts: ['occs'], nullable: true }
    },
    revisions: 'geometry'
  },
  {
    id: 'photo',
    name: 'Photo',
    class: 'file',
    version: 1,
    payload: { mime: ['image/*'], accept: ['image/*'], maxSize: 25 * 1024 * 1024 },
    fields: { title: { base: 'string', identifier: true, label: 'Title', nullable: true } }
  },
  {
    id: 'sheet',
    name: 'Sheet',
    class: 'item',
    version: 1,
    fields: {
      serial: { base: 'string', identifier: true },
      specs: { base: 'record', fields: {
        width: { base: 'quantity', unit: 'mm' },
        length: { base: 'quantity', unit: 'mm' },
        area: { base: 'quantity', unit: 'm2' } } },
      material: { base: 'ref', accepts: ['material'], },
      placed: { base: 'list', itemType: { base: 'ref', accepts: ['part'] } }
    }
  },
  {
    id: 'part',
    name: 'Part',
    class: 'item',
    version: 1,
    fields: {
      serial: { base: 'string', identifier: true },
      // Row-carried refs (the association lives in edges.relations
      // 'placed-on'); stored as data, not relation writes.
      design: { base: 'ref', accepts: ['cut-plan'], },
      placedOn: { base: 'ref', accepts: ['sheet'], nullable: true, }
    },
    edges: { relations: { 'placed-on': { types: ['sheet'], onRemove: 'detach' } } }
  },
  {
    id: 'project',
    name: 'Project',
    class: 'group',
    version: 1,
    fields: { name: { base: 'string', identifier: true } },
    edges: { children: { members: { types: ['queue', 'facade'], onRemove: 'restrict' } } }
  },
  {
    id: 'facade',
    name: 'Facade',
    class: 'group',
    version: 1,
    fields: {
      name: { base: 'string', identifier: true },
      patterns: { base: 'list', itemType: { base: 'ref', accepts: ['photo'] } }
    },
    edges: { children: { parts: { types: ['part'], onRemove: 'restrict' } } }
  },
  {
    id: 'queue',
    name: 'Queue',
    class: 'process',
    version: 1,
    fields: {
      title: { base: 'string', identifier: true, label: 'Title', nullable: true },
      job: { base: 'list', itemType: { base: 'record', fields: {
        item: { base: 'ref', accepts: ['occs', 'cut-plan'] },
        qty: { base: 'number' },
        params: { base: 'map', itemType: { base: 'quantity', unit: 'mm' } } } } },
      materialPool: { base: 'list', itemType: { base: 'ref', accepts: ['sheet'] }, nullable: true }
    },
    edges: {
      children: { runs: { types: ['solve-run'], onRemove: 'cascade' } }
    },
    operators: {
      solve: { id: 'solve', species: 'conversion',
        input: { base: 'ref', accepts: ['queue'] },
        output: { base: 'ref', accepts: ['solve-run'] },
        triggers: [{ event: 'queue.nestingRequested' }] }
    }
  },
  {
    id: 'solve-run',
    name: 'Solve Run',
    class: 'process',
    version: 1,
    fields: {
      title: { base: 'string', identifier: true, label: 'Title', nullable: true },
      outputs: { base: 'list', itemType: { base: 'ref', accepts: ['cut-plan', 'sheet'] }, nullable: true }
    },
    edges: { provenance: { solved: { types: ['queue'], onRemove: 'restrict' } } }
  }
];
