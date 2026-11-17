import { describe, expect, it } from 'vitest';
import {
  CONSUMER_SPECIES_KINDS,
  EFFECT_SPECIES_KINDS,
  MAPPED_MUTATION_SPECIES_KINDS,
  PROCESS_NODE_CATALOG,
  PROCESS_NODE_FAMILIES,
  PRODUCER_ORIGIN_SPECIES_KINDS,
  getProcessNodeDefinition,
  resolveCatalogNodePorts
} from './node-catalog.js';
import { processTypesCompatible } from './types.js';
import { processSocketsCompatible } from './types.js';

describe('process v4 node catalog', () => {
  it('uses unique namespaced kinds and one declared family/level per node', () => {
    const kinds = PROCESS_NODE_CATALOG.map(node => node.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(PROCESS_NODE_CATALOG.every(node => PROCESS_NODE_FAMILIES.includes(node.family))).toBe(true);
    expect(PROCESS_NODE_CATALOG.every(node => /^[a-z]+\.[A-Za-z]+$/.test(node.kind))).toBe(true);
  });

  it('assigns a monochrome glyph to every catalog entry', () => {
    expect(PROCESS_NODE_CATALOG.every(node => /^[a-z]+(?:-[a-z]+)*$/.test(node.glyph))).toBe(true);
  });

  it('separates value logic, reads, effects, and control', () => {
    expect(getProcessNodeDefinition('value.logic')).toMatchObject({ family: 'values', level: 'data', pure: true });
    expect(getProcessNodeDefinition('cts.read')).toMatchObject({ family: 'reads', level: 'read', pure: false });
    expect(getProcessNodeDefinition('cts.mutate')).toMatchObject({ family: 'effects', level: 'effect', pure: false });
    expect(getProcessNodeDefinition('control.if')).toMatchObject({ family: 'control', level: 'control', pure: false });
  });

  it('contains the complete accepted family inventory', () => {
    expect(PROCESS_NODE_FAMILIES).toEqual([
      'sources',
      'values',
      'collections',
      'records',
      'reads',
      'effects',
      'control'
    ]);
    for (const kind of [
      'source.literalTree',
      'tree.cross',
      'record.construct',
      'cts.read',
      'cts.transition',
      'control.forEach',
      'control.stopSuccess'
    ]) {
      expect(getProcessNodeDefinition(kind), kind).not.toBeNull();
    }
  });

  it('provides an executable socket contract for every catalog node', () => {
    for (const node of PROCESS_NODE_CATALOG) {
      const ports = resolveCatalogNodePorts({
        kind: node.kind,
        typeId: 'project',
        type: { base: 'string', shape: 'item' },
        fields: ['name'],
        cases: [{ id: 'ready' }]
      }, {
        fieldSchema: { path: 'name', type: { base: 'string', shape: 'item' } },
        fieldSchemas: [{ path: 'name', type: { base: 'string', shape: 'item' } }]
      });
      expect(Array.isArray(ports.inputs), node.kind).toBe(true);
      expect(Array.isArray(ports.outputs), node.kind).toBe(true);
      expect([...ports.inputs, ...ports.outputs].every(port => port.type?.base), node.kind).toBe(true);
    }
  });

  it('preserves both element types and socket access of an explicit conversion contract', () => {
    const ports = resolveCatalogNodePorts({
      kind: 'value.required',
      sourceType: { base: 'entity', shape: 'list', nullable: true, typeId: 'sheet' },
      outputType: { base: 'entity', shape: 'list', nullable: false, typeId: 'sheet' }
    });

    expect(ports.inputs[0].type).toMatchObject({
      base: 'entity',
      nullable: true,
      typeId: 'sheet'
    });
    expect(ports.outputs[0].type).toMatchObject({
      base: 'entity',
      nullable: false,
      typeId: 'sheet'
    });
  });

  it('derives construct sockets from the construction envelope and mutate leaves from writable rows', () => {
    const context = {
      fieldSchemas: [
        { path: 'name', block: 'identity', type: { base: 'string', shape: 'item' } },
        { path: 'fields.note', block: 'fields', type: { base: 'string', shape: 'item' } },
        { path: 'states.main', block: 'states', type: { base: 'status', shape: 'item' } }
      ]
    };
    const create = resolveCatalogNodePorts({
      kind: 'cts.construct',
      typeId: 'project',
      construction: { mode: 'genericCreate', inputs: [] }
    }, context);
    const modify = resolveCatalogNodePorts({
      kind: 'cts.mutate',
      typeId: 'project'
    }, context);

    expect(create.inputs.map(input => input.id)).toEqual(['in', 'type', 'state']);
    expect(create.outputs.map(output => output.id)).toEqual(['completed', 'result']);
    expect(modify.inputs.map(input => input.id)).toEqual(['in', 'entity', 'name', 'fields.note']);
    expect(modify.inputs.find(input => input.id === 'entity')?.required).toBe(true);
    const typedCreate = resolveCatalogNodePorts({
      kind: 'cts.construct',
      typeId: 'cassette_design',
      construction: {
        mode: 'bakeCassetteDesignFromTemplate',
        inputs: [{ id: 'templateId', label: 'Cassette template', type: 'entity', typeId: 'cassette', required: true }]
      }
    }, context);
    expect(typedCreate.inputs.map(input => input.id)).toEqual([
      'in',
      'type',
      'templateId',
      'state'
    ]);
  });

  it('exposes declared row fields as construction sockets on the composer-less construct', () => {
    const context = { domain: {} };
    const rowCreate = resolveCatalogNodePorts({
      kind: 'cts.construct',
      typeId: 'widget',
      construction: {
        mode: 'genericCreate',
        inputs: [
          { id: 'name', label: 'Name', path: 'name', type: 'string', required: true, prompt: true },
          { id: 'fields.width', label: 'fields.width', path: 'fields.width', type: 'number', required: false, prompt: true },
          { id: 'fields.owner', label: 'fields.owner', path: 'fields.owner', type: 'entity', typeId: 'project', required: true, prompt: true }
        ]
      }
    }, context);
    expect(rowCreate.inputs.map(input => input.id)).toEqual([
      'in',
      'type',
      'name',
      'fields.width',
      'fields.owner',
      'state'
    ]);
    const owner = rowCreate.inputs.find(input => input.id === 'fields.owner');
    expect(owner.type).toMatchObject({ base: 'entityRef', typeId: 'project' });
    expect(owner.required).toBe(true);
    const width = rowCreate.inputs.find(input => input.id === 'fields.width');
    expect(width.type).toMatchObject({ base: 'number' });
    expect(width.required).toBe(false);
    // the species record speaks the declaration only — the persistent Type
    // pin, row fields, and status, no block sockets (the composer-less
    // construct is the construction path, SPEC §20).
    const speciesCreate = resolveCatalogNodePorts({
      kind: 'cts.construct',
      typeId: 'widget',
      slots: ['identity', 'data', 'specs'],
      construction: {
        mode: 'genericCreate',
        inputs: [
          { id: 'fields.width', label: 'fields.width', path: 'fields.width', type: 'number', required: false, prompt: true }
        ]
      }
    }, context);
    expect(speciesCreate.inputs.map(input => input.id)).toEqual(['in', 'type', 'fields.width', 'state']);
    expect(speciesCreate.inputs.some(input => input.id === 'states.main')).toBe(false);
  });

  it('exposes writable row fields as leaf sockets on a bound cts.mutate', () => {
    const context = {
      fieldSchemas: [
        { path: 'name', block: 'identity', type: { base: 'string', shape: 'item' }, writable: true },
        { path: 'fields.width', block: 'fields', type: { base: 'number', shape: 'item' }, writable: true },
        { path: 'fields.thickness', block: 'fields', type: { base: 'number', shape: 'item', unit: 'mm' }, writable: true },
        { path: 'fields.locked', block: 'fields', type: { base: 'boolean', shape: 'item' }, writable: false },
        { path: 'states.main', block: 'states', type: { base: 'status', shape: 'item' }, writable: false }
      ]
    };
    const ports = resolveCatalogNodePorts({ kind: 'cts.mutate', typeId: 'panel' }, context);
    const ids = ports.inputs.map(input => input.id);
    expect(ids[0]).toBe('in');
    expect(ids).toEqual(expect.arrayContaining(['fields.width', 'fields.thickness']));
    expect(ids).not.toContain('fields.locked');
    expect(ids).not.toContain('identity');
    expect(ids).not.toContain('data');
    expect(ids).not.toContain('states.main');
  });

  it('never renders block or status sockets on a mutate record', () => {
    const context = {
      fieldSchemas: [
        { path: 'name', block: 'identity', type: { base: 'string', shape: 'item' }, writable: true },
        { path: 'fields.width', block: 'fields', type: { base: 'number', shape: 'item' }, writable: true }
      ]
    };
    const migrated = resolveCatalogNodePorts({ kind: 'cts.mutate', typeId: 'panel', slots: ['identity'] }, context);
    expect(migrated.inputs.map(input => input.id)).toEqual(['in', 'entity', 'name', 'fields.width']);
  });

  it('splits the species binding contract: origins carry a typed pin, consumers adapt to their entity wire', () => {
    const context = { domain: {} };

    // an unbound mutate offers only its (untyped) entity input — plugging a
    // typed entity stream in adapts it; there is no Type pin to also satisfy
    const unboundConsumer = resolveCatalogNodePorts({ kind: 'cts.mutate', typeId: '' }, context);
    expect(unboundConsumer.inputs.map(input => input.id)).toEqual(['entity']);
    expect(unboundConsumer.inputs[0].required).toBe(true);
    expect(unboundConsumer.outputs).toEqual([]);
    for (const kind of ['cts.transition', 'cts.remove']) {
      const ports = resolveCatalogNodePorts({ kind, typeId: '' }, context);
      expect(ports.inputs.map(input => input.id), kind).toEqual(['entity']);
    }

    // the pin persists on origin species, typed by the binding when bound
    for (const record of [
      { kind: 'cts.construct', typeId: '', construction: { mode: 'genericCreate' } },
      { kind: 'cts.read', typeId: '' }
    ]) {
      const ports = resolveCatalogNodePorts(record, context);
      expect(ports.inputs.map(input => input.id), record.kind).toEqual(['type']);
    }
    const typedRead = resolveCatalogNodePorts({ kind: 'cts.read', select: 'all', typeId: 'queue' }, context);
    expect(typedRead.inputs[0]).toMatchObject({ id: 'type', type: { base: 'entityRef', typeId: 'queue' } });
  });

  it('derives service ports from the declared signature, not the command table', () => {
    const domain = {
      serviceContracts: {
        'nesting.solve': {
          id: 'nesting.solve',
          command: 'solveNestingValue',
          signature: {
            input: { base: 'record', fields: {
              polygons: { base: 'list', itemType: { base: 'json' } },
              sheet: { base: 'record', fields: { width: { base: 'quantity', unit: 'mm' } } },
              sheetWidth: { base: 'number', default: 1220 },
              space: { base: 'number', nullable: true, default: 3 }
            } },
            output: { base: 'json' }
          }
        }
      }
    };
    const ports = resolveCatalogNodePorts({ kind: 'cts.service', operator: 'nesting.solve' }, { domain });
    // A service is an effect species: the event contract wraps the
    // signature-derived data sockets.
    expect(ports.inputs.map(input => input.id)).toEqual(['in', 'polygons', 'sheet', 'sheetWidth', 'space']);
    expect(ports.outputs.map(output => output.id)).toEqual(['completed', 'result']);
    // A `list` signature field is the element-typed List socket (a runtime
    // collection, not a persisted array).
    expect(ports.inputs[1]).toMatchObject({ id: 'polygons', type: { base: 'json' }, access: 'list' });
    expect(ports.inputs.find(input => input.id === 'sheetWidth')).toMatchObject({ required: false, default: 1220 });
    expect(ports.inputs.find(input => input.id === 'space')).toMatchObject({ required: false, default: 3 });
    expect(ports.outputs[1]).toMatchObject({ id: 'result', type: { base: 'json' } });

    // an unknown or signature-less operator resolves no data ports;
    // compilation names the unknown operator as a diagnostic
    const unbound = resolveCatalogNodePorts({ kind: 'cts.service', operator: 'ghost' }, { domain });
    expect(unbound.inputs.map(input => input.id)).toEqual(['in']);
    expect(unbound.outputs.map(output => output.id)).toEqual(['completed']);
  });

  it('connects real table projections through typed document blocks to document export', () => {
    const domain = {
      serviceContracts: {
        'plugin.documents.document-paragraph': {
          signature: { input: { base: 'record', fields: { text: { base: 'string', nullable: true } } }, output: { base: 'json', kind: 'text.document-block' } }
        },
        'plugin.documents.document-table': {
          signature: { input: { base: 'record', fields: { rows: { base: 'list', itemType: { base: 'record' } } } }, output: { base: 'json', kind: 'text.document-block' } }
        },
        'plugin.documents.compose-document': {
          signature: { input: { base: 'record', fields: { blocks: { base: 'list', itemType: { base: 'json', kind: 'text.document-block' } } } }, output: { base: 'json', kind: 'text.flow-document' } }
        },
        'plugin.documents.export-markdown-file': {
          signature: { input: { base: 'record', fields: { document: { base: 'json', kind: 'text.flow-document' } } }, output: { base: 'json', kind: 'documents.file' } }
        }
      },
      projectionContracts: {
        'csv-table/rows': { output: { base: 'list', itemType: { base: 'record' } } }
      }
    };
    const paragraph = resolveCatalogNodePorts({ kind: 'cts.service', operator: 'plugin.documents.document-paragraph' }, { domain });
    const table = resolveCatalogNodePorts({ kind: 'cts.service', operator: 'plugin.documents.document-table' }, { domain });
    const compose = resolveCatalogNodePorts({ kind: 'cts.service', operator: 'plugin.documents.compose-document' }, { domain });
    const exportFile = resolveCatalogNodePorts({ kind: 'cts.service', operator: 'plugin.documents.export-markdown-file' }, { domain });
    const makeBlocks = resolveCatalogNodePorts({ kind: 'collection.makeList', type: { base: 'json', kind: 'text.document-block' } }, { domain });
    const rows = resolveCatalogNodePorts({ kind: 'cts.read', select: 'extract', typeId: 'csv-table', projection: 'rows' }, { domain });

    expect(paragraph.outputs.find(port => port.id === 'result').type).toEqual({ base: 'json', kind: 'text.document-block', nullable: false });
    expect(processTypesCompatible(rows.outputs[0].type, table.inputs.find(port => port.id === 'rows').type).ok).toBe(true);
    expect(processTypesCompatible(table.outputs.find(port => port.id === 'result').type, makeBlocks.inputs[0].type).ok).toBe(true);
    expect(processTypesCompatible(makeBlocks.outputs[0].type, compose.inputs.find(port => port.id === 'blocks').type).ok).toBe(true);
    expect(processTypesCompatible(compose.outputs.find(port => port.id === 'result').type, exportFile.inputs.find(port => port.id === 'document').type).ok).toBe(true);
    expect(exportFile.outputs.find(port => port.id === 'result').type).toEqual({ base: 'json', kind: 'documents.file', nullable: false });
  });

  it('exposes the unfiltered All read without a hidden predicate input', () => {
    const ports = resolveCatalogNodePorts({ kind: 'cts.read', select: 'all', typeId: 'sheet' }, { domain: {} });
    expect(ports.inputs.map(input => input.id)).toEqual(['type']);
    expect(ports.outputs.every(output => output.type?.base === 'entityRef')).toBe(true);
  });

  it('declares List consumption on every mapped mutation data socket', () => {
    const context = {
      fieldSchemas: [
        { path: 'name', block: 'identity', type: { base: 'string', shape: 'item' } }
      ]
    };
    const dataSockets = ports => ports.inputs.filter(input => input.role === 'data' && input.plane !== 'declaration');
    for (const [kind, record] of [
      ['cts.construct', { kind: 'cts.construct', typeId: 'project', construction: { mode: 'genericCreate', inputs: [{ id: 'name', type: 'string', required: true }] } }],
      ['cts.mutate', { kind: 'cts.mutate', typeId: 'project' }],
      ['cts.transition', { kind: 'cts.transition', typeId: 'project' }],
      ['cts.remove', { kind: 'cts.remove', typeId: 'project' }]
    ]) {
      const ports = resolveCatalogNodePorts(record, context);
      expect(dataSockets(ports).length, kind).toBeGreaterThan(0);
      expect(dataSockets(ports).every(input => input.access === 'list'), kind).toBe(true);
    }
    const typedCreate = resolveCatalogNodePorts({
      kind: 'cts.construct',
      typeId: 'cassette_design',
      construction: {
        mode: 'bakeCassetteDesignFromTemplate',
        inputs: [{ id: 'templateId', type: 'entity', typeId: 'cassette', required: true }]
      }
    }, context);
    expect(dataSockets(typedCreate).every(input => input.access === 'list')).toBe(true);
  });

  it('accepts item, list, and tree sources on mapped mutation sockets', () => {
    const modify = resolveCatalogNodePorts({
      kind: 'cts.mutate',
      typeId: 'project'
    }, {
      fieldSchemas: [{ path: 'name', block: 'identity', type: { base: 'string', shape: 'item' } }]
    });
    const entitySocket = modify.inputs.find(input => input.id === 'entity');
    const leafSocket = modify.inputs.find(input => input.id === 'name');
    for (const access of ['item', 'list', 'tree']) {
      const entitySource = { id: 'entities', label: 'entities', role: 'data', access, type: { base: 'entity', typeId: 'project' } };
      expect(processSocketsCompatible(entitySource, entitySocket).ok, `entity ${access}`).toBe(true);
      const leafSource = { id: 'leaf', label: 'leaf', role: 'data', access, type: { base: 'string' } };
      expect(processSocketsCompatible(leafSource, leafSocket).ok, `leaf ${access}`).toBe(true);
    }
  });

  it('uses authored stable sockets for open compose entries', () => {
    const compose = resolveCatalogNodePorts({
      kind: 'cts.compose',
      block: 'lineage',
      compositionMode: 'ancestors',
      entries: [
        { id: 'org', key: 'organizationId', typeId: 'organization' },
        { id: 'run', key: 'runId', typeId: 'nesting_run' }
      ]
    });

    expect(compose.inputs).toMatchObject([
      { id: 'entry:org', label: 'organizationId', type: { base: 'entityRef', typeId: 'organization' } },
      { id: 'entry:run', label: 'runId', type: { base: 'entityRef', typeId: 'nesting_run' } }
    ]);
    expect(compose.outputs[0]).toMatchObject({ id: 'block', type: { base: 'block', block: 'lineage' } });
  });

  it('uses an explicit intrinsic array type for a relation collection', () => {
    const compose = resolveCatalogNodePorts({
      kind: 'cts.compose',
      block: 'relations',
      compositionMode: 'relations',
      entries: [{ id: 'libraries', key: 'library', type: { base: 'array', itemType: { base: 'entityRef', typeId: 'library' } } }]
    });
    expect(compose.inputs[0]).toMatchObject({
      id: 'entry:libraries',
      type: { base: 'array', itemType: { base: 'entityRef', typeId: 'library' } }
    });
  });

  it('keeps declared producer inputs on a typed construct', () => {
    const producer = resolveCatalogNodePorts({
      kind: 'cts.construct',
      typeId: 'cassette_design',
      construction: {
        mode: 'bakeCassetteDesignFromTemplate',
        inputs: [
          { id: 'name', path: 'name', type: 'string', required: true },
          { id: 'templateId', path: 'templateId', type: 'entity', typeId: 'cassette', required: true }
        ]
      }
    });

    expect(producer.inputs.map(input => input.id)).toEqual(['in', 'type', 'name', 'templateId', 'state']);
    expect(producer.inputs.find(input => input.id === 'templateId').type).toMatchObject({ base: 'entityRef', typeId: 'cassette' });
    expect(producer.outputs.map(output => output.id)).toEqual(['completed', 'result']);
  });

  it('uses declared construction inputs inside the construct for typed creation modes', () => {
    const create = resolveCatalogNodePorts({
      kind: 'cts.construct',
      typeId: 'cassette_design',
      construction: {
        mode: 'bakeCassetteDesignFromTemplate',
        inputs: [
          { id: 'name', path: 'name', type: 'string', required: true },
          { id: 'templateId', path: 'templateId', type: 'entity', typeId: 'cassette', required: true }
        ]
      }
    });

    expect(create.inputs.map(input => input.id)).toEqual(['in', 'type', 'name', 'templateId', 'state']);
    expect(create.inputs.find(input => input.id === 'templateId').type).toMatchObject({ base: 'entityRef', typeId: 'cassette' });
  });

  it('does not require a wire when a construction input declares its own default', () => {
    const create = resolveCatalogNodePorts({
      kind: 'cts.construct',
      typeId: 'result',
      construction: {
        mode: 'buildResult',
        inputs: [{ id: 'quality', path: 'fields.quality', type: 'string', required: true, default: 'standard' }]
      }
    });

    expect(create.inputs.find(input => input.id === 'fields.quality')).toMatchObject({ id: 'fields.quality', required: false });
  });

  it('projects command sockets from the selected command contract', () => {
    const ports = resolveCatalogNodePorts({ kind: 'cts.command', commandId: 'solve' }, {
      command: {
        input: {
          entities: [{ name: 'queue', type: 'queue', required: true }],
          parameters: [
            { name: 'machineId', type: 'instanceId', typeId: 'machine', required: true },
            { name: 'materialMode', type: 'enum', options: ['VIRTUAL', 'WAREHOUSE'] }
          ]
        },
        output: {
          entities: [
            { type: 'nesting_run', persistenceOwner: 'commandOwned', timing: 'immediate' },
            { type: 'sheet', persistenceOwner: 'commandOwned', timing: 'completion' }
          ]
        }
      }
    });

    expect(ports.inputs).toMatchObject([
      { id: 'in' },
      { id: 'queue', required: true, type: { base: 'entityRef', typeId: 'queue' } },
      { id: 'machineId', required: true, type: { base: 'entityRef', typeId: 'machine' } },
      { id: 'materialMode', type: { base: 'enum' } }
    ]);
    expect(ports.outputs.map(output => output.id)).toEqual(['completed', 'nesting_run', 'sheet']);
  });

  it('changes unified logic and date sockets with the selected operation', () => {
    expect(resolveCatalogNodePorts({ kind: 'value.logic', operation: 'not' }).inputs.map(input => input.id)).toEqual(['left']);
    expect(resolveCatalogNodePorts({ kind: 'value.logic', operation: 'and', type: { base: 'boolean' } }).inputs.map(input => input.type.base))
      .toEqual(['boolean', 'boolean']);
    expect(resolveCatalogNodePorts({ kind: 'value.compare', operation: 'gte', type: { base: 'dateTime' } }).inputs.map(input => input.type.base))
      .toEqual(['dateTime', 'dateTime']);
    expect(resolveCatalogNodePorts({ kind: 'value.dateTime', operation: 'addDays' }).inputs.map(input => [input.id, input.type.base]))
      .toEqual([['date', 'dateTime'], ['amount', 'number']]);
    expect(resolveCatalogNodePorts({ kind: 'value.dateTime', operation: 'differenceDays' }).outputs[0].type.base).toBe('number');
  });

  it('changes math and text sockets with the selected operation', () => {
    expect(resolveCatalogNodePorts({ kind: 'value.math', operation: 'sqrt' }).inputs.map(port => port.id)).toEqual(['value']);
    expect(resolveCatalogNodePorts({ kind: 'value.math', operation: 'clamp' }).inputs.map(port => port.id)).toEqual(['value', 'min', 'max']);
    expect(resolveCatalogNodePorts({ kind: 'value.string', operation: 'substring' }).inputs.map(port => port.id)).toEqual(['text', 'start', 'end']);
    expect(resolveCatalogNodePorts({ kind: 'value.string', operation: 'split' }).outputs[0].access).toBe('list');
  });

  it('makes packet-list and intrinsic-array conversion explicit', () => {
    const packed = resolveCatalogNodePorts({
      kind: 'collection.packArray',
      type: { base: 'entityRef', typeId: 'queue', shape: 'list' }
    });
    expect(packed.inputs[0]).toMatchObject({ access: 'list', type: { base: 'entityRef', typeId: 'queue' } });
    expect(packed.outputs[0].type).toMatchObject({
      base: 'array',
      itemType: { base: 'entityRef', typeId: 'queue' }
    });
    const unpacked = resolveCatalogNodePorts({ kind: 'collection.unpackArray', type: packed.outputs[0].type });
    expect(unpacked.outputs[0]).toMatchObject({ access: 'list', type: { base: 'entityRef', typeId: 'queue' } });
  });

  it('keeps field and facet reads item-wise so tree topology flows at runtime', () => {
    const context = {
      fieldSchemas: [{ path: 'name', block: 'identity', type: { base: 'string', shape: 'item' } }]
    };
    expect(resolveCatalogNodePorts({
      kind: 'cts.field',
      typeId: 'project',
      path: 'name'
    }, context)).toMatchObject({
      inputs: [
        { id: 'entity', access: 'item', type: { base: 'entityRef', typeId: 'project' } },
        { id: 'field', access: 'item', type: { base: 'string' } }
      ],
      outputs: [{ id: 'value', access: 'item', type: { base: 'string' } }]
    });
    expect(resolveCatalogNodePorts({
      kind: 'cts.decompose',
      typeId: 'project'
    }, context).outputs[0]).toMatchObject({ id: 'name', access: 'item', type: { base: 'string' } });
  });

  it('exposes items plus aligned keys for Sort, Distinct, and Group By', () => {
    expect(resolveCatalogNodePorts({ kind: 'collection.sort' }).inputs.map(input => [input.id, input.required, input.access]))
      .toEqual([['items', true, 'list'], ['keys', true, 'list']]);
    expect(resolveCatalogNodePorts({ kind: 'collection.distinct' }).inputs.map(input => [input.id, input.required, input.access]))
      .toEqual([['items', true, 'list'], ['keys', false, 'list']]);
    expect(resolveCatalogNodePorts({ kind: 'collection.groupBy' }).inputs.map(input => [input.id, input.required, input.access]))
      .toEqual([['items', true, 'list'], ['keys', true, 'list']]);
    expect(resolveCatalogNodePorts({ kind: 'collection.sort' }).outputs[0].id).toBe('items');
    expect(resolveCatalogNodePorts({ kind: 'collection.itemAt' }).inputs[1]).toMatchObject({ id: 'index', required: false });
  });

  it('fixes Make List at four optional single-wire item sockets feeding one list output', () => {
    const ports = resolveCatalogNodePorts({
      kind: 'collection.makeList',
      type: { base: 'entityRef', typeId: 'queue' }
    });

    expect(ports.inputs.map(input => [input.id, input.required, input.access, Boolean(input.multiple)]))
      .toEqual([
        ['item1', false, 'item', false],
        ['item2', false, 'item', false],
        ['item3', false, 'item', false],
        ['item4', false, 'item', false]
      ]);
    expect(ports.inputs.every(input => input.type.base === 'entityRef' && input.type.typeId === 'queue')).toBe(true);
    expect(ports.outputs).toHaveLength(1);
    expect(ports.outputs[0]).toMatchObject({ id: 'value', access: 'list', type: { base: 'entityRef', typeId: 'queue' } });
  });

  it('keeps Concat as a two-list join that retains element type and list access', () => {
    const ports = resolveCatalogNodePorts({
      kind: 'collection.concat',
      type: { base: 'entityRef', typeId: 'queue' }
    });

    expect(ports.inputs.map(input => [input.id, input.required, input.access]))
      .toEqual([['left', true, 'list'], ['right', true, 'list']]);
    expect(ports.inputs.every(input => input.type.base === 'entityRef' && input.type.typeId === 'queue')).toBe(true);
    expect(ports.outputs[0]).toMatchObject({ id: 'value', access: 'list', type: { base: 'entityRef', typeId: 'queue' } });
  });
});

describe('species kind-membership sets', () => {
  // The exported classifiers are the membership contract the designer UI
  // and the compiler share: they must be Sets (`.has`), pinned by exact
  // membership. A frozen array here once shipped as far as a browser
  // TypeError because no suite exercised the UI consumers.
  it('exports Set instances with the exact species membership', () => {
    expect([...PRODUCER_ORIGIN_SPECIES_KINDS].sort()).toEqual([
      'cts.command', 'cts.construct', 'cts.conversion', 'cts.service'
    ]);
    expect([...CONSUMER_SPECIES_KINDS].sort()).toEqual([
      'cts.mutate', 'cts.remove', 'cts.transition'
    ]);
    expect([...MAPPED_MUTATION_SPECIES_KINDS].sort()).toEqual([
      'cts.construct', 'cts.mutate', 'cts.remove', 'cts.transition'
    ]);
    for (const set of [
      PRODUCER_ORIGIN_SPECIES_KINDS, CONSUMER_SPECIES_KINDS,
      EFFECT_SPECIES_KINDS, MAPPED_MUTATION_SPECIES_KINDS
    ]) {
      expect(set).toBeInstanceOf(Set);
      expect(typeof set.has).toBe('function');
    }
    for (const kind of [...PRODUCER_ORIGIN_SPECIES_KINDS, ...CONSUMER_SPECIES_KINDS]) {
      expect(EFFECT_SPECIES_KINDS.has(kind)).toBe(true);
    }
    expect(EFFECT_SPECIES_KINDS.has('value.math')).toBe(false);
  });
});
