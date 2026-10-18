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
import { validateRoundTrip } from './transpiler.js';
import { camelCaseId, compileTreeDeclarations } from './designer.js';
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

// The edit path: a seam seated on an existing authored document accepts
// the same gestures against the stored graph — original nodes and wires
// survive, new gestures land beside them, and declaration wiring keeps
// interpreting over the combined graph.
describe('seeding the authoring seam from a stored document', () => {
  it('applies gestures to the stored graph without disturbing it', () => {
    const first = authoring();
    first.declareClass({ id: 'cls_sheet', typeId: 'sheet', name: 'Sheet' });
    first.drop('construct', { id: 'node_make' });
    first.configure('node_make', { typeId: 'sheet' });
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
    const edge = seam.connect('lit1', 'data:value', 'cast1', 'value');
    expect(edge.source).toBe('lit1');
    expect(edge.sourceHandle).toBe('data:value');
    expect(edge.targetHandle.startsWith('data:')).toBe(true);
  });

  it('derives row keys from labels in any script', () => {
    expect(camelCaseId('Название задачи')).toBe('названиеЗадачи');
    expect(camelCaseId('Field name 2')).toBe('fieldName2');
    expect(camelCaseId('Ширина sheet 2')).toBe('ширинаSheet2');
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

  it('resolves service ports against the current domain, not the one captured at construction', () => {
    // The designer replaces its projected domain when the served
    // organization projection (mounted packs plus installed plugins)
    // arrives, then re-runs the sync pass. A service node loaded before it
    // must gain its signature sockets on that pass; capturing the domain
    // when the sync was built left it with only its event contract.
    const contract = { domain: domainWithPackServices([], 'sync-bare'), fieldsForEntity: () => [] };
    const sync = createProcessRecordSync({ contract });
    const record = { id: 'nest', kind: 'cts.service', operator: 'plugin.facade.nesting-solve' };

    sync.syncProcessNode(record);
    expect(record.inputs.map(port => port.id)).toEqual(['in']);
    expect(record.outputs.map(port => port.id)).toEqual(['completed']);

    contract.domain = domainWithPackServices(facadeServices, 'sync-served');
    sync.syncProcessNode(record);
    expect(record.inputs.map(port => port.id)).toEqual(['in', 'items', 'sheetWidth', 'sheetHeight', 'space', 'sheetCount']);
    expect(record.outputs.map(port => port.id)).toEqual(['completed', 'result']);
  });
});

describe('headless layout and graph integrity', () => {
  it('places every dropped and declared node on a distinct grid slot', () => {
    const seam = createDefinitionAuthoring(projectedDomain());
    seam.declareClass({ id: 'cls', typeId: 't-x', name: 'X' });
    seam.drop('construct', { id: 'n1' });
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
    seam.connect('lit', 'value', 'dec', 'left');

    const removed = seam.disconnect('lit', 'value', 'dec', 'left');
    expect(removed.source).toBe('lit');
    expect(seam.edges.filter(edge => edge.role !== 'type')).toHaveLength(0);
    expect(() => seam.disconnect('lit', 'value', 'dec', 'left')).toThrow(/No wire/);

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
});
