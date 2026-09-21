// Graph protocol v5 equivalence gate (SPEC §20): for realistic process
// definitions, compile(v4) and compile(resolve(migrate(v4))) must produce
// the same contract. Migration is the one-way persisted rewrite; resolution
// lowers v5 records to the executable working shapes through the projected
// domain. Fixtures are the shapes the acceptance suite already compiles.
import { describe, it, expect } from 'vitest';
import {
  createTypeRegistry, projectDomainFromView,
  migrateV4Definition, resolveCtsDefinition, checkCtsGraphBindings
} from '../../../packages/cts/src/index.js';
import { cncTypePack } from '../../../packages/cts/src/pack/cnc.js';
import { frameworkTypes } from '../../../packages/cts/src/pack/framework.js';
import { compileProcessDefinition, PROCESS_DATAFLOW_VERSION } from '../../../packages/processes/src/index.js';
import { normalizeWorkflow } from '../../../packages/workflows/src/index.js';
function registry() {
  const view = createTypeRegistry({ id: 'v5-equivalence' });
  for (const declaration of [...frameworkTypes, ...cncTypePack]) {
    view.defineType(declaration);
  }
  return view;
}

const projectedDomain = () => projectDomainFromView(registry(), 'org-1');

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
        typeId: 'sheet', lifecycle: { mode: 'domainDefault' }, fields: { read: ['identity.*'], write: ['identity.*'], private: [] }
      }
    },
    actions: {},
    services: {},
    sockets: {},
    screens: {},
    processNodes: {
      deconstruct: { id: 'deconstruct', kind: 'record.deconstruct', typeId: 'sheet', blocks: ['identity'] },
      names: { id: 'names', kind: 'source.literalList', access: 'list', value: ['Renamed sheet'] },
      refs: { id: 'refs', kind: 'source.literalTree', access: 'tree', value: { branches: [{ path: [], items: [{ code: 'M-01', location: 'Hall A' }] }] } },
      modify: { id: 'modify', kind: 'record.modifyBlock', block: 'identity', fields: ['identity.name', 'identity.reference'] },
      update: {
        id: 'update', kind: 'effect.updateEntity', typeId: 'sheet',
        producerOutputId: 'machine_context:entity', label: 'Update sheet',
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
        typeId: 'facade', lifecycle: { mode: 'domainDefault' }, fields: { read: [], write: ['relations.*'], private: [] }
      }
    },
    actions: {},
    services: {},
    sockets: {},
    screens: {},
    processNodes: {
      relations: {
        id: 'relations', kind: 'record.composeBlock', block: 'relations', compositionMode: 'relations',
        entries: [{ id: 'sourceMaterial', key: 'sourceMaterial', typeId: 'material', type: { base: 'entityRef', typeId: 'material' } }]
      },
      effect: {
        id: 'effect', kind: 'effect.createEntity', typeId: 'facade',
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

// manual create with authored action grants — the authoring shape whose
// lowered form must drive screen inference (role grants -> auto_* screens)
function grantedCreateDefinition() {
  return {
    schemaVersion: 1,
    dataflowVersion: PROCESS_DATAFLOW_VERSION,
    graph: {
      nodes: [{ id: 'create', type: 'processNode', data: { refId: 'create' } }],
      edges: []
    },
    roleGrants: {},
    producerOutputs: {
      'create:result': {
        id: 'create:result', producerOutputId: 'create:result', nodeId: 'create', outputSocketId: 'result',
        typeId: 'facade', lifecycle: { mode: 'domainDefault' }, fields: { read: ['identity.*'], write: [], private: [] }
      }
    },
    actions: {}, services: {}, sockets: {}, screens: {},
    processNodes: {
      create: {
        id: 'create', kind: 'effect.createEntity', typeId: 'facade', producerOutputId: 'create:result',
        construction: { mode: 'genericCreate' }, blocks: [], trigger: { mode: 'manual' },
        access: { level: 'admin', grants: [{ roleId: 'role_admin', level: 'admin' }] },
        status: { to: 'draft' }
      }
    }
  };
}

const fixtures = {
  'read/modify/update with producer output': readModifyWriteDefinition,
  'construct over relations entries': relationCreateDefinition,
  'field reads': fieldReadDefinition,
  'create with action grants': grantedCreateDefinition
};

// Equivalence is outcome equivalence: whether the compiler accepts the
// definition (deep-equal contracts) or rejects it (identical diagnostics),
// the migrated-and-resolved graph behaves exactly like the original.
function compileOutcome(definition, domain) {
  try {
    const compiled = compileProcessDefinition(structuredClone(definition), domain, { roles });
    delete compiled.activatedAt; // wall clock, not contract
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
    expect(update.typeId).toBe('sheet');
    expect(update.slots).toEqual(['identity']);
    const deconstruct = migrated.processNodes.deconstruct;
    expect(deconstruct.kind).toBe('cts.decompose');
    const modify = migrated.processNodes.modify;
    expect(modify.kind).toBe('cts.compose');
    expect(modify.mode).toBe('modify');
    const output = migrated.producerOutputs['machine_context:entity'];
    expect(output.typeId).toBe('sheet');

    const created = migrateV4Definition(relationCreateDefinition(), projectedDomain()).definition;
    expect(created.processNodes.effect.kind).toBe('cts.construct');
    expect(created.processNodes.effect.via).toBe('genericCreate');
    expect(created.processNodes.relations.entries[0].target).toBe('material');
    expect(created.processNodes.relations.entries[0].type).toEqual({ base: 'entityRef', typeId: 'material' });

    const fields = migrateV4Definition(fieldReadDefinition(), projectedDomain()).definition.processNodes.present;
    expect(fields.kind).toBe('cts.field');
    expect(fields.path).toBe('identity.name'); // managed slot keeps its qualified name
  });

  it('row paths strip and restore through data/specs slots', () => {
    const domain = projectedDomain();
    const definition = readModifyWriteDefinition();
    definition.producerOutputs['machine_context:entity'].fields = {
      read: ['identity.*', 'data.code', 'data.graph', 'data.value'],
      write: ['identity.*', 'data.code'],
      private: []
    };
    const { definition: migrated } = migrateV4Definition(definition, domain);
    const output = migrated.producerOutputs['machine_context:entity'];
    // sheet has no code/graph rows — unknown slot paths stay managed
    expect(output.fields.read).toEqual(['identity.*', 'data.code', 'data.graph', 'data.value']);
    // a type with real rows strips and restores byte-identically
    const queueOutput = {
      id: 'q:entity', producerOutputId: 'q:entity', nodeId: 'q', outputSocketId: 'entity',
      typeId: 'queue', lifecycle: { mode: 'domainDefault' },
      fields: { read: ['identity.*', 'job', 'data.value'], write: ['job'], private: [] }
    };
    const resolved = resolveCtsDefinition(
      { graphProtocol: 5, processNodes: {}, producerOutputs: { 'q:entity': queueOutput } },
      domain
    ).definition;
    expect(resolved.producerOutputs['q:entity'].typeId).toBe('queue');
    expect(resolved.producerOutputs['q:entity'].fields.read).toEqual(['identity.*', 'data.job', 'data.value']);
  });

  it('kebab/snake round trips through kebab-only type ids', () => {
    const domain = projectedDomain();
    const original = relationCreateDefinition();
    original.processNodes.effect.typeId = 'solve_run';
    original.producerOutputs['facade_context:entity'].typeId = 'solve_run';
    const { definition: migrated } = migrateV4Definition(original, domain);
    expect(migrated.processNodes.effect.typeId).toBe('solve-run');
    expect(migrated.producerOutputs['facade_context:entity'].typeId).toBe('solve-run');
    const { definition: resolved } = resolveCtsDefinition(migrated, domain);
    // After the cut, storage entity ids are the kebab type ids themselves
    expect(resolved.processNodes.effect.typeId).toBe('solve-run');
    expect(resolved.producerOutputs['facade_context:entity'].typeId).toBe('solve-run');
  });

  it('binding checks reject unknown types, undeclared states, and fields outside the row', () => {
    const domain = projectedDomain();
    const base = migrateV4Definition(readModifyWriteDefinition(), domain).definition;
    const unknownType = structuredClone(base);
    unknownType.processNodes.update.typeId = 'ghost-panel';
    expect(checkCtsGraphBindings(unknownType, domain))
      .toContainEqual(expect.stringMatching(/unknown type ghost-panel/));

    const badState = structuredClone(base);
    badState.processNodes.update.kind = 'cts.transition';
    badState.processNodes.update.typeId = 'facade';
    badState.processNodes.update.target = 'FLYING';
    expect(checkCtsGraphBindings(badState, domain))
      .toContainEqual(expect.stringMatching(/target state FLYING is not declared/));

    const badField = structuredClone(base);
    badField.processNodes.present = { id: 'present', kind: 'cts.field', typeId: 'material', path: 'rogue' };
    expect(checkCtsGraphBindings(badField, domain))
      .toContainEqual(expect.stringMatching(/field rogue is not in the material row/));
  });

  it('v4 definitions pass through resolution untouched', () => {
    const domain = projectedDomain();
    const original = readModifyWriteDefinition();
    const { definition, diagnostics } = resolveCtsDefinition(original, domain);
    expect(diagnostics).toEqual([]);
    expect(definition).toEqual(original);
  });

  it('lowered create grants drive inferred screens', () => {
    // The compiled-preview contract: an authored v5 graph must lower before
    // compiling, because screen inference reads the role grants derived from
    // the create action's access — a raw compile ignores cts.* records
    // entirely and reports an empty contract.
    const domain = projectedDomain();
    const original = grantedCreateDefinition();
    const { definition: migrated } = migrateV4Definition(structuredClone(original), domain);
    const { definition: resolved, diagnostics } = resolveCtsDefinition(migrated, domain);
    expect(diagnostics).toEqual([]);
    const compiled = compileProcessDefinition(structuredClone(resolved), domain, { roles });
    // The inferred screen is for the action's OWN entity type — feature
    // resolution must never substitute an arbitrary sibling type.
    expect(compiled.screens['auto_role_admin_facade']).toMatchObject({ kind: 'typeList', typeId: 'facade', roleIds: ['role_admin'] });
    expect(Object.keys(compiled.screens).every(id => !id.includes('project'))).toBe(true);
    expect(compiled.roles.role_admin.grants).toEqual([expect.objectContaining({ feature: 'groups', level: 'admin', typeId: 'facade' })]);
    expect(compiled.roles.role_admin.actions.map(action => action.actionId)).toContain('create');
  });

  it('org types sharing a collection each infer their own screen', () => {
    // Two org file-class types share one feature (collection); grants
    // authored against each must emit separate screens for THOSE types,
    // not one screen for an arbitrary pack sibling of the feature.
    const view = createTypeRegistry({ id: 'v5-org-types' });
    for (const declaration of [...frameworkTypes, ...cncTypePack]) view.defineType(declaration);
    view.defineType({ id: 'panel-a', class: 'file', scope: 'org', organizationId: 'org-1', fields: { name: { base: 'string' } }, states: { main: { initial: 'draft', values: ['draft'], terminal: [] } } });
    view.defineType({ id: 'panel-b', class: 'file', scope: 'org', organizationId: 'org-1', fields: { name: { base: 'string' } }, states: { main: { initial: 'draft', values: ['draft'], terminal: [] } } });
    const domain = projectDomainFromView(view, 'org-1');

    const definition = {
      schemaVersion: 1,
      dataflowVersion: PROCESS_DATAFLOW_VERSION,
      graph: { nodes: [], edges: [] },
      roleGrants: {},
      producerOutputs: {
        'a:result': { id: 'a:result', producerOutputId: 'a:result', nodeId: 'a', outputSocketId: 'result', typeId: 'panel-a', lifecycle: { mode: 'domainDefault' }, fields: { read: [], write: [], private: [] } },
        'b:result': { id: 'b:result', producerOutputId: 'b:result', nodeId: 'b', outputSocketId: 'result', typeId: 'panel-b', lifecycle: { mode: 'domainDefault' }, fields: { read: [], write: [], private: [] } }
      },
      actions: {}, services: {}, sockets: {}, screens: {},
      processNodes: {
        a: { id: 'a', kind: 'effect.createEntity', typeId: 'panel-a', producerOutputId: 'a:result', construction: { mode: 'genericCreate' }, blocks: [], trigger: { mode: 'manual' }, access: { level: 'write', grants: [{ roleId: 'role_admin', level: 'write' }] }, status: { to: 'draft' } },
        b: { id: 'b', kind: 'effect.createEntity', typeId: 'panel-b', producerOutputId: 'b:result', construction: { mode: 'genericCreate' }, blocks: [], trigger: { mode: 'manual' }, access: { level: 'write', grants: [{ roleId: 'role_admin', level: 'write' }] }, status: { to: 'draft' } }
      }
    };
    const compiled = compileProcessDefinition(definition, domain, { roles });
    expect(compiled.screens['auto_role_admin_panel-a']).toMatchObject({ typeId: 'panel-a', actions: ['a'] });
    expect(compiled.screens['auto_role_admin_panel-b']).toMatchObject({ typeId: 'panel-b', actions: ['b'] });
    expect(Object.keys(compiled.screens).some(id => /pen-template|material/.test(id))).toBe(false);
  });

  it('migration is idempotent', () => {
    const once = migrateV4Definition(relationCreateDefinition(), projectedDomain()).definition;
    const twice = migrateV4Definition(once, projectedDomain()).definition;
    expect(twice).toEqual(once);
  });
});
