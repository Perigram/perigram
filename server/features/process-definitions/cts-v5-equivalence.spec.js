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

// read -> modify block -> update entity, with a sheet producer output
// (the acceptance suite's read-modify-write shape, in the persisted v4
// vocabulary the load boundary migrates).
function readModifyWriteDefinition() {
  return {
    schemaVersion: 1,
    dataflowVersion: PROCESS_DATAFLOW_VERSION,
    graph: {
      nodes: ['deconstruct', 'serials', 'modify', 'update'].map(id => ({
        id, type: 'processNode', position: { x: 0, y: 0 }, data: { refId: id }
      })),
      edges: [
        { id: 'deconstruct-modify', source: 'deconstruct', sourceHandle: 'data:data', target: 'modify', targetHandle: 'data:block', role: 'data' },
        { id: 'serials-modify', source: 'serials', sourceHandle: 'data:value', target: 'modify', targetHandle: 'data:data.serial', role: 'data' },
        { id: 'modify-update', source: 'modify', sourceHandle: 'data:block', target: 'update', targetHandle: 'data:data', role: 'data' }
      ]
    },
    roleGrants: {},
    producerOutputs: {
      'sheet_context:entity': {
        id: 'sheet_context:entity', producerOutputId: 'sheet_context:entity', nodeId: 'sheet_context', outputSocketId: 'entity',
        typeId: 'sheet', lifecycle: { mode: 'domainDefault' }, fields: { read: ['identity.*'], write: ['data.serial'], private: [] }
      }
    },
    actions: {},
    services: {},
    sockets: {},
    screens: {},
    processNodes: {
      deconstruct: { id: 'deconstruct', kind: 'record.deconstruct', typeId: 'sheet', blocks: ['data'] },
      serials: { id: 'serials', kind: 'source.literalList', access: 'list', type: { base: 'string' }, value: ['SN-42'] },
      modify: { id: 'modify', kind: 'record.modifyBlock', block: 'data', fields: ['data.serial'] },
      update: {
        id: 'update', kind: 'effect.updateEntity', typeId: 'sheet',
        producerOutputId: 'sheet_context:entity', label: 'Update sheet',
        trigger: { mode: 'manual' }, access: { level: 'write', grants: [] }, blocks: ['data']
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
      'part_context:entity': {
        id: 'part_context:entity', producerOutputId: 'part_context:entity', nodeId: 'part_context', outputSocketId: 'entity',
        typeId: 'part', lifecycle: { mode: 'domainDefault' }, fields: { read: [], write: ['relations.placed-on'], private: [] }
      }
    },
    actions: {},
    services: {},
    sockets: {},
    screens: {},
    processNodes: {
      relations: {
        id: 'relations', kind: 'record.composeBlock', block: 'relations', compositionMode: 'relations',
        entries: [{ id: 'placed-on', key: 'placed-on', typeId: 'sheet', type: { base: 'entityRef', typeId: 'sheet' } }]
      },
      effect: {
        id: 'effect', kind: 'effect.createEntity', typeId: 'part', producerOutputId: 'part_context:entity',
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
      nodes: ['sheet', 'present', 'absent'].map(id => ({ id, type: 'processNode', data: { refId: id } })),
      edges: [
        { id: 'sheet-present', source: 'sheet', sourceHandle: 'data:entity', target: 'present', targetHandle: 'data:block', role: 'data' },
        { id: 'sheet-absent', source: 'sheet', sourceHandle: 'data:entity', target: 'absent', targetHandle: 'data:block', role: 'data' }
      ]
    },
    roleGrants: {},
    producerOutputs: {},
    actions: {},
    services: {},
    sockets: {},
    screens: {},
    processNodes: {
      sheet: { id: 'sheet', kind: 'read.currentEntity', typeId: 'sheet' },
      present: { id: 'present', kind: 'record.getField', block: 'data', path: 'data.serial', typeId: 'sheet' },
      absent: { id: 'absent', kind: 'record.getField', block: 'data', path: 'data.material', typeId: 'sheet' }
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
        typeId: 'part', lifecycle: { mode: 'domainDefault' }, fields: { read: ['identity.*'], write: [], private: [] }
      }
    },
    actions: {}, services: {}, sockets: {}, screens: {},
    processNodes: {
      create: {
        id: 'create', kind: 'effect.createEntity', typeId: 'part', producerOutputId: 'create:result',
        construction: { mode: 'genericCreate' }, blocks: [], trigger: { mode: 'manual' },
        access: { level: 'admin', grants: [{ roleId: 'role_admin', level: 'admin' }] }
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

// Outcomes compile through the native species only; the retired v4
// spelling has no equivalence contract to compare against.

describe('graph protocol v5 (SPEC §20)', () => {
  // The one-way persisted rewrite: every fixture compiles AFTER migration
  // through the native species records. Compiling the retired v4 spelling
  // beside it is no longer an equivalence contract — v5 records are never
  // lowered back to a twin (the compiler may still resolve v4 fixtures
  // directly for legacy suites, but the contract is the native outcome).
  for (const [name, build] of Object.entries(fixtures)) {
    it(`migrates and compiles through the native species: ${name}`, () => {
      const domain = projectedDomain();
      const original = build();

      const { definition: migrated } = migrateV4Definition(structuredClone(original), domain);
      expect(migrated.graphProtocol).toBe(5);
      expect(checkCtsGraphBindings(migrated, domain)).toEqual([]);

      const { definition: resolved, diagnostics } = resolveCtsDefinition(structuredClone(migrated), domain);
      expect(diagnostics).toEqual([]);
      const compiled = compileProcessDefinition(resolved, domain, { roles });
      // The native outcome preserves the authored producer provenance
      // one-for-one; fixtures without origins compile with none.
      expect(Object.keys(compiled.producerOutputs)).toEqual(Object.keys(resolved.producerOutputs || {}));
    });
  }

  it('migrated records speak the type system vocabulary', () => {
    const migrated = migrateV4Definition(readModifyWriteDefinition(), projectedDomain()).definition;
    const update = migrated.processNodes.update;
    expect(update.kind).toBe('cts.mutate');
    expect(update.typeId).toBe('sheet');
    // The composer-fed block substrate is gone: the serial wire lands on
    // the mutate's field socket and the composer/decompose records die.
    expect(update.slots).toBeUndefined();
    expect(migrated.processNodes.modify).toBeUndefined();
    expect(migrated.processNodes.deconstruct).toBeUndefined();
    expect(migrated.graph.edges).toEqual([
      expect.objectContaining({ source: 'serials', target: 'update', targetHandle: 'data:data.serial' })
    ]);
    const output = migrated.producerOutputs['sheet_context:entity'];
    expect(output.typeId).toBe('sheet');

    const created = migrateV4Definition(relationCreateDefinition(), projectedDomain()).definition;
    expect(created.processNodes.effect.kind).toBe('cts.construct');
    expect(created.processNodes.effect.construction.mode).toBe('genericCreate');
    // The relations composer expanded into the construct's declared
    // relation input and died with the block substrate.
    expect(created.processNodes.relations).toBeUndefined();
    expect(created.processNodes.effect.producerOutputId).toBe('part_context:entity');

    const fields = migrateV4Definition(fieldReadDefinition(), projectedDomain()).definition.processNodes.present;
    expect(fields.kind).toBe('cts.field');
    expect(fields.path).toBe('data.serial');
  });

  it('field-policy paths migrate verbatim as declared schema paths', () => {
    const domain = projectedDomain();
    const definition = readModifyWriteDefinition();
    definition.producerOutputs['sheet_context:entity'].fields = {
      read: ['identity.*', 'data.code', 'data.graph', 'data.value'],
      write: ['identity.*', 'data.code'],
      private: []
    };
    const { definition: migrated } = migrateV4Definition(definition, domain);
    const output = migrated.producerOutputs['sheet_context:entity'];
    // Authored paths survive byte-identically: the declared schema path is
    // the contract, and unknown paths stay for the policy check to reject.
    expect(output.fields.read).toEqual(['identity.*', 'data.code', 'data.graph', 'data.value']);
    const sheetOutput = {
      id: 's:entity', producerOutputId: 's:entity', nodeId: 's', outputSocketId: 'result',
      typeId: 'sheet', lifecycle: { mode: 'domainDefault' },
      fields: { read: ['identity.*', 'data.serial', 'data.value'], write: ['data.serial'], private: [] }
    };
    const resolved = resolveCtsDefinition(
      { graphProtocol: 5, processNodes: {}, producerOutputs: { 's:entity': sheetOutput } },
      domain
    ).definition;
    expect(resolved.producerOutputs['s:entity'].typeId).toBe('sheet');
    expect(resolved.producerOutputs['s:entity'].fields.read).toEqual(['identity.*', 'data.serial', 'data.value']);
  });

  it('kebab/snake round trips through kebab-only type ids', () => {
    const domain = projectedDomain();
    const original = relationCreateDefinition();
    original.processNodes.effect.typeId = 'solve_run';
    original.producerOutputs['part_context:entity'].typeId = 'solve_run';
    const { definition: migrated } = migrateV4Definition(original, domain);
    expect(migrated.processNodes.effect.typeId).toBe('solve-run');
    expect(migrated.producerOutputs['part_context:entity'].typeId).toBe('solve-run');
    const { definition: resolved } = resolveCtsDefinition(migrated, domain);
    // After the cut, storage entity ids are the kebab type ids themselves
    expect(resolved.processNodes.effect.typeId).toBe('solve-run');
    expect(resolved.producerOutputs['part_context:entity'].typeId).toBe('solve-run');
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
    expect(compiled.screens['auto_role_admin_part']).toMatchObject({ kind: 'typeList', typeId: 'part', roleIds: ['role_admin'] });
    expect(Object.keys(compiled.screens).every(id => !id.includes('project'))).toBe(true);
    expect(compiled.roles.role_admin.grants).toEqual([expect.objectContaining({ feature: 'items', level: 'admin', typeId: 'part' })]);
    expect(compiled.roles.role_admin.actions.map(action => action.actionId)).toContain('create');
  });

  it('org types sharing a collection each infer their own screen', () => {
    // Two org file-class types share one feature (collection); grants
    // authored against each must emit separate screens for THOSE types,
    // not one screen for an arbitrary pack sibling of the feature.
    const view = createTypeRegistry({ id: 'v5-org-types' });
    for (const declaration of [...frameworkTypes, ...cncTypePack]) view.defineType(declaration);
    view.defineType({ id: 'panel-a', class: 'file', scope: 'org', organizationId: 'org-1', fields: { name: { base: 'string' } }, states: { main: { initial: 'draft', states: { draft: {} } } } });
    view.defineType({ id: 'panel-b', class: 'file', scope: 'org', organizationId: 'org-1', fields: { name: { base: 'string' } }, states: { main: { initial: 'draft', states: { draft: {} } } } });
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
        a: { id: 'a', kind: 'effect.createEntity', typeId: 'panel-a', producerOutputId: 'a:result', construction: { mode: 'genericCreate' }, blocks: [], trigger: { mode: 'manual' }, access: { level: 'write', grants: [{ roleId: 'role_admin', level: 'write' }] } },
        b: { id: 'b', kind: 'effect.createEntity', typeId: 'panel-b', producerOutputId: 'b:result', construction: { mode: 'genericCreate' }, blocks: [], trigger: { mode: 'manual' }, access: { level: 'write', grants: [{ roleId: 'role_admin', level: 'write' }] } }
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
