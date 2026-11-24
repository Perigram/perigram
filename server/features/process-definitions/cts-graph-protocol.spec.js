// Graph protocol v5 acceptance gate (SPEC §20): authored native-species
// definitions resolve their declaration bindings and compile into the full
// executable contract through the projected domain. `resolveCtsDefinition`
// is the single binding seam — there is no legacy rewrite at any boundary,
// and non-CTS definitions pass through untouched for the compiler's own
// vocabulary to handle.
import { describe, it, expect } from 'vitest';
import {
  createTypeRegistry, projectDomainFromView,
  resolveCtsDefinition, checkCtsGraphBindings
} from '#packages/cts';
import { cncTypePack } from '@perigram/cts/pack/cnc';
import { frameworkTypes } from '@perigram/cts/pack/framework';
import { compileProcessDefinition, PROCESS_DATAFLOW_VERSION } from '#packages/processes';
function registry() {
  const view = createTypeRegistry({ id: 'v5-acceptance' });
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

// read -> field wire -> mutate, with a sheet producer output (the
// acceptance suite's read-modify-write shape, in the authored species
// vocabulary).
function readModifyWriteDefinition() {
  return {
    schemaVersion: 1,
    dataflowVersion: PROCESS_DATAFLOW_VERSION,
    graphProtocol: 5,
    graph: {
      nodes: ['sheet', 'serial', 'update'].map(id => ({
        id, type: 'processNode', position: { x: 0, y: 0 }, data: { refId: id }
      })),
      edges: [
        { id: 'sheet-update', source: 'sheet', sourceHandle: 'data:result', target: 'update', targetHandle: 'data:entity', role: 'data' },
        { id: 'serial-update', source: 'serial', sourceHandle: 'data:value', target: 'update', targetHandle: 'data:fields.serial', role: 'data' }
      ]
    },
    roleGrants: {},
    producerOutputs: {
      'sheet_context:entity': {
        id: 'sheet_context:entity', producerOutputId: 'sheet_context:entity', nodeId: 'sheet_context', outputSocketId: 'entity',
        typeId: 'sheet', lifecycle: { mode: 'domainDefault' }, fields: { read: ['name'], write: ['fields.serial'], private: [] }
      }
    },
    actions: {},
    services: {},
    sockets: {},
    screens: {},
    processNodes: {
      sheet: { id: 'sheet', kind: 'cts.read', select: 'current', typeId: 'sheet' },
      serial: { id: 'serial', kind: 'source.literalList', access: 'list', type: { base: 'string' }, value: ['SN-42'] },
      update: {
        id: 'update', kind: 'cts.mutate', typeId: 'sheet',
        producerOutputId: 'sheet_context:entity', label: 'Update sheet',
        trigger: { mode: 'manual' }, access: { level: 'write', grants: [] }
      }
    }
  };
}

function fieldReadDefinition() {
  return {
    schemaVersion: 1,
    dataflowVersion: PROCESS_DATAFLOW_VERSION,
    graphProtocol: 5,
    graph: {
      nodes: ['sheet', 'present', 'absent'].map(id => ({ id, type: 'processNode', data: { refId: id } })),
      edges: [
        { id: 'sheet-present', source: 'sheet', sourceHandle: 'data:result', target: 'present', targetHandle: 'data:entity', role: 'data' },
        { id: 'sheet-absent', source: 'sheet', sourceHandle: 'data:result', target: 'absent', targetHandle: 'data:entity', role: 'data' }
      ]
    },
    roleGrants: {},
    producerOutputs: {},
    actions: {},
    services: {},
    sockets: {},
    screens: {},
    processNodes: {
      sheet: { id: 'sheet', kind: 'cts.read', select: 'current', typeId: 'sheet' },
      present: { id: 'present', kind: 'cts.field', typeId: 'sheet', path: 'fields.serial' },
      absent: { id: 'absent', kind: 'cts.field', typeId: 'sheet', path: 'relations.material' }
    }
  };
}

// manual create with authored action grants — the authoring shape whose
// lowered form must drive screen inference (role grants -> auto_* screens)
function grantedCreateDefinition() {
  return {
    schemaVersion: 1,
    dataflowVersion: PROCESS_DATAFLOW_VERSION,
    graphProtocol: 5,
    graph: {
      nodes: [{ id: 'create', type: 'processNode', data: { refId: 'create' } }],
      edges: []
    },
    roleGrants: {},
    producerOutputs: {
      'create:result': {
        id: 'create:result', producerOutputId: 'create:result', nodeId: 'create', outputSocketId: 'result',
        typeId: 'part', lifecycle: { mode: 'domainDefault' }, fields: { read: ['name'], write: [], private: [] }
      }
    },
    actions: {}, services: {}, sockets: {}, screens: {},
    processNodes: {
      create: {
        id: 'create', kind: 'cts.construct', typeId: 'part', producerOutputId: 'create:result',
        construction: { mode: 'genericCreate' }, trigger: { mode: 'manual' },
        access: { level: 'admin', grants: [{ roleId: 'role_admin', level: 'admin' }] }
      }
    }
  };
}

const fixtures = {
  'read/modify/update with producer output': readModifyWriteDefinition,
  'field reads': fieldReadDefinition,
  'create with action grants': grantedCreateDefinition
};

describe('graph protocol v5 (SPEC §20)', () => {
  // The authored native species resolve and compile as-is: kinds, typed
  // ports, and producer provenance survive the binding seam one-for-one.
  for (const [name, build] of Object.entries(fixtures)) {
    it(`resolves bindings and compiles through the native species: ${name}`, () => {
      const domain = projectedDomain();
      const original = build();

      const { definition: resolved, diagnostics } = resolveCtsDefinition(structuredClone(original), domain);
      expect(diagnostics).toEqual([]);
      expect(resolved.processNodes[Object.keys(original.processNodes)[0]].kind)
        .toBe(original.processNodes[Object.keys(original.processNodes)[0]].kind);
      expect(checkCtsGraphBindings(resolved, domain)).toEqual([]);

      const compiled = compileProcessDefinition(resolved, domain, { roles });
      // The compiled outcome preserves the authored producer provenance
      // one-for-one; fixtures without origins compile with none.
      expect(Object.keys(compiled.producerOutputs)).toEqual(Object.keys(resolved.producerOutputs || {}));
    });
  }

  it('field-policy paths survive resolution verbatim as declared schema paths', () => {
    const domain = projectedDomain();
    const sheetOutput = {
      id: 's:entity', producerOutputId: 's:entity', nodeId: 's', outputSocketId: 'result',
      typeId: 'sheet', lifecycle: { mode: 'domainDefault' },
      fields: { read: ['name', 'fields.serial', 'fields.value'], write: ['fields.serial'], private: [] }
    };
    const resolved = resolveCtsDefinition(
      { graphProtocol: 5, processNodes: {}, producerOutputs: { 's:entity': sheetOutput } },
      domain
    ).definition;
    expect(resolved.producerOutputs['s:entity'].typeId).toBe('sheet');
    expect(resolved.producerOutputs['s:entity'].fields.read).toEqual(['name', 'fields.serial', 'fields.value']);
  });

  it('binding checks reject unknown types, undeclared states, and fields outside the row', () => {
    const domain = projectedDomain();
    const base = resolveCtsDefinition(readModifyWriteDefinition(), domain).definition;
    const unknownType = structuredClone(base);
    unknownType.processNodes.update.typeId = 'ghost-panel';
    expect(checkCtsGraphBindings(unknownType, domain))
      .toContainEqual(expect.stringMatching(/unknown type ghost-panel/));
    const badState = structuredClone(base);
    badState.processNodes.update.kind = 'cts.transition';
    badState.processNodes.update.typeId = 'facade';
    badState.processNodes.update.state = { axis: 'main', to: 'FLYING' };
    expect(checkCtsGraphBindings(badState, domain))
      .toContainEqual(expect.stringMatching(/state FLYING is not declared in this draft/));

    const badField = structuredClone(base);
    badField.processNodes.present = { id: 'present', kind: 'cts.field', typeId: 'material', inputDefaults: { field: 'rogue' } };
    expect(checkCtsGraphBindings(badField, domain))
      .toContainEqual(expect.stringMatching(/field rogue is not in the material row/));
  });

  it('a vocabulary without an authored construct default compiles with a deterministic entry', () => {
    // A draft may declare state records before any construct wires its
    // initial: the machine still compiles (SPEC §7) — the first declared
    // state is the entry until authoring the construct default replaces it.
    const domain = projectedDomain();
    const definition = readModifyWriteDefinition();
    definition.ctsTypes = {
      s1: { id: 's1', kind: 'state', typeId: 'sheet', value: 'available', terminal: false },
      s2: { id: 's2', kind: 'state', typeId: 'sheet', value: 'milled', terminal: true }
    };
    definition.producerOutputs['sheet_context:entity'].lifecycle = { mode: 'defaultCreated' };
    const compiled = compileProcessDefinition(definition, domain, { roles });
    const workflow = compiled.producerOutputs['sheet_context:entity'].workflow;
    expect(workflow.regions.main.initial).toBe('available');
    expect(Object.keys(workflow.regions.main.states).sort()).toEqual(['available', 'milled']);
  });

  it('non-CTS definitions pass through resolution untouched', () => {    const domain = projectedDomain();
    const original = {
      schemaVersion: 1,
      dataflowVersion: PROCESS_DATAFLOW_VERSION,
      graph: {
        nodes: [{ id: 'update', type: 'processNode', data: { refId: 'update' } }],
        edges: []
      },
      roleGrants: {},
      producerOutputs: {},
      actions: {},
      services: {},
      sockets: {},
      screens: {},
      processNodes: {
        update: { id: 'update', kind: 'effect.updateEntity', typeId: 'sheet', blocks: ['identity'], trigger: { mode: 'manual' } }
      }
    };
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
    const { definition: resolved, diagnostics } = resolveCtsDefinition(grantedCreateDefinition(), domain);
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
      graphProtocol: 5,
      graph: { nodes: [], edges: [] },
      roleGrants: {},
      producerOutputs: {
        'a:result': { id: 'a:result', producerOutputId: 'a:result', nodeId: 'a', outputSocketId: 'result', typeId: 'panel-a', lifecycle: { mode: 'domainDefault' }, fields: { read: [], write: [], private: [] } },
        'b:result': { id: 'b:result', producerOutputId: 'b:result', nodeId: 'b', outputSocketId: 'result', typeId: 'panel-b', lifecycle: { mode: 'domainDefault' }, fields: { read: [], write: [], private: [] } }
      },
      actions: {}, services: {}, sockets: {}, screens: {},
      processNodes: {
        a: { id: 'a', kind: 'cts.construct', typeId: 'panel-a', producerOutputId: 'a:result', construction: { mode: 'genericCreate' }, trigger: { mode: 'manual' }, access: { level: 'write', grants: [{ roleId: 'role_admin', level: 'write' }] } },
        b: { id: 'b', kind: 'cts.construct', typeId: 'panel-b', producerOutputId: 'b:result', construction: { mode: 'genericCreate' }, trigger: { mode: 'manual' }, access: { level: 'write', grants: [{ roleId: 'role_admin', level: 'write' }] } }
      }
    };
    const compiled = compileProcessDefinition(definition, domain, { roles });
    expect(compiled.screens['auto_role_admin_panel-a']).toMatchObject({ typeId: 'panel-a', actions: ['a'] });
    expect(compiled.screens['auto_role_admin_panel-b']).toMatchObject({ typeId: 'panel-b', actions: ['b'] });
    expect(Object.keys(compiled.screens).some(id => /pen-template|material/.test(id))).toBe(false);
  });

  it('resolution is idempotent', () => {
    const domain = projectedDomain();
    const once = resolveCtsDefinition(readModifyWriteDefinition(), domain).definition;
    const twice = resolveCtsDefinition(structuredClone(once), domain).definition;
    expect(twice).toEqual(once);
  });
});
