// Graph protocol v5 designer round trip (SPEC §20, slice 2): the palette
// creates cts.* records, the catalog resolves their ports through the
// operation-kind twin, producer outputs sync from species records, and a
// v4 definition loaded onto the canvas comes back as v5 — graphProtocol 5,
// species kinds, kebab type ids — without losing records through the
// canvas round trip.
import { describe, it, expect } from 'vitest';
import { PROCESS_DESIGNER_PALETTE_GROUPS, createProcessDesignerContract, syncProcessNodeProducerOutputs } from './designer.js';
import { resolveCatalogNodePorts, getProcessNodeDefinition } from './node-catalog.js';
import { definitionToCanvas, canvasToDefinition, validateRoundTrip } from './transpiler.js';
import { normalizeProcessDefinition } from './index.js';
import {
  createTypeRegistry, convertCncDomain, projectDomainFromView,
  migrateV4Definition, resolveCtsDefinition
} from '../../cts/src/index.js';
import {
  cncEntities, cncWorkflows, cncContainment, cncEntityFieldSchemas, cncDomain
} from '../../domain-cnc/src/index.js';

function projectedDomain() {
  const registry = createTypeRegistry({ id: 'designer-roundtrip' });
  for (const declaration of convertCncDomain({
    entities: cncEntities, workflows: cncWorkflows, containment: cncContainment,
    fieldSchemas: cncEntityFieldSchemas
  })) {
    registry.defineType(declaration);
  }
  return projectDomainFromView(registry, 'org-1', cncDomain);
}

describe('graph protocol v5 designer round trip', () => {
  it('the palette speaks species kinds only for entity-bound operations', () => {
    const groups = Object.fromEntries(PROCESS_DESIGNER_PALETTE_GROUPS.map(group => [group.id, group.items]));
    for (const item of groups.operations) {
      if (['statusDefinition', 'ctsType'].includes(item.type)) continue;
      expect(item.kind, item.id).toMatch(/^cts\./);
      expect(getProcessNodeDefinition(item.kind), item.kind).not.toBeNull();
    }
    const readPresets = groups.operations.filter(item => item.kind === 'cts.read').map(item => item.preset.select);
    expect(readPresets).toEqual(['current', 'byId', 'byRef', 'parent', 'children', 'related', 'query']);
  });

  it('catalog ports resolve cts records through the operation-kind twin', () => {
    const domain = projectedDomain();
    const context = record => ({
      fieldSchemas: domain.fieldSchemas[(record.type || record.entityType || '').replace(/-/g, '_')] || [],
      domain
    });
    const construct = resolveCatalogNodePorts({ kind: 'cts.construct', type: 'project', via: 'genericCreate' }, context({ type: 'project' }));
    expect(construct.outputs.some(port => port.type?.base === 'entity')).toBe(true);

    const transition = resolveCatalogNodePorts({ kind: 'cts.transition', type: 'queue' }, context({ type: 'queue' }));
    expect(transition.inputs.some(port => port.id === 'entity')).toBe(true);

    const read = resolveCatalogNodePorts({ kind: 'cts.read', select: 'parent', type: 'sheet' }, context({ type: 'sheet' }));
    expect(read.outputs).toHaveLength(1);

    // cts and v4 twins expose identical port contracts
    for (const [ctsRecord, v4Record] of [
      [{ kind: 'cts.transition', type: 'queue' }, { kind: 'effect.changeStatus', entityType: 'queue' }],
      [{ kind: 'cts.read', select: 'parent', type: 'sheet' }, { kind: 'read.parent', entityType: 'sheet' }],
      [{ kind: 'cts.field', slot: 'identity', path: 'identity.name' }, { kind: 'record.getField', block: 'identity', path: 'identity.name' }]
    ]) {
      const ctsPorts = resolveCatalogNodePorts(ctsRecord, { domain, fieldSchemas: domain.fieldSchemas.sheet || [] });
      const v4Ports = resolveCatalogNodePorts(v4Record, { domain, fieldSchemas: domain.fieldSchemas.sheet || [] });
      expect(ctsPorts, ctsRecord.kind).toEqual(v4Ports);
    }
  });

  it('producer outputs sync from species records', () => {
    const data = { producerOutputs: {} };
    const outputs = syncProcessNodeProducerOutputs(data, {
      id: 'n1',
      kind: 'cts.construct',
      type: 'project',
      outputs: [{ id: 'result', type: { base: 'entity', entityType: 'project' } }]
    });
    expect(outputs).toEqual(['n1:result']);
    expect(data.producerOutputs['n1:result']).toMatchObject({ entityType: 'project' });

    // consumer species mint no outputs
    const consumer = syncProcessNodeProducerOutputs(data, {
      id: 'n2',
      kind: 'cts.mutate',
      type: 'project',
      outputs: [{ id: 'result', type: { base: 'entity', entityType: 'project' } }]
    });
    expect(consumer).toEqual([]);
    expect(data.producerOutputs['n2:result']).toBeUndefined();
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
      statusDefinitions: {},
      valueInputs: {},
      screens: {},
      processNodes: {
        update: {
          id: 'update', kind: 'effect.updateEntity', entityType: 'cassette_design',
          blocks: ['identity'], trigger: { mode: 'manual' }, access: { level: 'write', grants: [] }
        }
      }
    };

    const { definition: migrated } = migrateV4Definition(v4, domain);
    const canvas = definitionToCanvas(migrated);
    const saved = canvasToDefinition(canvas, migrated);
    expect(saved.graphProtocol).toBe(5);
    expect(saved.processNodes.update.kind).toBe('cts.mutate');
    expect(saved.processNodes.update.type).toBe('cassette-design');
    expect(validateRoundTrip(saved).ok).toBe(true);

    // resolution brings the working shapes back for the compiler
    const { definition: resolved, diagnostics } = resolveCtsDefinition(saved, domain);
    expect(diagnostics).toEqual([]);
    expect(resolved.processNodes.update.kind).toBe('effect.updateEntity');
    expect(resolved.processNodes.update.entityType).toBe('cassette_design');
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
      statusDefinitions: {},
      valueInputs: {},
      screens: {},
      processNodes: {
        construct: { id: 'construct', kind: 'cts.construct', type: 'sheet', via: 'genericCreate', trigger: { mode: 'manual' }, access: { level: 'write', grants: [] } }
      }
    };
    const canvas = definitionToCanvas(structuredClone(v5));
    expect(canvas.nodes.some(node => node.type === 'ctsType' && node.data.typeId === 'sheet')).toBe(true);
    const saved = canvasToDefinition(canvas, structuredClone(v5));
    expect(saved.graph.nodes.some(node => node.type === 'ctsType')).toBe(true);
    expect(saved.graph.edges.some(edge => edge.role === 'type')).toBe(true);
    expect(saved.processNodes.construct.type).toBe('sheet');
    expect(validateRoundTrip(saved).ok).toBe(true);

    // normalization drops the binding wire: it is a canvas gesture, not dataflow
    const normalized = normalizeProcessDefinition(saved, domain);
    expect((normalized.graph.edges || []).some(edge => edge.role === 'type')).toBe(false);
  });

});
