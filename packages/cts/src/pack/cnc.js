// CNC starter type pack (SPEC §16): the acceptance fixture. Every family of
// the collapse table (§15) appears: file, item, group, process, edges,
// operators, triggers, payload traits.
import { quantity } from '../units.js';

function simpleMachine({ initial, values, terminal = [] }) {
  const terminalStates = new Set(terminal);
  return {
    main: {
      initial,
      states: Object.fromEntries(values.map(value => [
        value,
        terminalStates.has(value) ? { terminal: true } : {}
      ]))
    }
  };
}

export const partyTypes = [
  { id: 'organization', class: 'party', name: 'Organization', fields: { name: { base: 'string' }, email: { base: 'string', nullable: true } } },
  { id: 'user', class: 'party', name: 'User', fields: { email: { base: 'string' }, name: { base: 'string', nullable: true } } }
];

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
      serial: { base: 'string' },
      specs: { base: 'record', fields: {
        width: { base: 'quantity', unit: 'mm' },
        length: { base: 'quantity', unit: 'mm' },
        area: { base: 'quantity', unit: 'm2' } } },
      material: { base: 'ref', accepts: ['material'] },
      placed: { base: 'list', itemType: { base: 'ref', accepts: ['part'] } }
    },
    states: {
      main: {
        initial: 'available',
        states: {
          available: {
            initial: 'queued',
            states: { queued: {}, cutting: {} }
          },
          milled: {},
          scrap: { terminal: true }
        }
      }
    },
    transitions: [
      { axis: 'main', from: 'available.queued', to: 'available.cutting' },
      { axis: 'main', from: 'available.cutting', to: 'milled', intent: 'completeMilling' },
      { axis: 'main', from: 'available', to: 'scrap' },
      { axis: 'main', from: 'available.cutting', to: 'scrap' }
    ]
  },
  {
    id: 'part',
    name: 'Part',
    class: 'item',
    version: 1,
    fields: {
      serial: { base: 'string' },
      design: { base: 'ref', accepts: ['cut-plan'] },
      placedOn: { base: 'ref', accepts: ['sheet'], nullable: true }
    },
    edges: { relations: { 'placed-on': { types: ['sheet'], onRemove: 'detach' } } },
    states: {
      main: {
        initial: 'cut',
        states: { cut: {}, milled: {}, installed: { terminal: true } }
      }
    },
    transitions: [
      { axis: 'main', from: 'cut', to: 'milled', intent: 'millPart' },
      { axis: 'main', from: 'milled', to: 'installed', intent: 'installPart' }
    ]
  },
  {
    id: 'project',
    name: 'Project',
    class: 'group',
    version: 1,
    fields: { name: { base: 'string' } },
    edges: { children: { members: { types: ['queue', 'facade'], onRemove: 'restrict' } } },
    states: simpleMachine({ initial: 'draft', values: ['draft', 'active', 'archived'], terminal: ['archived'] }),
    transitions: [
      { axis: 'main', from: 'draft', to: 'active', intent: 'activateProject' },
      { axis: 'main', from: 'active', to: 'archived', intent: 'archiveProject' }
    ]
  },
  {
    id: 'facade',
    name: 'Facade',
    class: 'group',
    version: 1,
    fields: {
      name: { base: 'string' },
      patterns: { base: 'list', itemType: { base: 'ref', accepts: ['photo'] } }
    },
    edges: { children: { parts: { types: ['part'], onRemove: 'restrict' } } },
    states: simpleMachine({ initial: 'draft', values: ['draft', 'active', 'archived'], terminal: ['archived'] }),
    transitions: [{ axis: 'main', from: 'draft', to: 'active' }, { axis: 'main', from: 'active', to: 'archived' }]
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
    states: simpleMachine({ initial: 'draft', values: ['draft', 'nesting', 'ready', 'error', 'closed'], terminal: ['closed'] }),
    transitions: [
      { axis: 'main', from: 'draft', to: 'nesting', intent: 'requestNesting' },
      { axis: 'main', from: 'nesting', to: 'ready', intent: 'completeNestingProduction' },
      { axis: 'main', from: 'nesting', to: 'error', intent: 'nestingSolveFailed' },
      { axis: 'main', from: 'ready', to: 'closed', intent: 'closeQueue' },
      { axis: 'main', from: 'error', to: 'draft', intent: 'resetQueue' }
    ],
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
    edges: { provenance: { solved: { types: ['queue'], onRemove: 'restrict' } } },
    states: simpleMachine({ initial: 'nesting', values: ['nesting', 'complete', 'failed', 'chosen'], terminal: ['chosen'] }),
    transitions: [
      { axis: 'main', from: 'nesting', to: 'complete', intent: 'nestingSolveCompleted' },
      { axis: 'main', from: 'nesting', to: 'failed', intent: 'nestingSolveFailed' },
      { axis: 'main', from: 'complete', to: 'chosen', intent: 'acceptNestingRun' },
      { axis: 'main', from: 'failed', to: 'failed' }
    ]
  }
];

// The nesting seam (SPEC §16): three declarations and one pure function.
export const nestingOperators = [
  {
    id: 'extract',
    species: 'projection',
    declaringType: 'occs',
    input: { base: 'record', fields: {
      parameters: { base: 'map', itemType: { base: 'quantity', unit: 'mm' } } } },
    output: { base: 'list', itemType: { base: 'record', fields: {
      x: { base: 'quantity', unit: 'mm' }, y: { base: 'quantity', unit: 'mm' } } } }
  },
  {
    id: 'solve',
    species: 'service',
    input: { base: 'record', fields: {
      sheets: { base: 'list', itemType: { base: 'record', fields: {
        width: { base: 'quantity', unit: 'mm' }, length: { base: 'quantity', unit: 'mm' } } } },
      parts: { base: 'list', itemType: { base: 'record', fields: {
        x: { base: 'quantity', unit: 'mm' }, y: { base: 'quantity', unit: 'mm' } } } },
      kerf: { base: 'quantity', unit: 'mm' } } },
    output: { base: 'record', fields: {
      placed: { base: 'number' }, efficiency: { base: 'quantity', unit: 'percent' } } }
  }
];

export const packFixtures = {
  sheetInstance: {
    type: 'sheet',
    typeVersion: 1,
    fields: {
      serial: 'SH-0001',
      specs: { width: quantity(2500, 'mm'), length: quantity(1250, 'mm'), area: quantity(3.125, 'm2') },
      material: { type: 'material', id: 'mat-1' },
      placed: []
    },
    states: { main: 'available.queued' }
  },
  queueInstance: {
    type: 'queue',
    typeVersion: 1,
    fields: {
      job: [{ item: { type: 'occs', id: 'occ-1' }, qty: 4, params: { t: quantity(19, 'mm') } }],
      materialPool: null
    },
    states: { main: 'draft' }
  }
};
