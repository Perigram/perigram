// The headless authoring seam's completeness guard: every palette item
// must drop, sync, configure, and survive the canvas double round-trip
// without a browser. A palette item that cannot be authored through the
// seam is a defect by contract (packages/processes README, "Headless
// definition authoring").
import { describe, expect, it } from 'vitest';
import {
  createDefinitionAuthoring
} from './authoring.js';
import { validateRoundTrip } from './transpiler.js';
import { compileTreeDeclarations } from './designer.js';
import { createTypeRegistry, projectDomainFromView, frameworkTypes } from '../../cts/src/index.js';
import { cncTypePack } from '../../cts/src/pack/cnc.js';
import { facadeDomain, facadeServices } from '../../../test-tools/facade-plugin.js';

function projectedDomain() {
  const registry = createTypeRegistry({ id: 'authoring-spec' });
  for (const declaration of [...frameworkTypes, ...cncTypePack]) {
    registry.defineType(declaration);
  }
  return projectDomainFromView(registry, 'org-1', facadeDomain, {
    packServices: facadeServices
  });
}

function authoring() {
  return createDefinitionAuthoring(projectedDomain());
}

function allPaletteItems(context) {
  return context.contract.paletteGroups.flatMap(group => group.items).filter(item => item.kind);
}

describe('headless definition authoring', () => {
  it('drops every palette item into a synced record with resolved ports', () => {
    const context = authoring();
    const items = allPaletteItems(context);
    expect(items.length).toBeGreaterThan(20);
    for (const item of items) {
      context.drop(item.id, { id: `drop-${item.id}` });
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

  it('stores a socket fallback as one broadcast item packet', () => {
    const context = authoring();
    context.drop('itemAtPosition', { id: 'first' });
    const record = context.setInputDefault('first', 'index', 0);
    expect(record.inputDefaults.index).toEqual({ branches: [{ path: [], items: [0] }] });
  });

  it('rejects incompatible wires and single-socket double wires at the gate', () => {
    const context = authoring();
    context.drop('literal', { id: 'text' });
    context.drop('itemAtPosition', { id: 'first' });
    // string literal into the integer index socket is incompatible
    expect(() => context.connect('text', 'value', 'first', 'index')).toThrow(/Incompatible/);
    context.configure('text', { type: { base: 'integer', nullable: false }, value: 0 });
    const edge = context.connect('text', 'value', 'first', 'index');
    expect(edge.sourceHandle).toBe('data:value');
    expect(edge.targetHandle).toBe('data:index');
    expect(() => context.connect('text', 'value', 'first', 'index')).not.toThrow();
    const other = context.drop('literal', { id: 'other' });
    context.configure('other', { type: { base: 'integer', nullable: false }, value: 1 });
    expect(() => context.connect('other', 'value', 'first', 'index')).toThrow(/accepts one wire/);
  });

  it('authors the declaration tree in-definition: classes, ref fields, children to type references, wired bindings', () => {
    const context = authoring();
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
    context.wireDeclaration('orderClass', 'designRef', 'children', { key: 'contents' });
    context.wireDeclaration('orderClass', 'attemptClass', 'children', { key: 'contents' });
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
    expect(() => context.wireDeclaration('b', 'a', 'children')).toThrow(/not a legal 'children'/);
  });

  it('round-trips every dropped palette record through the canvas twice', () => {
    const context = authoring();
    for (const item of allPaletteItems(context)) {
      context.drop(item.id, { id: `drop-${item.id}` });
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
    context.connect('who', 'value', 'email', 'entity');
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
    expect(() => context.connect('email', 'value', 'split', 'text')).not.toThrow();
    expect(() => context.connect('who', 'value', 'split', 'separator'))
      .toThrow(/Expected string, received entityRef<user>/);
  });

  it('the record path is the single home of the Get Field selection — retired channel defaults unwrap once', () => {
    const context = authoring();
    context.drop('currentUser', { id: 'who' });
    context.drop('getField', { id: 'gf' });
    context.connect('who', 'value', 'gf', 'entity');

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
});
