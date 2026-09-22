// Graph protocol v5 designer round trip (SPEC §20, slice 2): the palette
// creates cts.* records, the catalog resolves their ports through the
// operation-kind twin, producer outputs sync from species records, and a
// v4 definition loaded onto the canvas comes back as v5 — graphProtocol 5,
// species kinds, kebab type ids — without losing records through the
// canvas round trip.
import { describe, it, expect } from 'vitest';
import { PROCESS_DESIGNER_PALETTE_GROUPS, createProcessDesignerContract, syncProcessNodeProducerOutputs, migrateProcessDefinition } from './designer.js';
import { resolveCatalogNodePorts, getProcessNodeDefinition } from './node-catalog.js';
import { definitionToCanvas, canvasToDefinition, validateRoundTrip } from './transpiler.js';
import { servicesPaletteGroups } from './designer.js';
import {
  createTypeRegistry, projectDomainFromView,
  migrateV4Definition, resolveCtsDefinition
} from '../../cts/src/index.js';
import { cncTypePack } from '../../cts/src/pack/cnc.js';
import { frameworkTypes } from '../../cts/src/pack/framework.js';
import { normalizeProcessDefinition } from './index.js';

function projectedDomain() {
  const registry = createTypeRegistry({ id: 'designer-roundtrip' });
  for (const declaration of [...frameworkTypes, ...cncTypePack]) {
    registry.defineType(declaration);
  }
  return projectDomainFromView(registry, 'org-1');
}

describe('graph protocol v5 designer round trip', () => {
  it('the palette speaks species kinds only for entity-bound operations', () => {
    const groups = Object.fromEntries(PROCESS_DESIGNER_PALETTE_GROUPS.map(group => [group.id, group.items]));
    for (const item of [...groups.operations, ...groups.instances]) {
      expect(item.kind, item.id).toMatch(/^cts\./);
      expect(getProcessNodeDefinition(item.kind), item.kind).not.toBeNull();
    }
    const readPresets = groups.instances.filter(item => item.kind === 'cts.read').map(item => item.preset.select);
    expect(readPresets).toEqual(['current', 'byId', 'byRef', 'parent', 'children', 'related', 'query']);
  });

  it('catalog ports resolve cts records through the operation-kind twin', () => {
    const domain = projectedDomain();
    const context = record => ({
      fieldSchemas: domain.fieldSchemas[record.typeId || record.typeId] || [],
      domain
    });
    const construct = resolveCatalogNodePorts({ kind: 'cts.construct', typeId: 'project', via: 'genericCreate' }, context({ type: 'project' }));
    expect(construct.outputs.some(port => port.type?.base === 'entity')).toBe(true);

    const transition = resolveCatalogNodePorts({ kind: 'cts.transition', typeId: 'queue' }, context({ type: 'queue' }));
    expect(transition.inputs.some(port => port.id === 'entity')).toBe(true);

    const read = resolveCatalogNodePorts({ kind: 'cts.read', select: 'parent', typeId: 'sheet' }, context({ type: 'sheet' }));
    expect(read.outputs).toHaveLength(1);

    // cts and v4 twins expose identical port contracts — except where the
    // species deliberately upgrades the authoring contract: the origin
    // species' persistent Type pin, and cts.field's entity projection
    // (SPEC §8 p: entity in, value out — no intermediate block node).
    for (const [ctsRecord, v4Record] of [
      [{ kind: 'cts.transition', typeId: 'queue' }, { kind: 'effect.changeStatus', typeId: 'queue' }],
      [{ kind: 'cts.read', select: 'parent', typeId: 'sheet' }, { kind: 'read.parent', typeId: 'sheet' }]
    ]) {
      const ctsPorts = resolveCatalogNodePorts(ctsRecord, { domain, fieldSchemas: domain.fieldSchemas.sheet || [] });
      const v4Ports = resolveCatalogNodePorts(v4Record, { domain, fieldSchemas: domain.fieldSchemas.sheet || [] });
      const stripSpeciesSurface = (ports, renameEntitySocket) => ({
        ...ports,
        inputs: ports.inputs
          .filter(port => port.id !== 'type')
          // entity-derived reads present `entity` (the consumer convention);
          // the v4 twin's generic `value` is the same socket
          .map(port => (renameEntitySocket && port.id === 'entity' ? { ...port, id: 'value', label: 'value' } : port))
      });
      expect(stripSpeciesSurface(ctsPorts, ctsRecord.kind === 'cts.read'), ctsRecord.kind).toEqual(v4Ports);
    }
    const fieldProjection = resolveCatalogNodePorts(
      { kind: 'cts.field', typeId: 'sheet', path: 'data.source' },
      { domain, fieldSchemas: domain.fieldSchemas.sheet || [] }
    );
    expect(fieldProjection.inputs).toHaveLength(1);
    expect(fieldProjection.inputs[0]).toMatchObject({ id: 'entity', type: { base: 'entity', typeId: 'sheet' } });
    expect(fieldProjection.outputs[0]).toMatchObject({ id: 'value', type: { base: 'json' } });
  });

  it('producer outputs sync from species records', () => {
    const data = { producerOutputs: {} };
    const outputs = syncProcessNodeProducerOutputs(data, {
      id: 'n1',
      kind: 'cts.construct',
      type: 'project',
      outputs: [{ id: 'result', type: { base: 'entity', typeId: 'project' } }]
    });
    expect(outputs).toEqual(['n1:result']);
    expect(data.producerOutputs['n1:result']).toMatchObject({ typeId: 'project' });

    // consumer species mint no outputs
    const consumer = syncProcessNodeProducerOutputs(data, {
      id: 'n2',
      kind: 'cts.mutate',
      type: 'project',
      outputs: [{ id: 'result', type: { base: 'entity', typeId: 'project' } }]
    });
    expect(consumer).toEqual([]);
    expect(data.producerOutputs['n2:result']).toBeUndefined();
  });

  it('definitions persisted under the legacy entityType vocabulary load and compile as typeId', () => {
    const domain = projectedDomain();
    const legacy = {
      schemaVersion: 1,
      dataflowVersion: 4,
      graph: { nodes: [{ id: 'update', type: 'processNode', data: { refId: 'update' } }], edges: [] },
      roleGrants: {},
      producerOutputs: {},
      actions: {},
      services: {},
      sockets: {},
      stateDefinitions: {},
      valueInputs: {},
      screens: { list: { id: 'list', label: 'List', template: 'entityList', roleIds: [], sources: [{ id: 'sheet', entityType: 'sheet', mode: 'list', filters: {} }], regions: [{ id: 'main', slot: 'main', sourceId: 'sheet', surface: 'card', actions: [] }] } },
      processNodes: {
        update: {
          id: 'update', kind: 'effect.updateEntity', entityType: 'cut_plan',
          blocks: ['identity'], trigger: { mode: 'manual' }, access: { level: 'write', grants: [] }
        }
      }
    };

    const { definition: migrated } = migrateProcessDefinition(legacy, domain);
    expect(migrated.processNodes.update.kind).toBe('cts.mutate');
    expect(migrated.processNodes.update.typeId).toBe('cut-plan');
    expect(migrated.screens.list.template).toBe('typeList');
    expect(migrated.screens.list.sources[0].typeId).toBe('sheet');
  });

  it('a v4 definition loads onto the canvas and round-trips as v5', () => {
    const domain = projectedDomain();
    const v4 = {
      schemaVersion: 1,
      dataflowVersion: 4,
      graph: {
        nodes: [{ id: 'update', type: 'processNode', data: { refId: 'update' } }],
        edges: []
      },
      roleGrants: {},
      producerOutputs: {},
      actions: {},
      services: {},
      sockets: {},
      stateDefinitions: {},
      valueInputs: {},
      screens: {},
      processNodes: {
        update: {
          id: 'update', kind: 'effect.updateEntity', typeId: 'cut_plan',
          blocks: ['identity'], trigger: { mode: 'manual' }, access: { level: 'write', grants: [] }
        }
      }
    };

    const { definition: migrated } = migrateV4Definition(v4, domain);
    const canvas = definitionToCanvas(migrated);
    const saved = canvasToDefinition(canvas, migrated);
    expect(saved.graphProtocol).toBe(5);
    expect(saved.processNodes.update.kind).toBe('cts.mutate');
    expect(saved.processNodes.update.typeId).toBe('cut-plan');
    expect(validateRoundTrip(saved).ok).toBe(true);

    // resolution brings the working shapes back for the compiler
    const { definition: resolved, diagnostics } = resolveCtsDefinition(saved, domain);
    expect(diagnostics).toEqual([]);
    expect(resolved.processNodes.update.kind).toBe('effect.updateEntity');
    expect(resolved.processNodes.update.typeId).toBe('cut-plan');
  });
  it('type reference nodes persist through the canvas and their wires never reach validation', () => {
    const domain = projectedDomain();
    const v5 = {
      schemaVersion: 1,
      dataflowVersion: 4,
      graphProtocol: 5,
      graph: {
        nodes: [
          { id: 'typeNode', type: 'ctsType', position: { x: 0, y: 0 }, data: { typeId: 'sheet' } },
          { id: 'construct', type: 'processNode', data: { refId: 'construct' } }
        ],
        edges: [
          { id: 'bind', source: 'typeNode', target: 'construct', role: 'type' }
        ]
      },
      roleGrants: {},
      producerOutputs: {},
      actions: {},
      services: {},
      sockets: {},
      stateDefinitions: {},
      valueInputs: {},
      screens: {},
      processNodes: {
        construct: { id: 'construct', kind: 'cts.construct', typeId: 'sheet', via: 'genericCreate', trigger: { mode: 'manual' }, access: { level: 'write', grants: [] } }
      }
    };
    const canvas = definitionToCanvas(structuredClone(v5));
    expect(canvas.nodes.some(node => node.type === 'ctsType' && node.data.typeId === 'sheet')).toBe(true);
    const saved = canvasToDefinition(canvas, structuredClone(v5));
    expect(saved.graph.nodes.some(node => node.type === 'ctsType')).toBe(true);
    expect(saved.graph.edges.some(edge => edge.role === 'type')).toBe(true);
    expect(saved.processNodes.construct.typeId).toBe('sheet');
    expect(validateRoundTrip(saved).ok).toBe(true);

    // normalization drops the binding wire: it is a canvas gesture, not dataflow
    const normalized = normalizeProcessDefinition(saved, domain);
    expect((normalized.graph.edges || []).some(edge => edge.role === 'type')).toBe(false);
  });

  it('registered services appear as palette operators and resolve to their commands', () => {
    const groups = servicesPaletteGroups({
      'nesting.solve': { id: 'nesting.solve', command: 'solveNestingValue', render: { label: 'Nesting solver', icon: 'pi pi-compass' } },
      'no-command': { id: 'no-command', render: { label: 'Incomplete' } }
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe('services');
    const [item] = groups[0].items;
    expect(item.kind).toBe('cts.service');
    expect(item.preset).toEqual({ operator: 'nesting.solve' });

    const domain = projectedDomain();
    const { definition: resolved, diagnostics } = resolveCtsDefinition({
      processNodes: {
        solve: { id: 'solve', kind: 'cts.service', operator: 'nesting.solve', trigger: { mode: 'manual' } },
        ghost: { id: 'ghost', kind: 'cts.service', operator: 'algebra.solve', trigger: { mode: 'manual' } }
      }
    }, { ...domain, serviceContracts: { 'nesting.solve': { command: 'solveNestingValue' } } });
    expect(resolved.processNodes.solve).toMatchObject({ kind: 'effect.runCommand', commandId: 'solveNestingValue' });
    expect(diagnostics).toContainEqual(expect.stringMatching(/unknown service operator algebra.solve/));
  });


  it('declaration nodes and wires persist with the draft through the canvas round trip', () => {
    const canvas = {
      nodes: [
        { id: 'c1', type: 'ctsClass', position: { x: 0, y: 0 }, data: { refId: 'c1', typeId: 'panel', class: 'item', payload: null, operators: [] } },
        { id: 'f1', type: 'ctsField', position: { x: 260, y: 0 }, data: { refId: 'f1', typeId: 'panel', name: 'width', descriptor: { base: 'quantity', unit: 'mm' } } },
        { id: 's1', type: 'ctsState', position: { x: 260, y: 120 }, data: { refId: 's1', typeId: 'panel', value: 'raw', initial: true, terminal: false } }
      ],
      edges: [
        { id: 'declares:f1-c1', source: 'f1', target: 'c1', role: 'type', label: 'field' },
        { id: 'declares:s1-c1', source: 's1', target: 'c1', role: 'type', label: 'state' }
      ]
    };
    const definition = canvasToDefinition(canvas, normalizeProcessDefinition({ dataflowVersion: 4 }));
    expect(Object.keys(definition.ctsTypes).sort()).toEqual(['c1', 'f1', 's1']);
    expect(definition.ctsTypes.f1).toMatchObject({ kind: 'field', typeId: 'panel', name: 'width' });
    expect(definition.graph.nodes.map(node => node.type).sort()).toEqual(['ctsClass', 'ctsField', 'ctsState']);
    // declaration wires persist as graph gestures; the compiler drops
    // role:'type' edges at normalization (SPEC §20)
    expect(definition.graph.edges.filter(edge => edge.role === 'type')).toHaveLength(2);

    const reloaded = definitionToCanvas(definition);
    expect(reloaded.nodes.map(node => node.type).sort()).toEqual(['ctsClass', 'ctsField', 'ctsState']);
    expect(reloaded.edges.filter(edge => edge.role === 'type')).toHaveLength(2);
    const roundTrip = canvasToDefinition(reloaded, definition);
    expect(Object.keys(roundTrip.ctsTypes).sort()).toEqual(['c1', 'f1', 's1']);
  });
});
