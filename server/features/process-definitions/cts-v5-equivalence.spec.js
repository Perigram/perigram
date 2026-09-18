// Graph protocol v5 equivalence gate (SPEC §20): for realistic process
// definitions, compile(v4) and compile(resolve(migrate(v4))) must produce
// the same contract. Migration is the one-way persisted rewrite; resolution
// lowers v5 records to the executable working shapes through the projected
// domain. Fixtures are the shapes the acceptance suite already compiles.
import { describe, it, expect } from 'vitest';
import {
  createTypeRegistry, convertCncDomain, projectDomainFromView,
  migrateV4Definition, resolveCtsDefinition, checkCtsGraphBindings
} from '../../../packages/cts/src/index.js';
import { compileProcessDefinition, PROCESS_DATAFLOW_VERSION } from '../../../packages/processes/src/index.js';
import { normalizeWorkflow } from '../../../packages/workflows/src/index.js';
import {
  cncEntities, cncWorkflows, cncContainment, cncEntityFieldSchemas, cncDomain
} from '../../../packages/domain-cnc/src/index.js';

function registry() {
  const view = createTypeRegistry({ id: 'v5-equivalence' });
  for (const declaration of convertCncDomain({
    entities: cncEntities, workflows: cncWorkflows, containment: cncContainment,
    fieldSchemas: cncEntityFieldSchemas
  })) {
    view.defineType(declaration);
  }
  return view;
}

const projectedDomain = () => projectDomainFromView(registry(), 'org-1', cncDomain);

const roles = {
  role_admin: { id: 'role_admin', label: 'Admin' },
  role_worker: { id: 'role_worker', label: 'Worker' }
};

// read -> modify block -> update entity, with a machine producer output
// (from the server acceptance suite's read-modify-write shape).
function readModifyWriteDefinition() {
  return {
    schemaVersion: 1,
    dataflowVersion: PROCESS_DATAFLOW_VERSION,
    graph: {
      nodes: ['deconstruct', 'names', 'refs', 'modify', 'update'].map(id => ({
        id, type: 'processNode', position: { x: 0, y: 0 }, data: { refId: id }
      })),
      edges: [
        { id: 'deconstruct-modify', source: 'deconstruct', sourceHandle: 'data:identity', target: 'modify', targetHandle: 'data:block', role: 'data' },
        { id: 'names-modify', source: 'names', sourceHandle: 'data:value', target: 'modify', targetHandle: 'data:identity.name', role: 'data' },
        { id: 'refs-modify', source: 'refs', sourceHandle: 'data:value', target: 'modify', targetHandle: 'data:identity.reference', role: 'data' },
        { id: 'modify-update', source: 'modify', sourceHandle: 'data:block', target: 'update', targetHandle: 'data:identity', role: 'data' }
      ]
    },
    roleGrants: {},
    producerOutputs: {
      'machine_context:entity': {
        id: 'machine_context:entity', producerOutputId: 'machine_context:entity', nodeId: 'machine_context', outputSocketId: 'entity',
        entityType: 'machine', lifecycle: { mode: 'domainDefault' }, fields: { read: ['identity.*'], write: ['identity.*'], private: [] }
      }
    },
    actions: {},
    services: {},
    sockets: {},
    screens: {},
    processNodes: {
      deconstruct: { id: 'deconstruct', kind: 'record.deconstruct', entityType: 'machine', blocks: ['identity'] },
      names: { id: 'names', kind: 'source.literalList', access: 'list', value: ['Renamed machine'] },
      refs: { id: 'refs', kind: 'source.literalTree', access: 'tree', value: { branches: [{ path: [], items: [{ code: 'M-01', location: 'Hall A' }] }] } },
      modify: { id: 'modify', kind: 'record.modifyBlock', block: 'identity', fields: ['identity.name', 'identity.reference'] },
      update: {
        id: 'update', kind: 'effect.updateEntity', entityType: 'machine',
        producerOutputId: 'machine_context:entity', label: 'Update machine',
        trigger: { mode: 'manual' }, access: { level: 'write', grants: [] }, blocks: ['identity']
      }
    }
  };
}

// generic create over an open relations block with typed entries
// (the acceptance suite's relation effect shape).
function relationCreateDefinition() {
  return {
    schemaVersion: 1,
    dataflowVersion: PROCESS_DATAFLOW_VERSION,
    graph: {
      nodes: ['relations', 'effect'].map(id => ({ id, type: 'processNode', data: { refId: id } })),
      edges: [{ id: 'relations-effect', source: 'relations', sourceHandle: 'data:block', target: 'effect', targetHandle: 'data:relations', role: 'data' }]
    },
    roleGrants: {},
    producerOutputs: {
      'facade_context:entity': {
        id: 'facade_context:entity', producerOutputId: 'facade_context:entity', nodeId: 'facade_context', outputSocketId: 'entity',
        entityType: 'facade', lifecycle: { mode: 'domainDefault' }, fields: { read: [], write: ['relations.*'], private: [] }
      }
    },
    actions: {},
    services: {},
    sockets: {},
    screens: {},
    processNodes: {
      relations: {
        id: 'relations', kind: 'record.composeBlock', block: 'relations', compositionMode: 'relations',
        entries: [{ id: 'sourceLibrary', key: 'sourceLibrary', entityType: 'library', type: { base: 'entityRef', entityType: 'library' } }]
      },
      effect: {
        id: 'effect', kind: 'effect.createEntity', entityType: 'facade',
        blocks: ['relations'], construction: { mode: 'genericCreate' },
        trigger: { mode: 'manual' }, access: { level: 'write', grants: [] }
      }
    }
  };
}

function fieldReadDefinition() {
  return {
    schemaVersion: 1,
    dataflowVersion: PROCESS_DATAFLOW_VERSION,
    graph: {
      nodes: ['entity', 'present', 'absent'].map(id => ({ id, type: 'processNode', data: { refId: id } })),
      edges: [
        { id: 'entity-present', source: 'entity', sourceHandle: 'data:value', target: 'present', targetHandle: 'data:block', role: 'data' },
        { id: 'entity-absent', source: 'entity', sourceHandle: 'data:value', target: 'absent', targetHandle: 'data:block', role: 'data' }
      ]
    },
    roleGrants: {},
    producerOutputs: {},
    actions: {},
    services: {},
    sockets: {},
    screens: {},
    processNodes: {
      entity: { id: 'entity', kind: 'source.literalItem', value: { name: null } },
      present: { id: 'present', kind: 'record.getField', block: 'identity', path: 'identity.name' },
      absent: { id: 'absent', kind: 'record.getField', block: 'identity', path: 'identity.reference' }
    }
  };
}

const fixtures = {
  'read/modify/update with producer output': readModifyWriteDefinition,
  'construct over relations entries': relationCreateDefinition,
  'field reads': fieldReadDefinition
};

// Equivalence is outcome equivalence: whether the compiler accepts the
// definition (deep-equal contracts) or rejects it (identical diagnostics),
// the migrated-and-resolved graph behaves exactly like the original.
function compileOutcome(definition, domain) {
  try {
    const compiled = compileProcessDefinition(structuredClone(definition), domain, { roles });
    return { ok: true, compiled };
  } catch (error) {
    return { ok: false, message: error?.message || String(error) };
  }
}

describe('graph protocol v5 (SPEC §20)', () => {
  for (const [name, build] of Object.entries(fixtures)) {
    it(`migrates and compiles equivalently: ${name}`, () => {
      const domain = projectedDomain();
      const original = build();

      const direct = compileOutcome(original, domain);

      const { definition: migrated } = migrateV4Definition(structuredClone(original), domain);
      expect(migrated.graphProtocol).toBe(5);
      expect(checkCtsGraphBindings(migrated, domain)).toEqual([]);

      const { definition: resolved, diagnostics } = resolveCtsDefinition(structuredClone(migrated), domain);
      expect(diagnostics).toEqual([]);
      const throughProtocol = compileOutcome(resolved, domain);

      expect(throughProtocol.ok).toBe(direct.ok);
      if (direct.ok) {
        expect(throughProtocol.compiled).toEqual(direct.compiled);
      } else {
        expect(throughProtocol.message).toBe(direct.message);
      }
    });
  }

  it('migrated records speak the type system vocabulary', () => {
    const migrated = migrateV4Definition(readModifyWriteDefinition(), projectedDomain()).definition;
    const update = migrated.processNodes.update;
    expect(update.kind).toBe('cts.mutate');
    expect(update.type).toBe('machine');
    expect(update.slots).toEqual(['identity']);
    const deconstruct = migrated.processNodes.deconstruct;
    expect(deconstruct.kind).toBe('cts.decompose');
    const modify = migrated.processNodes.modify;
    expect(modify.kind).toBe('cts.compose');
    expect(modify.mode).toBe('modify');
    const output = migrated.producerOutputs['machine_context:entity'];
    expect(output.type).toBe('machine');

    const created = migrateV4Definition(relationCreateDefinition(), projectedDomain()).definition;
    expect(created.processNodes.effect.kind).toBe('cts.construct');
    expect(created.processNodes.effect.via).toBe('genericCreate');
    expect(created.processNodes.relations.entries[0].target).toBe('library');
    expect(created.processNodes.relations.entries[0].type).toEqual({ base: 'entityRef', entityType: 'library' });

    const fields = migrateV4Definition(fieldReadDefinition(), projectedDomain()).definition.processNodes.present;
    expect(fields.kind).toBe('cts.field');
    expect(fields.path).toBe('identity.name'); // managed slot keeps its qualified name
  });

  it('row paths strip and restore through data/specs slots', () => {
    const domain = projectedDomain();
    const definition = readModifyWriteDefinition();
    definition.producerOutputs['machine_context:entity'].fields = {
      read: ['identity.*', 'specs.width', 'data.job.items', 'data.value'],
      write: ['identity.*', 'specs.width'],
      private: []
    };
    const { definition: migrated } = migrateV4Definition(definition, domain);
    const output = migrated.producerOutputs['machine_context:entity'];
    // machine has no specs/job rows — unknown slot paths stay managed
    expect(output.fields.read).toEqual(['identity.*', 'specs.width', 'data.job.items', 'data.value']);
    // a type with real rows strips and restores byte-identically
    const queueOutput = {
      id: 'q:entity', producerOutputId: 'q:entity', nodeId: 'q', outputSocketId: 'entity',
      type: 'queue', lifecycle: { mode: 'domainDefault' },
      fields: { read: ['identity.*', 'job.items', 'queueNumber', 'data.value'], write: ['job.items'], private: [] }
    };
    const resolved = resolveCtsDefinition(
      { graphProtocol: 5, processNodes: {}, producerOutputs: { 'q:entity': queueOutput } },
      domain
    ).definition;
    expect(resolved.producerOutputs['q:entity'].entityType).toBe('queue');
    expect(resolved.producerOutputs['q:entity'].fields.read).toEqual(['identity.*', 'data.job.items', 'data.queueNumber', 'data.value']);
  });

  it('kebab/snake round trips through kebab-only type ids', () => {
    const domain = projectedDomain();
    const original = relationCreateDefinition();
    original.processNodes.effect.entityType = 'cassette_design';
    original.producerOutputs['facade_context:entity'].entityType = 'cassette_design';
    const { definition: migrated } = migrateV4Definition(original, domain);
    expect(migrated.processNodes.effect.type).toBe('cassette-design');
    expect(migrated.producerOutputs['facade_context:entity'].type).toBe('cassette-design');
    const { definition: resolved } = resolveCtsDefinition(migrated, domain);
    expect(resolved.processNodes.effect.entityType).toBe('cassette_design');
    expect(resolved.producerOutputs['facade_context:entity'].entityType).toBe('cassette_design');
  });

  it('binding checks reject unknown types, undeclared states, and fields outside the row', () => {
    const domain = projectedDomain();
    const base = migrateV4Definition(readModifyWriteDefinition(), domain).definition;
    const unknownType = structuredClone(base);
    unknownType.processNodes.update.type = 'ghost-panel';
    expect(checkCtsGraphBindings(unknownType, domain))
      .toContainEqual(expect.stringMatching(/unknown type ghost-panel/));

    const badState = structuredClone(base);
    badState.processNodes.update.kind = 'cts.transition';
    badState.processNodes.update.type = 'facade';
    badState.processNodes.update.target = 'FLYING';
    expect(checkCtsGraphBindings(badState, domain))
      .toContainEqual(expect.stringMatching(/target state FLYING is not declared/));

    const badField = structuredClone(base);
    badField.processNodes.present = { id: 'present', kind: 'cts.field', type: 'machine', path: 'rogue' };
    expect(checkCtsGraphBindings(badField, domain))
      .toContainEqual(expect.stringMatching(/field rogue is not in the machine row/));
  });

  it('v4 definitions pass through resolution untouched', () => {
    const domain = projectedDomain();
    const original = readModifyWriteDefinition();
    const { definition, diagnostics } = resolveCtsDefinition(original, domain);
    expect(diagnostics).toEqual([]);
    expect(definition).toEqual(original);
  });

  it('migration is idempotent', () => {
    const once = migrateV4Definition(relationCreateDefinition(), projectedDomain()).definition;
    const twice = migrateV4Definition(once, projectedDomain()).definition;
    expect(twice).toEqual(once);
  });
});
