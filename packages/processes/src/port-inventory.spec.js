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
      { path: 'name', block: 'identity', type: { base: 'string', shape: 'item' }, writable: true },
      { path: 'fields.note', block: 'fields', type: { base: 'string', shape: 'item' }, writable: true },
      { path: 'fields.width', block: 'fields', type: { base: 'number', shape: 'item', unit: 'mm' }, writable: true }
    ]
  },
  construction: {
    panel: { modes: ['genericCreate'], defaultMode: 'genericCreate', inputs: [{ id: 'fields.note', path: 'fields.note', type: 'string', required: true }] }
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
  'value.logic': { operation: 'and', type: { base: 'boolean' } },
  'value.select': { type: { base: 'string' } },
  'value.dateTime': { operation: 'addDays', type: { base: 'dateTime' } },
  'collection.filter': { type: { base: 'string' } },
  'tree.branch': { type: { base: 'string' } },
  'cts.construct': { typeId: 'panel', construction: { mode: 'genericCreate' } },
  'cts.mutate': { typeId: 'panel' },
  'cts.transition': { typeId: 'panel' },
  'cts.remove': { typeId: 'panel' },
  'cts.command': { commandId: 'solveNestingValue', typeId: 'panel' },
  'cts.service': { operator: 'nesting.solve' },
  'cts.read': { typeId: 'panel', select: 'current' },
  'cts.field': { typeId: 'panel', path: 'fields.width' },
  'cts.compose': { typeId: 'panel', slot: 'data' },
  'cts.decompose': { typeId: 'panel' },
  'control.if': {},
  'control.forEach': { type: { base: 'string' } }
};

function contextFor() {
  return {
    domain,
    fieldSchemas: domain.fieldSchemas.panel,
    fieldSchema: domain.fieldSchemas.panel.find(field => field.path === 'fields.width')
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
      "collection.concat": "data:left(json:list)!|data:right(json:list)!|data:value(json:list)",
      "collection.count": "data:value(json:list)!|data:value(integer)",
      "collection.dispatch": "data:items(json:list)!|data:mask(boolean:list)!|data:true(json:list)|data:false(json:list)",
      "collection.distinct": "data:items(json:list)!|data:keys(json:list)|data:items(json:list)",
      "collection.filter": "data:items(string:list)!|data:mask(boolean:list)!|data:items(string:list)",
      "collection.groupBy": "data:items(json:list)!|data:keys(json:list)!|data:groups(json:tree)|data:keys(json:tree)",
      "collection.itemAt": "data:items(json:list)!|data:index(integer)|data:item(json)",
      "collection.join": "data:left(json:list)!|data:right(json:list)!|data:pairs(record:list)",
      "collection.makeList": "data:item1(json)|data:item2(json)|data:item3(json)|data:item4(json)|data:value(json:list)",
      "collection.packArray": "data:value(json:list)!|data:value(array)",
      "collection.partition": "data:items(json:list)!|data:size(integer)!|data:items(json:tree)",
      "collection.reduce": "data:items(number:list)!|data:value(number)",
      "collection.reverse": "data:value(json:list)!|data:value(json:list)",
      "collection.shift": "data:items(json:list)!|data:offset(integer)!|data:items(json:list)",
      "collection.slice": "data:items(json:list)!|data:start(integer)|data:end(integer)|data:items(json:list)",
      "collection.sort": "data:items(json:list)!|data:keys(json:list)!|data:items(json:list)",
      "collection.unpackArray": "data:value(array)!|data:value(json:list)",
      "control.forEach": "control:in(event)!*|data:items(string:tree)!|control:each(event)|data:item(string)|data:path(array)|data:index(integer)|control:done(event)",
      "control.forEachEnd": "control:in(event)!*",
      "control.fork": "control:in(event)!*|control:branch1(event)|control:branch2(event)",
      "control.if": "control:in(event)!*|data:condition(boolean)!|control:true(event)|control:false(event)",
      "control.joinAll": "control:branches(event)!*|control:out(event)",
      "control.joinAny": "control:branches(event)!*|control:out(event)",
      "control.stopFailure": "control:in(event)!*",
      "control.stopSuccess": "control:in(event)!*",
      "control.switch": "control:in(event)!*|data:value(json)!|control:default(event)",
      "control.waitUntil": "control:in(event)!*|data:until(dateTime)!|control:completed(event)",
      "cts.command": "control:in(event)!*|control:completed(event)|data:result(json)",
      "cts.compose": "data:block(block)",
      "cts.emit": "control:in(event)!*|data:type(string)!|data:payload(json)|control:completed(event)",
      "cts.construct": "control:in(event)!*|data:type(entityRef:panel)*|data:fields.note(string:list)!|data:state(status:panel:list)|control:completed(event)|data:result(entityRef:panel)",
      "cts.conversion": "",
      "cts.decompose": "data:entity(entityRef:panel)!|data:name(string)|data:fields.note(string)|data:fields.width(number:mm)",
      "cts.field": "data:entity(entityRef:panel)!|data:field(string)|data:value(number:mm)",
      "cts.mutate": "control:in(event)!*|data:entity(entityRef:panel:list)!|data:name(string:list)|data:fields.note(string:list)|data:fields.width(number:mm:list)|control:completed(event)|data:result(entityRef:panel)",
      "cts.read": "data:type(entityRef:panel)*|data:result(entityRef:panel)",
      "cts.remove": "data:entity(entityRef:panel:list)!|control:completed(event)|data:result(entityRef:panel)",
      "cts.service": "control:in(event)!*|data:kerf(number)!|control:completed(event)|data:result(number)",
      "cts.transition": "control:in(event)!*|data:entity(entityRef:panel:list)!|data:note(string:list)|data:state(status:panel:list)!|data:actors(entityRef:user:list)|control:completed(event)|data:result(entityRef:panel)",
      "record.construct": "data:record(record)",
      "record.merge": "data:left(record)!|data:right(record)!|data:record(record)",
      "source.currentTime": "data:value(dateTime)",
      "source.currentUser": "data:value(entityRef:user)",
      "source.currentOrganization": "data:value(entityRef:organization)",
      "source.literalItem": "data:value(string)",
      "source.literalList": "data:value(string:list)",
      "source.literalTree": "data:value(json:tree)",
      "source.processInput": "data:value(json)",
      "source.secretRef": "data:value(opaque)",
      "source.triggerPayload": "data:value(json)",
      "tree.branch": "data:tree(string:tree)!|data:path(integer:list)!|data:items(string:list)",
      "tree.clean": "data:value(json:tree)!|data:value(json:tree)",
      "tree.cross": "data:left(json)!|data:right(json)!|data:value(json)",
      "tree.flatten": "data:value(json:tree)!|data:value(json:tree)",
      "tree.graft": "data:value(json:tree)!|data:value(json:tree)",
      "tree.simplify": "data:value(json:tree)!|data:value(json:tree)",
      "tree.stats": "data:value(json:tree)!|data:stats(record)",
      "tree.transpose": "data:value(json:tree)!|data:value(json:tree)",
      "tree.unzip": "data:value(json)!|data:value(json)",
      "tree.zip": "data:left(json)!|data:right(json)!|data:value(json)",
      "value.cast": "data:value(json)!|data:value(record)",
      "value.coalesce": "data:value(json)!|data:fallback(json)!|data:value(json)",
      "value.compare": "data:left(json)!|data:right(json)!|data:result(boolean)",
      "value.convertUnit": "data:value(json)!|data:value(json)",
      "value.dateTime": "data:date(dateTime)!|data:amount(number)!|data:value(dateTime)",
          "value.format": "data:value(json)|data:record(record:list)|data:value(json)",
      "value.logic": "data:left(boolean)!|data:right(boolean)!|data:result(boolean)",
      "value.math": "data:left(number)!|data:right(number)!|data:value(number)",
          "value.recordField": "data:value(record:list)!|data:key(string)|data:value(json:list)",
      "value.required": "data:value(json)!|data:value(json)",
      "value.select": "data:condition(boolean)!|data:left(string)!|data:right(string)!|data:value(string)",
      "value.string": "data:left(string)!|data:right(string)!|data:value(string)",
              "value.validate": "data:value(json)!|data:value(json)",
    });
  });

  it('the catalog registers only known families', () => {
    const families = new Set(PROCESS_NODE_CATALOG.map(definition => definition.family));
    expect([...families].sort()).toEqual(['collections', 'control', 'effects', 'reads', 'records', 'sources', 'values']);
  });
});
