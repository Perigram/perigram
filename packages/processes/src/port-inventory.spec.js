// The port inventory pin (SPEC §20). Every kind in the catalog, resolved
// against representative records, snapshotted. The catalog is a single
// home under rewrite: this pin is the proof that a rewrite preserves the
// authored surface. Adding a kind or changing any socket updates this
// snapshot DELIBERATELY (regenerate and review the diff) — never silently.
import { describe, it, expect } from 'vitest';
import { PROCESS_NODE_CATALOG, resolveCatalogNodePorts } from './node-catalog.js';

const domain = {
  entities: [
    { type: 'panel', label: 'Panel', collection: 'items', blocks: ['identity', 'data', 'specs'] }
  ],
  fieldSchemas: {
    panel: [
      { path: 'identity.name', block: 'identity', type: { base: 'string', shape: 'item' }, writable: true },
      { path: 'data.note', block: 'data', type: { base: 'string', shape: 'item' }, writable: true },
      { path: 'specs.width', block: 'specs', type: { base: 'number', shape: 'item', unit: 'mm' }, writable: true }
    ]
  },
  construction: {
    panel: { modes: ['genericCreate'], defaultMode: 'genericCreate', inputs: [{ id: 'name', path: 'name', type: 'string', required: true }] }
  },
  workflows: {},
  serviceContracts: {
    'nesting.solve': { command: 'solveNestingValue', signature: { input: { base: 'record', fields: { kerf: { base: 'number' } } }, output: { base: 'number' } } }
  }
};

// One representative record per kind: enough binding/context for ports to
// resolve deterministically.
const representative = {
  'source.literalItem': { typeId: 'panel', type: { base: 'string' } },
  'source.literalList': { typeId: 'panel', type: { base: 'string' } },
  'value.math': { operation: 'add', type: { base: 'number' } },
  'value.string': { operation: 'concat', type: { base: 'string' } },
  'value.logic': { operation: 'eq', type: { base: 'string' } },
  'value.enum': { enumId: 'panel#stage' },
  'value.dateTime': { operation: 'addDays', type: { base: 'dateTime' } },
  'collection.filter': { type: { base: 'string' } },
  'tree.branch': { type: { base: 'string' } },
  'record.composeBlock': { block: 'data' },
  'record.deconstruct': { typeId: 'panel', blocks: ['data'] },
  'effect.createEntity': { typeId: 'panel', construction: { mode: 'genericCreate', inputs: [{ id: 'name', path: 'name', type: 'string', required: true }] }, blocks: ['data'] },
  'effect.updateEntity': { typeId: 'panel', blocks: ['data'] },
  'effect.changeStatus': { typeId: 'panel' },
  'effect.runCommand': { commandId: 'solveNestingValue', typeId: 'panel' },
  'cts.construct': { typeId: 'panel', construction: { mode: 'genericCreate' } },
  'cts.mutate': { typeId: 'panel' },
  'cts.transition': { typeId: 'panel' },
  'cts.remove': { typeId: 'panel' },
  'cts.command': { commandId: 'solveNestingValue', typeId: 'panel' },
  'cts.service': { operator: 'nesting.solve' },
  'cts.read': { typeId: 'panel', select: 'current' },
  'cts.field': { typeId: 'panel', inputDefaults: { field: 'specs.width' } },
  'cts.compose': { typeId: 'panel', slot: 'data' },
  'cts.decompose': { typeId: 'panel' },
  'control.if': {},
  'control.forEach': { type: { base: 'string' } }
};

function contextFor() {
  return {
    domain,
    fieldSchemas: domain.fieldSchemas.panel,
    fieldSchema: domain.fieldSchemas.panel.find(field => field.path === 'specs.width')
  };
}

function portLine(port) {
  const type = port.type
    ? `${port.type.base}${port.type.typeId ? ':' + port.type.typeId : ''}${port.type.unit ? ':' + port.type.unit : ''}${port.access && port.access !== 'item' ? ':' + port.access : ''}`
    : '?';
  return `${port.role}:${port.id}(${type})${port.required ? '!' : ''}${port.multiple ? '*' : ''}`;
}

describe('port inventory pin (every catalog kind, frozen surface)', () => {
  it('every kind resolves its pinned port set', () => {
    const inventory = {};
    for (const definition of PROCESS_NODE_CATALOG) {
      const record = { kind: definition.kind, ...(representative[definition.kind] || {}) };
      const ports = resolveCatalogNodePorts(record, contextFor());
      inventory[definition.kind] = [
        ...ports.inputs.map(portLine),
        ...ports.outputs.map(portLine)
      ].join('|');
    }
    expect(inventory).toEqual({
      'source.literalItem': 'data:value(string)',
      'source.literalList': 'data:value(string:list)',
      'source.literalTree': 'data:value(json:tree)',
      'source.processInput': 'data:value(json)',
      'source.triggerPayload': 'data:value(json)',
      'source.currentTime': 'data:value(dateTime)',
      'source.secretRef': 'data:value(opaque)',
      'value.cast': 'data:value(json)!|data:value(json)',
      'value.parse': 'data:value(json)!|data:value(json)',
      'value.recordField': 'data:value(record:list)!|data:value(json:list)',
      'value.convertUnit': 'data:value(json)!|data:value(json)',
      'value.toEntityRef': 'data:value(entity)!|data:value(entityRef)',
      'value.toJson': 'data:value(json)!|data:value(json)',
      'value.required': 'data:value(json)!|data:value(json)',
      'value.coalesce': 'data:value(json)!|data:fallback(json)!|data:value(json)',
      'value.validate': 'data:value(json)!|data:value(json)',
      'value.math': 'data:left(number)!|data:right(number)!|data:value(number)',
      'value.string': 'data:left(string)!|data:right(string)!|data:value(string)',
      'value.dateTime': 'data:date(dateTime)!|data:amount(number)!|data:value(dateTime)',
      'value.enum': 'data:value(json)!|data:value(json)',
      'value.compare': 'data:left(json)!|data:right(json)!|data:result(boolean)',
      'value.logic': 'data:left(string)!|data:right(string)!|data:result(boolean)',
      'value.format': 'data:value(json)!|data:value(json)',
      'collection.makeList': 'data:item1(json)|data:item2(json)|data:item3(json)|data:item4(json)|data:value(json:list)',
      'collection.packArray': 'data:value(json:list)!|data:value(array)',
      'collection.unpackArray': 'data:value(array)!|data:value(json:list)',
      'collection.concat': 'data:left(json:list)!|data:right(json:list)!|data:value(json:list)',
      'collection.itemAt': 'data:items(json:list)!|data:index(integer)|data:item(json)',
      'collection.slice': 'data:items(json:list)!|data:start(integer)|data:end(integer)|data:items(json:list)',
      'collection.count': 'data:value(json:list)!|data:value(integer)',
      'collection.distinct': 'data:items(json:list)!|data:keys(json:list)|data:items(json:list)',
      'collection.sort': 'data:items(json:list)!|data:keys(json:list)!|data:items(json:list)',
      'collection.reverse': 'data:value(json:list)!|data:value(json:list)',
      'collection.shift': 'data:items(json:list)!|data:offset(integer)!|data:items(json:list)',
      'collection.partition': 'data:items(json:list)!|data:size(integer)!|data:items(json:tree)',
      'collection.dispatch': 'data:items(json:list)!|data:mask(boolean:list)!|data:true(json:list)|data:false(json:list)',
      'collection.groupBy': 'data:items(json:list)!|data:keys(json:list)!|data:groups(json:tree)',
      'collection.filter': 'data:items(string:list)!|data:mask(boolean:list)!|data:items(string:list)',
      'tree.flatten': 'data:value(json:tree)!|data:value(json:tree)',
      'tree.graft': 'data:value(json:tree)!|data:value(json:tree)',
      'tree.simplify': 'data:value(json:tree)!|data:value(json:tree)',
      'tree.branch': 'data:tree(string:tree)!|data:path(integer:list)!|data:items(string:list)',
      'tree.zip': 'data:left(json)!|data:right(json)!|data:value(json)',
      'tree.unzip': 'data:value(json)!|data:value(json)',
      'tree.cross': 'data:left(json)!|data:right(json)!|data:value(json)',
      'tree.transpose': 'data:value(json:tree)!|data:value(json:tree)',
      'tree.clean': 'data:value(json:tree)!|data:value(json:tree)',
      'tree.stats': 'data:value(json:tree)!|data:stats(record)',
      'record.getField': 'data:block(block)!|data:value(number:mm)',
      'record.fieldChange': 'data:value(number:mm)!|data:change(patch)',
      'record.mergeChanges': 'data:left(patch)!|data:right(patch)!|data:value(patch)',
      'record.applyChanges': 'data:record(entity)!|data:changes(patch)!|data:record(entity)',
      'record.composeBlock': 'data:block(block)',
      'record.modifyBlock': 'data:block(block)!|data:block(block)',
      'record.construct': 'data:record(record)',
      'record.deconstruct': 'data:entity(entity:panel)!|data:data(block)',
      'record.getBlock': 'data:entity(entity)!|data:block(block)',
      'record.entityDraft': 'data:record(entity)',
      'producer.join': 'data:primary(entity:list)!|data:secondary(entity:list)!|data:result(entity:list)',
      'predicate.field': 'data:value(number:mm)!|data:predicate(predicate)',
      'predicate.logic': 'data:left(predicate)!|data:right(predicate)|data:predicate(predicate)',
      'effect.createEntity': 'control:in(event)!*|data:name(string:list)!|data:data(block:list)|data:states.main(status:panel:list)|control:completed(event)|data:result(entity:panel)',
      'effect.runProducer': 'control:in(event)!*|control:completed(event)|data:result(entity)',
      'effect.updateEntity': 'control:in(event)!*|data:entity(entityRef:panel:list)!|data:data(block:list)|data:states.main(status:panel:list)|control:completed(event)|data:result(entity:panel)',
      'effect.changeStatus': 'control:in(event)!*|data:entity(entityRef:panel:list)!|data:status(status:panel:list)!|data:changes(patch:panel:list)|data:note(string:list)|control:completed(event)|data:result(entity:panel)',
      'effect.archiveEntity': 'control:in(event)!*|data:entity(entityRef:list)!|data:note(string:list)|control:completed(event)|data:result(entity)',
      'effect.deleteEntity': 'control:in(event)!*|data:entity(entityRef:list)!|control:completed(event)|data:result(json)',
      'effect.runCommand': 'control:in(event)!*|control:completed(event)|data:result(json)',
      'effect.sendEntity': 'control:in(event)!*|data:entity(entityRef)!|control:completed(event)|data:result(json)',
      'effect.generateAttachment': 'control:in(event)!*|data:entity(entityRef)!|data:parameters(record)|control:completed(event)|data:result(attachmentRef)',
      'cts.construct': 'control:in(event)!*|data:type(entityRef:panel)*|data:name(string:list)!|data:state(status:panel:list)|control:completed(event)|data:result(entity:panel)',
      'cts.mutate': 'control:in(event)!*|data:entity(entityRef:panel:list)!|data:identity.name(string:list)|data:data.note(string:list)|data:specs.width(number:mm:list)|control:completed(event)|data:result(entity:panel)',
      'cts.transition': 'control:in(event)!*|data:entity(entityRef:panel:list)!|data:note(string:list)|data:state(status:panel:list)!|control:completed(event)|data:result(entity:panel)',
      'cts.remove': 'data:entity(entityRef:panel:list)!|control:completed(event)|data:result(entity:panel)',
      'cts.command': 'control:in(event)!*|control:completed(event)|data:result(json)',
      'cts.service': 'control:in(event)!*|data:kerf(number)!|control:completed(event)|data:result(number)',
      'cts.conversion': '',
      'cts.read': 'data:type(entityRef:panel)*|data:result(entity:panel)',
      'cts.field': 'data:entity(entity:panel)!|data:field(string)|data:value(number:mm)',
      'cts.compose': 'data:block(block)',
      'cts.decompose': 'data:entity(entity:panel)!|data:identity(block)|data:data(block)|data:specs(block)',
      'cts.join': 'data:primary(entity:list)!|data:secondary(entity:list)!|data:result(entity:list)',
      'control.manualTrigger': 'control:start(event)|data:payload(json)',
      'control.webhookTrigger': 'control:start(event)|data:payload(json)',
      'control.if': 'control:in(event)!*|data:condition(boolean)!|control:true(event)|control:false(event)',
      'control.switch': 'control:in(event)!*|data:value(json)!|control:default(event)',
      'control.fork': 'control:in(event)!*|control:branch1(event)|control:branch2(event)',
      'control.joinAll': 'control:branches(event)!|control:out(event)',
      'control.joinAny': 'control:branches(event)!|control:out(event)',
      'control.forEach': 'control:in(event)!*|data:items(string:tree)!|control:each(event)|data:item(string)|data:path(array)|data:index(integer)|control:done(event)',
      'control.forEachEnd': 'control:in(event)!*',
      'control.stopSuccess': 'control:in(event)!*',
      'control.stopFailure': 'control:in(event)!*'
    });
  });

  it('the catalog registers only known families', () => {
    const families = new Set(PROCESS_NODE_CATALOG.map(definition => definition.family));
    expect([...families].sort()).toEqual(['collections', 'control', 'effects', 'predicates', 'reads', 'records', 'sources', 'values']);
  });
});
