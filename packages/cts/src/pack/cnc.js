// CNC starter type pack (SPEC §16): the acceptance fixture. Every family of
// the collapse table (§15) appears: file, item, group, process, edges,
// operators, triggers, payload traits.
import { quantity } from '../units.js';

export const partyTypes = [
  { id: 'organization', class: 'party', fields: { name: { base: 'string' }, email: { base: 'string', nullable: true } } },
  { id: 'user', class: 'party', fields: { email: { base: 'string' }, name: { base: 'string', nullable: true } } }
];

export const cncTypePack = [
  {
    id: 'material',
    class: 'file',
    version: 1,
    fields: {
      code: { base: 'string' },
      thickness: { base: 'quantity', unit: 'mm' }
    },
    render: { label: 'Material', icon: 'pi-box' }
  },
  {
    id: 'occs',
    class: 'file',
    version: 1,
    payload: { mime: 'application/cutkit+occs', accept: ['.occs'], byteLimit: 5 * 1024 * 1024 },
    fields: {
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
    class: 'file',
    version: 1,
    fields: {
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
    class: 'file',
    version: 1,
    payload: { mime: 'image/*', accept: ['image/*'], byteLimit: 25 * 1024 * 1024 },
    fields: {}
  },
  {
    id: 'sheet',
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
    states: { main: { initial: 'available', values: ['available', 'cutting', 'milled', 'scrap'], terminal: ['scrap'] } },
    transitions: [
      { from: 'available', to: 'cutting' },
      { from: 'cutting', to: 'milled', intent: 'completeMilling' },
      { from: 'available', to: 'scrap' },
      { from: 'cutting', to: 'scrap' }
    ]
  },
  {
    id: 'part',
    class: 'item',
    version: 1,
    fields: {
      serial: { base: 'string' },
      design: { base: 'ref', accepts: ['cut-plan'] },
      placedOn: { base: 'ref', accepts: ['sheet'], nullable: true }
    },
    edges: { relations: { 'placed-on': { types: ['sheet'], onRemove: 'detach' } } },
    states: { main: { initial: 'cut', values: ['cut', 'milled', 'installed'], terminal: ['installed'] } },
    transitions: [
      { from: 'cut', to: 'milled', intent: 'millPart' },
      { from: 'milled', to: 'installed', intent: 'installPart' }
    ]
  },
  {
    id: 'project',
    class: 'group',
    version: 1,
    fields: { name: { base: 'string' } },
    edges: { children: { members: { types: ['queue', 'facade'], onRemove: 'restrict' } } },
    states: { main: { initial: 'draft', values: ['draft', 'active', 'archived'], terminal: ['archived'] } },
    transitions: [
      { from: 'draft', to: 'active', intent: 'activateProject' },
      { from: 'active', to: 'archived', intent: 'archiveProject' }
    ]
  },
  {
    id: 'facade',
    class: 'group',
    version: 1,
    fields: {
      name: { base: 'string' },
      patterns: { base: 'list', itemType: { base: 'ref', accepts: ['photo'] } }
    },
    edges: { children: { parts: { types: ['part'], onRemove: 'restrict' } } },
    states: { main: { initial: 'draft', values: ['draft', 'active', 'archived'], terminal: ['archived'] } },
    transitions: [{ from: 'draft', to: 'active' }, { from: 'active', to: 'archived' }]
  },
  {
    id: 'queue',
    class: 'process',
    version: 1,
    fields: {
      job: { base: 'list', itemType: { base: 'record', fields: {
        item: { base: 'ref', accepts: ['occs', 'cut-plan'] },
        qty: { base: 'number' },
        params: { base: 'map', itemType: { base: 'quantity', unit: 'mm' } } } } },
      materialPool: { base: 'list', itemType: { base: 'ref', accepts: ['sheet'] }, nullable: true }
    },
    edges: {
      children: { runs: { types: ['solve-run'], onRemove: 'cascade' } }
    },
    states: { main: { initial: 'draft', values: ['draft', 'nesting', 'ready', 'error', 'closed'],
      terminal: ['closed'] } },
    transitions: [
      { from: 'draft', to: 'nesting', intent: 'requestNesting' },
      { from: 'nesting', to: 'ready', intent: 'completeNestingProduction' },
      { from: 'nesting', to: 'error', intent: 'nestingSolveFailed' },
      { from: 'ready', to: 'closed', intent: 'closeQueue' },
      { from: 'error', to: 'draft', intent: 'resetQueue' }
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
    class: 'process',
    version: 1,
    fields: {
      outputs: { base: 'list', itemType: { base: 'ref', accepts: ['cut-plan', 'sheet'] }, nullable: true }
    },
    edges: { provenance: { solved: { types: ['queue'], onRemove: 'restrict' } } },
    states: { main: { initial: 'nesting', values: ['nesting', 'complete', 'failed', 'chosen'], terminal: ['chosen'] } },
    transitions: [
      { from: 'nesting', to: 'complete', intent: 'nestingSolveCompleted' },
      { from: 'nesting', to: 'failed', intent: 'nestingSolveFailed' },
      { from: 'complete', to: 'chosen', intent: 'acceptNestingRun' },
      { from: 'failed', to: 'failed' }
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
    states: { main: 'available' }
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
