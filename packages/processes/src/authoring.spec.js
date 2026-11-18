// The headless authoring seam's completeness guard: every palette item
// must drop, sync, configure, and survive the canvas double round-trip
// without a browser. A palette item that cannot be authored through the
// seam is a defect by contract (packages/processes README, "Headless
// definition authoring").
import { describe, expect, it } from 'vitest';
import {
  collapseEffectAccessGrants,
  createDefinitionAuthoring,
  createProcessRecordSync,
  graphEdgeSocketProblems,
  graphIntegrityProblems
} from './authoring.js';
import { validateProcessDefinition } from './validation.js';
import { validateRoundTrip } from './transpiler.js';
import { compileTreeDeclarations } from './designer.js';
import { createTypeRegistry, projectDomainFromView, frameworkTypes, resolveCtsDefinition, checkCtsGraphBindings, rowFieldId } from '../../cts/src/index.js';
import { cncTypePack } from '../../cts/src/pack/cnc.js';
import { facadeDomain, facadeServices } from '../../../test-tools/facade-plugin.js';
import nestingListing from '../../../workers/nesting/listing.json' with { type: 'json' };
const nestingServices = nestingListing.declarations.services.map(service => ({
  id: `plugin.nesting.${service.id}`, species: 'service', command: `plugin.nesting.${service.id}`,
  palette: service.palette, signature: service.signature, render: service.render || { label: service.label || service.id }
}));

function projectedDomain() {
  const registry = createTypeRegistry({ id: 'authoring-spec' });
  for (const declaration of [...frameworkTypes, ...cncTypePack]) {
    registry.defineType(declaration);
  }
  return projectDomainFromView(registry, 'org-1', facadeDomain, {
    packServices: [...facadeServices, ...nestingServices]
  });
}

function authoring() {
  return createDefinitionAuthoring(projectedDomain());
}

// The edit path: a seam seated on an existing authored document accepts
// the same gestures against the stored graph — original nodes and wires
// survive, new gestures land beside them, and declaration wiring keeps
// interpreting over the combined graph.
describe('seeding the authoring seam from a stored document', () => {
  it('applies gestures to the stored graph without disturbing it', () => {
    const first = authoring();
    first.declareClass({ id: 'cls_sheet', typeId: 'sheet', name: 'Sheet' });
    first.declareTypeRef({ id: 'ref_sheet', typeId: 'sheet' });
    first.drop('construct', { id: 'node_make' });
    first.wireDeclaration('ref_sheet', 'node_make', 'binds');
    const stored = first.definition();

    const seam = createDefinitionAuthoring(projectedDomain(), null, stored);
    seam.drop('calculate', { id: 'node_extra' });
    const data = seam.definition();

    const ids = data.graph.nodes.map(node => node.id);
    expect(ids).toContain('node_make');
    expect(ids).toContain('cls_sheet');
    expect(ids).toContain('node_extra');
    expect(Object.keys(data.processNodes)).toContain('node_extra');
    // Server-owned records never enter the seam through seeding.
    expect(data.compiled).toBeUndefined();
    expect(data.history).toBeUndefined();
    // Existing records keep their authored bindings; the new node syncs.
    expect(data.processNodes.node_make.typeId).toBe('sheet');
    expect(data.processNodes.node_extra.kind).toBe('value.math');
  });

  it('wires a declaration onto a seeded declaration node', () => {
    const first = authoring();
    first.declareClass({ id: 'cls_sheet', typeId: 'sheet', name: 'Sheet' });
    const seam = createDefinitionAuthoring(projectedDomain(), null, first.definition());
    seam.declareField({ id: 'fld_width', ownerClassId: 'cls_sheet', name: 'width', descriptor: { base: 'number' } });
    const data = seam.definition();
    expect(data.ctsTypes.fld_width.kind).toBe('field');
    expect(data.graph.edges.some(edge => edge.label === 'declares' && edge.source === 'fld_width' && edge.target === 'cls_sheet')).toBe(true);
  });

  it('accepts socket handles on connect (the guide\'s data: spelling) and mints them on the edge', () => {
    const seam = authoring();
    seam.drop('literal', { id: 'lit1' });
    seam.drop('castValue', { id: 'cast1' });
    const edge = seam.connect('lit1', 'data:value', 'cast1', 'data:value');
    expect(edge.source).toBe('lit1');
    expect(edge.sourceHandle).toBe('data:value');
    expect(edge.targetHandle.startsWith('data:')).toBe(true);
  });

  it('derives row keys from names in any script (SPEC §4)', () => {
    expect(rowFieldId('Название задачи')).toMatch(/^[a-z][a-zA-Z0-9]*$/);
    expect(rowFieldId('Field name 2')).toBe('fieldName2');
    expect(rowFieldId('Ширина sheet 2')).toBe('sheet2');
    // Stable digest: the same name mints the same key.
    expect(rowFieldId('Название задачи')).toBe(rowFieldId('Название задачи'));
    expect(rowFieldId('2 номера')).toMatch(/^f[0-9a-z]+$/);
    expect(rowFieldId('')).toBe('');
  });
});

function allPaletteItems(context) {
  return context.contract.paletteGroups.flatMap(group => group.items).filter(item => item.kind);
}

function domainWithPackServices(packServices = [], registryId = 'sync-domain') {
  const registry = createTypeRegistry({ id: registryId });
  for (const declaration of [...frameworkTypes, ...cncTypePack]) {
    registry.defineType(declaration);
  }
  return projectDomainFromView(registry, 'org-1', facadeDomain, { packServices });
}

describe('headless definition authoring', () => {
  it('drops every palette item into a synced record with resolved ports', () => {
    const context = authoring();
    const items = allPaletteItems(context);
    expect(items.length).toBeGreaterThan(20);
    context.declareTypeRef({ id: 'walker_ref', typeId: 'sheet' });
    for (const item of items) {
      context.drop(item.id, { id: `drop-${item.id}` });
      if (item.kind === 'cts.construct') context.wireDeclaration('walker_ref', `drop-${item.id}`, 'binds');
    }
    for (const item of items) {
      const record = context.record(`drop-${item.id}`);
      expect(record, `dropped ${item.id}`).toBeTruthy();
      expect(record.kind).toBe(item.kind);
      expect(record.inputs.length + record.outputs.length, `${item.id} resolves ports`).toBeGreaterThan(0);
    }
  });

  it('authors the loop as a pair — the closer lands with its loop', () => {
    const context = authoring();
    const [loop, closer] = context.drop('forEachEntity', { id: 'loop' });
    expect(loop.kind).toBe('control.forEach');
    expect(closer.kind).toBe('control.forEachEnd');
    expect(context.record('loopEnd')).toBe(closer);
  });

  it('preserves the record elimination key through the sync pass', () => {
    const context = authoring();
    context.drop('recordField', { id: 'rowName' });
    const record = context.configure('rowName', { path: 'name', type: { base: 'string', nullable: true } });
    expect(record.path).toBe('name');
    context.sync('rowName');
    expect(context.record('rowName').path).toBe('name');
  });

  it('configures join keys and record composer fields', () => {
    const context = authoring();
    context.drop('joinByKey', { id: 'join' });
    expect(context.configure('join', { leftKey: 'cassette', rightKey: 'name' }).leftKey).toBe('cassette');
    context.drop('constructRecord', { id: 'params' });
    expect(context.configure('params', { fields: ['A', 'B'] }).fields).toEqual(['A', 'B']);
  });

  it('authors scheduled and event-subscribed entries that survive later gestures', () => {
    const context = authoring();
    context.drop('emitEvent', { id: 'tick' });
    context.configure('tick', { trigger: { mode: 'schedule', schedule: { interval: 'PT2M' } } });
    context.drop('emitEvent', { id: 'sub' });
    context.configure('sub', { eventId: 'org1.test' });
    context.drop('finish', { id: 'end' });
    expect(context.record('tick').trigger).toEqual({ mode: 'schedule', schedule: { interval: 'PT2M' } });
    expect(context.record('sub').trigger).toEqual({ mode: 'event', eventId: 'org1.test' });
  });

  it('keeps the trigger-payload path the palette preset authors', () => {
    const context = authoring();
    context.drop('eventPayload', { id: 'payload' });
    context.drop('finish', { id: 'end' });
    expect(context.record('payload').path).toBe('event.payload');
  });

  it('stores a socket fallback as one broadcast item packet', () => {
    const context = authoring();
    context.drop('itemAtPosition', { id: 'first' });
    const record = context.setInputDefault('first', 'index', 0);
    expect(record.inputDefaults.index).toEqual({ branches: [{ path: [], items: [0] }] });
  });

  it('refuses socket defaults through configure — setInputDefault is the only channel', () => {
    const context = authoring();
    context.drop('itemAtPosition', { id: 'first' });
    expect(() => context.configure('first', { inputDefaults: { index: 0 } }))
      .toThrow(/setInputDefault/);
  });

  it('refuses defaults on sockets the node does not declare', () => {
    const context = authoring();
    context.drop('itemAtPosition', { id: 'first' });
    expect(() => context.setInputDefault('first', 'banana', 0))
      .toThrow(/no input socket banana/);
  });

  it('refuses bare ids as entity-reference defaults — the picker shape is the law', () => {
    const context = authoring();
    context.drop('mutate', { id: 'mut' });
    expect(() => context.setInputDefault('mut', 'entity', '6ae079fcbc3d8a96eea8cc55'))
      .toThrow(/\{type, id\}/);
  });

  it('rejects incompatible wires and single-socket double wires at the gate', () => {
    const context = authoring();
    context.drop('literal', { id: 'text' });
    context.drop('itemAtPosition', { id: 'first' });
    // string literal into the integer index socket is incompatible
    expect(() => context.connect('text', 'data:value', 'first', 'data:index')).toThrow(/Incompatible/);
    context.configure('text', { type: { base: 'integer', nullable: false }, value: 0 });
    const edge = context.connect('text', 'data:value', 'first', 'data:index');
    expect(edge.sourceHandle).toBe('data:value');
    expect(edge.targetHandle).toBe('data:index');
    expect(() => context.connect('text', 'data:value', 'first', 'data:index')).not.toThrow();
    const other = context.drop('literal', { id: 'other' });
    context.configure('other', { type: { base: 'integer', nullable: false }, value: 1 });
    expect(() => context.connect('other', 'data:value', 'first', 'data:index')).toThrow(/accepts one wire/);
  });

  it('wires two upstream completions into a join (fan-out is the multi-wire gesture)', () => {
    const context = authoring();
    context.declareTypeRef({ id: 'ref_sheet', typeId: 'sheet' });
    context.drop('construct', { id: 'first' });
    context.wireDeclaration('ref_sheet', 'first', 'binds');
    context.drop('construct', { id: 'second' });
    context.wireDeclaration('ref_sheet', 'second', 'binds');
    context.drop('joinAllPaths', { id: 'join' });
    context.connect('first', 'control:completed', 'join', 'control:branches');
    expect(() => context.connect('second', 'control:completed', 'join', 'control:branches')).not.toThrow();
    expect(context.definition().graph.edges.filter(edge => edge.target === 'join')).toHaveLength(2);
  });

  it('retypes a compare node by wiring a typed source', () => {
    const context = authoring();
    context.drop('literal', { id: 'left' });
    context.configure('left', { type: { base: 'number', nullable: false }, value: 5 });
    context.drop('compareValues', { id: 'cmp' });
    expect(() => context.connect('left', 'data:value', 'cmp', 'data:left')).not.toThrow();
    expect(context.record('cmp').type).toMatchObject({ base: 'number' });
  });

  it('propagates an entity element type through the seam (concat over entity lists)', () => {
    const context = authoring();
    context.declareTypeRef({ id: 'ref_sheet', typeId: 'sheet' });
    context.drop('allEntities', { id: 'all' });
    context.configure('all', { typeId: 'sheet' });
    context.drop('joinLists', { id: 'cat' });
    context.connect('all', 'data:result', 'cat', 'data:left');
    expect(context.record('cat').type).toMatchObject({ base: 'entityRef', typeId: 'sheet' });
    context.drop('mutate', { id: 'mut' });
    expect(() => context.connect('cat', 'data:value', 'mut', 'data:entity')).not.toThrow();
  });

  it('authors the declaration tree in-definition: classes, ref fields, children to type references, wired bindings', () => {    const context = authoring();
    context.declareClass({ id: 'orderClass', typeId: 'facade-order', class: 'group', name: 'Facade order' });
    context.declareClass({ id: 'attemptClass', typeId: 'nesting-attempt', class: 'item', name: 'Nesting attempt' });
    context.declareField({ id: 'orderName', ownerClassId: 'orderClass', name: 'name', descriptor: { base: 'string', identifier: true } });
    context.declareField({ id: 'attemptLabel', ownerClassId: 'attemptClass', name: 'label', descriptor: { base: 'string', identifier: true } });
    context.declareField({ id: 'attemptResult', ownerClassId: 'attemptClass', name: 'result', descriptor: { base: 'json' } });
    context.declareTypeRef({ id: 'xlsxRef', typeId: 'xlsx-workbook' });
    context.declareTypeRef({ id: 'csvRef', typeId: 'csv-table' });
    context.declareTypeRef({ id: 'designRef', typeId: 'cassette-design' });
    context.declareField({ id: 'tableField', ownerClassId: 'orderClass', name: 'table', descriptor: { base: 'ref' } });
    context.wireDeclaration('xlsxRef', 'tableField', 'targets');
    context.wireDeclaration('csvRef', 'tableField', 'targets');
    context.wireDeclaration('designRef', 'orderClass', 'children', { key: 'contents' });
    context.wireDeclaration('attemptClass', 'orderClass', 'children', { key: 'contents' });
    context.drop('construct', { id: 'order' });
    context.wireDeclaration('orderClass', 'order', 'binds');

    const definition = context.definition();
    const treeNodes = definition.graph.nodes.filter(node => node.type !== 'processNode');
    const { declarations, diagnostics } = compileTreeDeclarations(treeNodes, definition.graph.edges, definition.processNodes);
    expect(diagnostics).toEqual([]);
    expect(declarations).toEqual([
      { id: 'nesting-attempt', class: 'item', name: 'Nesting attempt', fields: { label: { base: 'string', identifier: true }, result: { base: 'json' } } },
      {
        id: 'facade-order', class: 'group', name: 'Facade order',
        fields: { name: { base: 'string', identifier: true }, table: { base: 'ref', accepts: ['xlsx-workbook', 'csv-table'] } },
        edges: { children: { contents: { types: ['cassette-design', 'nesting-attempt'], onRemove: 'restrict' } } }
      }
    ]);
    // The binding derives from the wire (the designer's live pass), and the
    // ports re-sync from it.
    expect(definition.processNodes.order.typeId).toBe('facade-order');
    expect(definition.processNodes.order.outputs.map(port => port.id)).toEqual(['completed', 'result']);
  });

  it('authors states and their entry and nesting wires (SPEC §7)', () => {
    const context = authoring();
    context.declareClass({ id: 'panelClass', typeId: 'part', class: 'item', name: 'Panel' });
    context.declareState({ id: 'stNew', value: 'NEW' });
    context.declareState({ id: 'stLive', value: 'LIVE' });
    context.wireDeclaration('stNew', 'stLive', 'nested');
    context.declareTypeRef({ id: 'ref_part', typeId: 'part' });
    context.drop('construct', { id: 'makePanel' });
    context.wireDeclaration('panelClass', 'makePanel', 'binds');
    context.wireDeclaration('stNew', 'makePanel', 'entry');
    context.drop('transition', { id: 'shipPanel' });
    context.connect('makePanel', 'data:result', 'shipPanel', 'data:entity');
    context.wireDeclaration('stLive', 'shipPanel', 'entry');

    const definition = context.definition();
    // A state record is a flat value token (SPEC §7): the draft's own
    // vocabulary, draft-local at validation.
    expect(definition.ctsTypes.stNew).toEqual({ kind: 'state', id: 'stNew', value: 'NEW' });
    const nestedEdge = definition.graph.edges.find(edge => edge.id === 'decl:nested:stNew-stLive');
    expect(nestedEdge).toBeTruthy();
    const entryEdge = definition.graph.edges.find(edge => edge.id === 'decl:entry:stNew-makePanel');
    expect(entryEdge).toMatchObject({ sourceHandle: 'data:state', targetHandle: 'data:state' });
    expect(definition.processNodes.makePanel.inputDefaults.state).toBe('NEW');
    expect(definition.processNodes.shipPanel.inputDefaults.state).toBe('LIVE');
    expect(graphEdgeSocketProblems(definition)).toEqual([]);
    expect(graphIntegrityProblems(definition)).toEqual([]);
    const errors = checkCtsGraphBindings(resolveCtsDefinition(definition, projectedDomain()).definition, projectedDomain());
    expect(errors).toEqual([]);
  });

  it('configures declaration nodes: state display policy and value, class glyph, field descriptor', () => {
    const context = authoring();
    context.declareClass({ id: 'cls', typeId: 'part', class: 'item', name: 'Part' });
    context.declareState({ id: 'stNew', value: 'NEW' });
    context.declareField({ id: 'f1', ownerClassId: 'cls', name: 'title', descriptor: { base: 'string' } });
    context.drop('construct', { id: 'mk' });
    context.wireDeclaration('cls', 'mk', 'binds');
    context.wireDeclaration('stNew', 'mk', 'entry');

    context.configure('stNew', { severity: 'warn', icon: 'pi pi-flag', label: 'New' });
    context.configure('stNew', { value: 'FRESH' });
    // A state rename re-authors every entry wire that carries it.
    expect(context.definition().processNodes.mk.inputDefaults.state).toBe('FRESH');
    context.configure('cls', { glyph: 'ck-entity-icon ck-entity-icon-bolt' });
    context.configure('f1', { descriptor: { base: 'string', nullable: true, identifier: true } });

    const definition = context.definition();
    expect(definition.graph.nodes.find(node => node.id === 'stNew').data)
      .toMatchObject({ value: 'FRESH', severity: 'warn', icon: 'pi pi-flag', label: 'New' });
    expect(definition.graph.nodes.find(node => node.id === 'cls').data.glyph)
      .toBe('ck-entity-icon ck-entity-icon-bolt');
    expect(definition.ctsTypes.f1.descriptor).toEqual({ base: 'string', nullable: true, identifier: true });
    expect(() => context.configure('cls', { typeId: 'nope' })).toThrow(/authors name, glyph/);
    expect(() => context.configure('ghost', {})).toThrow(/No process node ghost/);
  });

  it('preserves authored relation selection and socket defaults across a vocabulary gap', () => {
    const context = authoring();
    // Bind against the full domain first: the relation selection derives
    // (part carries the declared placed-on relation).
    context.drop('relatedEntities', { id: 'gapTables' });
    context.configure('gapTables', { typeId: 'part' });
    const derived = context.record('gapTables').relationKey;
    expect(derived).toBeTruthy();
    // Re-seat on a domain that does not know the type: the sync must not
    // strip the authored selection.
    context.withDomain({ entities: [], fieldSchemas: {}, workflows: {}, construction: {}, relations: [], projectionContracts: {}, serviceContracts: {} });
    const record = context.record('gapTables');
    expect(record.relationKey).toBe(derived);
    // The same preservation holds when the type IS known but exposes no
    // relations (partial domain, load race): an empty relations list is a
    // vocabulary gap, never a reset.
    context.withDomain({ entities: [{ type: 'part', label: 'Part', collection: 'parts', blocks: ['identity'], meta: false }], fieldSchemas: {}, workflows: {}, construction: {}, relations: [], projectionContracts: {}, serviceContracts: {} });
    expect(context.record('gapTables').relationKey).toBe(derived);
  });

  it('refuses an illegal declaration wire at the same gate the canvas applies', () => {
    const context = authoring();
    context.declareClass({ id: 'a', typeId: 'order-a', name: 'A' });
    context.declareTypeRef({ id: 'b', typeId: 'xlsx-workbook' });
    expect(() => context.wireDeclaration('a', 'b', 'children')).toThrow(/not a legal 'children'/);
  });

  it('round-trips every dropped palette record through the canvas twice', () => {
    const context = authoring();
    context.declareTypeRef({ id: 'walker_ref', typeId: 'sheet' });
    for (const item of allPaletteItems(context)) {
      context.drop(item.id, { id: `drop-${item.id}` });
      if (item.kind === 'cts.construct') context.wireDeclaration('walker_ref', `drop-${item.id}`, 'binds');
    }
    const definition = context.definition();
    const { errors, warnings } = validateRoundTrip(definition);
    expect(errors, errors.join('; ')).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('wires are live binding channels: an entity stream adapts an unbound consumer on connect', () => {
    const context = authoring();
    context.drop('currentUser', { id: 'who' });
    context.drop('getField', { id: 'email' });
    context.connect('who', 'data:value', 'email', 'data:entity');
    context.configure('email', { path: 'fields.email' });

    const definition = context.definition();
    const node = definition.data?.processNodes?.email || definition.processNodes.email;
    expect(node.typeId).toBe('user');
    expect(node.path).toBe('fields.email');
    expect(node.outputs.find(port => port.id === 'value')?.type?.base).toBe('string');

    // The typed value wires into a string operation; the raw entity
    // stream still refuses one (a party instance is not a string).
    context.drop('text', { id: 'split' });
    context.configure('split', { operation: 'split' });
    expect(() => context.connect('email', 'data:value', 'split', 'data:text')).not.toThrow();
    expect(() => context.connect('who', 'data:value', 'split', 'data:separator'))
      .toThrow(/Expected string, received entityRef<user>/);
  });

  it('the record path is the single home of the Get Field selection — retired channel defaults unwrap once', () => {
    const context = authoring();
    context.drop('currentUser', { id: 'who' });
    context.drop('getField', { id: 'gf' });
    context.connect('who', 'data:value', 'gf', 'data:entity');

    // Every spelling older drafts carried on the `field` socket default —
    // a packet, a plain string, machine junk — unwraps into `path` and
    // the channel key disappears.
    for (const legacy of [
      { branches: [{ path: [], items: ['fields.name'] }] },
      'fields.roles',
      '[object Object]'
    ]) {
      const record = context.record('gf');
      record.inputDefaults = { field: legacy };
      context.sync('gf');
      expect(record.inputDefaults.field).toBeUndefined();
      expect(['fields.name', 'fields.roles', 'fields.email']).toContain(record.path);
      expect(record.outputs.find(port => port.id === 'value')?.type?.base).not.toBe('json');
    }
  });

  it('resolves service ports against the current domain, not the one captured at construction', () => {
    // The designer replaces its projected domain when the served
    // organization projection (mounted packs plus installed plugins)
    // arrives, then re-runs the sync pass. A service node loaded before it
    // must gain its signature sockets on that pass; capturing the domain
    // when the sync was built left it with only its event contract.
    const contract = { domain: domainWithPackServices([], 'sync-bare'), fieldsForEntity: () => [] };
    const sync = createProcessRecordSync({ contract });
    const record = { id: 'nest', kind: 'cts.service', operator: 'plugin.nesting.nesting-solve' };

    sync.syncProcessNode(record);
    expect(record.inputs.map(port => port.id)).toEqual(['in']);
    expect(record.outputs.map(port => port.id)).toEqual(['completed']);

    contract.domain = domainWithPackServices([...facadeServices, ...nestingServices], 'sync-served');
    sync.syncProcessNode(record);
    expect(record.inputs.map(port => port.id)).toEqual(['in', 'items', 'sheetWidth', 'sheetHeight', 'space', 'sheetPolygon']);
    expect(record.outputs.map(port => port.id)).toEqual(['completed', 'result']);
    expect(record.inputs.find(port => port.id === 'sheetWidth')).toMatchObject({ required: false, default: 1220 });
    expect(record.inputs.find(port => port.id === 'sheetHeight')).toMatchObject({ required: false, default: 2440 });
    expect(record.inputs.find(port => port.id === 'sheetPolygon')).toMatchObject({ required: false });
    expect(record.inputDefaults.sheetWidth).toEqual({ branches: [{ path: [], items: [1220] }] });
    expect(record.inputDefaults.sheetHeight).toEqual({ branches: [{ path: [], items: [2440] }] });
    expect(record.inputDefaults.space).toEqual({ branches: [{ path: [], items: [3] }] });
  });
});

describe('headless layout and graph integrity', () => {
  it('places every dropped and declared node on a distinct grid slot', () => {
    const seam = createDefinitionAuthoring(projectedDomain());
    seam.declareClass({ id: 'cls', typeId: 't-x', name: 'X' });
    seam.drop('construct', { id: 'n1' });
    seam.declareTypeRef({ id: 'ref_n1', typeId: 'sheet' });
    seam.wireDeclaration('ref_n1', 'n1', 'binds');
    seam.drop('mutate', { id: 'n2' });
    const positions = seam.definition().graph.nodes.map(node => node.position);
    expect(positions.length).toBeGreaterThan(2);
    for (const position of positions) {
      expect(typeof position?.x).toBe('number');
      expect(typeof position?.y).toBe('number');
    }
    expect(new Set(positions.map(position => `${position.x},${position.y}`)).size).toBe(positions.length);
  });

  it('flags the structural corruption the save floor rejects', () => {
    const problems = graphIntegrityProblems({
      graph: {
        nodes: [
          { id: '', type: 'processNode', data: {} },
          { id: 'a' },
          { id: 'stretched', type: 'banner', position: { x: 0, y: 0 } },
          { id: 'phantom', type: 'processNode', position: { x: 0, y: 0 }, data: { refId: 'missing' } }
        ],
        edges: [{ id: 'e', source: 'ghost', target: 'a' }]
      },
      processNodes: {}
    });
    expect(problems).toContain('node 0 has no id');
    expect(problems.some(problem => problem.includes('no numeric position'))).toBe(true);
    expect(problems).toContain('edge e references a missing node');
    expect(problems.some(problem => problem.includes('unknown canvas type banner'))).toBe(true);
    expect(problems).toContain('node phantom addresses no processNodes record');
    expect(graphIntegrityProblems({ graph: { nodes: [] } })).toEqual([]);
  });

  it('flags data edges whose handles address no socket on the addressed record', () => {
    const authored = {
      graph: {
        nodes: [
          { id: 'lit', type: 'processNode', position: { x: 0, y: 0 }, data: { refId: 'lit' } },
          { id: 'make', type: 'processNode', position: { x: 0, y: 0 }, data: { refId: 'make' } }
        ],
        edges: [
          { id: 'ok', source: 'lit', target: 'make', sourceHandle: 'data:value', targetHandle: 'data:in' },
          { id: 'faked', source: 'lit', target: 'make', sourceHandle: 'data:value', targetHandle: 'data:topEdge' }
        ]
      },
      processNodes: {
        lit: { id: 'lit', kind: 'source.literalItem', inputs: [], outputs: [{ id: 'value' }] },
        make: { id: 'make', kind: 'cts.construct', inputs: [{ id: 'in' }], outputs: [] }
      }
    };
    expect(graphEdgeSocketProblems(authored)).toEqual([
      'edge faked handle data:topEdge addresses no inputs socket on make'
    ]);
    expect(graphEdgeSocketProblems({ graph: { nodes: [], edges: [] } })).toEqual([]);
  });

  it('configures an effect lane as one grant and collapses stored multi-grant records', () => {
    const seam = authoring();
    seam.drop('construct', { id: 'make' });
    seam.declareTypeRef({ id: 'ref_make', typeId: 'sheet' });
    seam.wireDeclaration('ref_make', 'make', 'binds');
    expect(() => seam.configure('make', {
      access: { grants: [
        { roleId: 'role_admin', level: 'admin' },
        { roleId: 'role_operator', level: 'write' }
      ] }
    })).toThrow(/one role grant/);
    seam.configure('make', { access: { grants: [{ roleId: 'role_admin', level: 'admin' }] } });
    expect(seam.record('make').access.grants).toHaveLength(1);

    const collapsed = collapseEffectAccessGrants({
      processNodes: {
        make: { id: 'make', kind: 'cts.construct', access: { grants: [
          { roleId: 'role_admin', level: 'admin' },
          { roleId: 'role_operator', level: 'write' }
        ] } },
        lit: { id: 'lit', kind: 'source.literalItem', access: 'item' }
      }
    });
    expect(collapsed.processNodes.make.access.grants).toEqual([{ roleId: 'role_admin', level: 'admin' }]);
    expect(collapsed.processNodes.lit.access).toBe('item');
  });

  it('removes through the same addresses the wiring gestures use', () => {
    const seam = authoring();
    seam.declareClass({ id: 'cls', typeId: 'task', name: 'Task' });
    seam.declareField({ id: 'fld', ownerClassId: 'cls', name: 'title' });
    seam.drop('literal', { id: 'lit' });
    seam.drop('logic', { id: 'dec' });
    seam.configure('lit', { type: { base: 'boolean' }, value: true });
    seam.connect('lit', 'data:value', 'dec', 'data:left');

    const removed = seam.disconnect('lit', 'data:value', 'dec', 'data:left');
    expect(removed.source).toBe('lit');
    expect(seam.edges.filter(edge => edge.role !== 'type')).toHaveLength(0);
    expect(() => seam.disconnect('lit', 'data:value', 'dec', 'data:left')).toThrow(/No wire/);

    seam.unwireDeclaration('fld', 'cls', 'declares');
    expect(seam.edges.some(edge => edge.id === 'declares:fld-cls')).toBe(false);
    expect(() => seam.unwireDeclaration('fld', 'cls', 'declares')).toThrow(/No declaration wire/);

    seam.removeNode('dec');
    expect(seam.definition().graph.nodes.some(node => node.id === 'dec')).toBe(false);
    expect(seam.definition().processNodes.dec).toBeUndefined();
    expect(() => seam.removeNode('dec')).toThrow(/No node/);

    seam.removeNode('cls');
    expect(seam.definition().ctsTypes.cls).toBeUndefined();
    expect(seam.definition().graph.edges).toHaveLength(0);
  });

  it('binds a construct through its binds declaration wire — configure typeId refuses', () => {
    const seam = authoring();
    seam.declareTypeRef({ id: 'ref_make', typeId: 'sheet' });
    seam.drop('construct', { id: 'make' });
    expect(() => seam.configure('make', { typeId: 'sheet' })).toThrow(/binds its type by wire/);
    seam.wireDeclaration('ref_make', 'make', 'binds');
    expect(seam.record('make').typeId).toBe('sheet');
  });

  it('reports an unbound construct at validation — the binding is the wire', () => {
    const seam = authoring();
    seam.drop('construct', { id: 'orphan' });
    const errors = validateProcessDefinition(seam.definition(), projectedDomain()).errors;
    expect(errors.some(message => message.includes('orphan') && message.includes('no type binding'))).toBe(true);
  });

  it('preserves the authored construction mode across a vocabulary gap', () => {
    // The boot-race shape: a draft whose construct is bound to a type the
    // current domain does not know keeps its authored construction; the
    // mode re-resolves only against a contract that declares modes.
    const gap = createDefinitionAuthoring({ entities: [], workflows: {}, fieldSchemas: {}, relations: [], construction: {}, projectionContracts: {}, serviceContracts: {} });
    gap.declareTypeRef({ id: 'ref_material', typeId: 'material' });
    gap.drop('construct', { id: 'make' });
    gap.wireDeclaration('ref_material', 'make', 'binds');
    gap.configure('make', { construction: { mode: 'bogus' } });
    const stored = gap.definition();
    expect(stored.processNodes.make.construction.mode).toBe('bogus');

    const reloaded = createDefinitionAuthoring(
      { entities: [], workflows: {}, fieldSchemas: {}, relations: [], construction: {}, projectionContracts: {}, serviceContracts: {} },
      null,
      structuredClone(stored)
    );
    reloaded.sync('make');
    const kept = reloaded.record('make').construction;
    expect(kept.mode).toBe('bogus');

    const seam = createDefinitionAuthoring(projectedDomain(), null, structuredClone(stored));
    seam.sync('make');
    const resolved = seam.record('make').construction.mode;
    expect(resolved).toBe('genericCreate');
  });

  it('refuses wiring that omits or misnames the socket handle', () => {
    const seam = authoring();
    seam.drop('literal', { id: 'lit' });
    seam.drop('castValue', { id: 'cast' });
    expect(() => seam.connect('lit', 'value', 'cast', 'data:value')).toThrow(/must be a handle/);
    expect(() => seam.connect('lit', 'data:value', 'cast', 'value')).toThrow(/must be a handle/);
    expect(() => seam.connect('lit', 'output:value', 'cast', 'data:value')).toThrow(/retired handle spelling/);
    expect(() => seam.connect('lit', 'control:value', 'cast', 'data:value')).toThrow(/wrong plane/);
    expect(() => seam.disconnect('lit', 'value', 'cast', 'data:value')).toThrow(/must be a handle/);
  });

  it('names the available sockets when a connect address is unknown', () => {
    const seam = authoring();
    seam.drop('literal', { id: 'lit' });
    seam.drop('castValue', { id: 'cast' });
    expect(() => seam.connect('lit', 'data:value', 'cast', 'data:nowhere'))
      .toThrow(/Unknown port cast:data:nowhere — lit outputs: data:value; cast inputs: .*data:value/);
  });

  it('warns when a manual action is exposed to no role — its action is invisible', () => {
    const seam = authoring();
    seam.declareTypeRef({ id: 'ref_sheet', typeId: 'sheet' });
    seam.drop('construct', { id: 'lone' });
    seam.wireDeclaration('ref_sheet', 'lone', 'binds');
    const roles = { role_admin: { id: 'role_admin', label: 'Admin' } };
    const ungated = validateProcessDefinition(seam.definition(), projectedDomain(), { roles });
    expect(ungated.warnings.some(message => message.includes('lone') && message.includes('exposed to no role'))).toBe(true);

    seam.configure('lone', { access: { grants: [{ roleId: 'role_admin', level: 'write' }] } });
    const gated = validateProcessDefinition(seam.definition(), projectedDomain(), { roles });
    expect(gated.warnings.some(message => message.includes('lone') && message.includes('exposed to no role'))).toBe(false);
  });

  it('refuses authored record values — value inputs author typed scalars', () => {
    const seam = authoring();
    seam.drop('literalList', { id: 'rows' });
    expect(() => seam.configure('rows', { value: [{ project: 'Demo Facade' }] })).toThrow(/typed scalars/);
    seam.drop('literal', { id: 'ref' });
    expect(() => seam.configure('ref', { value: { anything: 'else' } })).toThrow(/typed scalars/);
    const entityRef = seam.configure('ref', { value: { type: 'sheet', id: 's1' } });
    expect(entityRef.value).toEqual({ type: 'sheet', id: 's1' });
    seam.drop('itemAtPosition', { id: 'at' });
    expect(() => seam.setInputDefault('at', 'index', { nested: true })).toThrow(/typed scalars/);
    expect(seam.setInputDefault('at', 'index', 0).inputDefaults.index).toEqual({ branches: [{ path: [], items: [0] }] });
  });
});
