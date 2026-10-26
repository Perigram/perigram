// Compiler regression bridge: the emitted UI contract must be consumable by
// the real generator. Compiles the persisted acceptance fixture through the
// real compiler and CTS-projected domain, then composes every emitted screen
// through `#shared/ui-mapping`'s `composeScreen` with the real client bundle
// and an empty instance pool. This pins the emit vocabulary (`typeId`,
// `typeList`/`instanceDetail`, `createInstance`/`link`/`runCommand`) against
// the generator that renders it — the fixture shapes in
// `test-data/ui-mapping-fixtures.js` stay examples, not the contract.
import { describe, expect, it } from 'vitest';
import { compileProcessDefinition } from './index.js';
import { projectUiContractChannels, projectUiAction, creationModeLabel, UI_CONTRACT_ACTION_KINDS, UI_CONTRACT_TEMPLATES } from './ui-contract-projection.js';
import { createTypeRegistry, frameworkTypes, projectDomainFromView, compileClientBundle } from '../../cts/src/index.js';
import { cncTypePack } from '../../cts/src/pack/cnc.js';
import { facadeDomain, facadePackContent } from '../../../test-tools/facade-plugin.js';
import { createPersistedAcceptanceFixture } from '../../../test-data/persisted-acceptance.js';
import { composeScreen } from '#shared/ui-mapping/index.js';

const ORGANIZATION_ID = 'org-ui-contract';

function projectedDomain() {
  const registry = createTypeRegistry({ id: 'ui-contract-spec' });
  for (const declaration of [...frameworkTypes, ...facadePackContent.types, ...cncTypePack]) registry.defineType(declaration);
  return {
    domain: projectDomainFromView(registry, ORGANIZATION_ID, facadeDomain, { packServices: facadePackContent.services }),
    registry
  };
}

function compileFixture() {
  const fixture = createPersistedAcceptanceFixture();
  const { domain, registry } = projectedDomain();
  const compiled = compileProcessDefinition(fixture.processDefinition.data, domain, { roles: fixture.roles });
  return { compiled, registry, domain };
}

describe('create action captions', () => {
  const typeLabels = new Map([['cassette-design', 'Cassette Design']]);

  it('derives display names for construction modes', () => {
    expect(creationModeLabel('')).toBe('');
    expect(creationModeLabel('genericCreate')).toBe('');
    expect(creationModeLabel('upload')).toBe('Upload');
    expect(creationModeLabel('convertDxf')).toBe('Convert Dxf');
    expect(creationModeLabel('from_layout')).toBe('From Layout');
  });

  it('folds a distinguishing construction mode into derived captions', () => {
    const projected = projectUiAction(
      { id: 'create', actionKind: 'createEntity', typeId: 'cassette-design', label: 'cts.construct', construction: { mode: 'bake' } },
      { typeLabels }
    );
    expect(projected.label).toBe('New Cassette Design from Bake');
  });

  it('keeps the plain caption for modeless and generic creates', () => {
    const modeless = projectUiAction(
      { id: 'create', actionKind: 'createEntity', typeId: 'cassette-design', label: 'Create' },
      { typeLabels }
    );
    const generic = projectUiAction(
      { id: 'create', actionKind: 'createEntity', typeId: 'cassette-design', label: 'Create', construction: { mode: 'genericCreate' } },
      { typeLabels }
    );
    expect(modeless.label).toBe('New Cassette Design');
    expect(generic.label).toBe('New Cassette Design');
  });

  it('translates the compiler-derived caption family', () => {
    const projected = projectUiAction(
      { id: 'create', actionKind: 'createEntity', typeId: 'cassette-design', label: 'Create Cassette Design from Bake', construction: { mode: 'bake' } },
      { typeLabels }
    );
    expect(projected.label).toBe('New Cassette Design from Bake');
  });

  it('keeps an authored label verbatim over the derivation', () => {
    const projected = projectUiAction(
      { id: 'create', actionKind: 'createEntity', typeId: 'cassette-design', label: 'Bake design', construction: { mode: 'bake' } },
      { typeLabels }
    );
    expect(projected.label).toBe('Bake design');
  });
});

describe('ui-contract projection', () => {
  it('maps legacy action kinds onto the UI contract vocabulary', () => {
    const projected = projectUiContractChannels({
      actions: {
        create: { id: 'create', actionKind: 'createEntity', typeId: 'project', label: 'Create' },
        update: { id: 'update', actionKind: 'updateEntity', typeId: 'project', state: { to: 'DONE' } },
        remove: { id: 'remove', actionKind: 'deleteEntity', typeId: 'project' },
        link: { id: 'link', actionKind: 'updateEntity', typeId: 'queue', relationMutation: { key: 'items', targetTypes: ['cassette_design'], cardinality: 'array', operation: 'link' } },
        unlink: { id: 'unlink', actionKind: 'updateEntity', typeId: 'queue', relationMutation: { key: 'items', targetTypes: ['cassette_design'], operation: 'unlink' } },
        run: { id: 'run', actionKind: 'runCommand', typeId: 'queue', commandId: 'nesting.solve' },
        send: { id: 'send', actionKind: 'sendToOrganization', typeId: 'project' }
      },
      screens: {}
    });
    expect(projected.actions.create).toMatchObject({ actionKind: 'createInstance', typeId: 'project' });
    expect(projected.actions.update).toMatchObject({ actionKind: 'updateInstance', state: { to: 'DONE' } });
    expect(projected.actions.remove).toMatchObject({ actionKind: 'deleteInstance' });
    expect(projected.actions.link).toMatchObject({ actionKind: 'link', relation: { key: 'items', targetTypes: ['cassette_design'] } });
    expect(projected.actions.unlink).toMatchObject({ actionKind: 'unlink' });
    expect(projected.actions.run).toMatchObject({ actionKind: 'runCommand', commandId: 'nesting.solve' });
    expect(projected.actions.send).toBeUndefined();
  });

  it('carries run action exposure inputs on the contract channel', () => {
    const projected = projectUiContractChannels({
      actions: {
        run: {
          id: 'run',
          actionKind: 'runCommand',
          typeId: 'queue',
          commandId: 'nesting.solve',
          inputs: [{ id: 'sheetWidth', type: 'number', unit: 'mm', default: 1220, prompt: true }]
        }
      },
      screens: {}
    });
    expect(projected.actions.run.inputs).toEqual([
      { id: 'sheetWidth', type: 'number', unit: 'mm', default: 1220, prompt: true }
    ]);
  });

  it('keeps action construction inputs and fields across repeated projection', () => {
    // The assignment manifest projects twice (assignment access, then
    // hydration): id-string inputs must pass through instead of dropping
    // to [], which starved every create dialog of its file/name inputs.
    const once = projectUiContractChannels({
      actions: {
        create: {
          id: 'create', actionKind: 'createEntity', typeId: 'image', label: 'Create',
          construction: {
            mode: 'upload',
            inputs: [
              { id: 'name', path: 'name', type: 'string' },
              { id: 'payload', path: 'payload', type: 'file' }
            ]
          },
          inputPolicy: { fields: [{ id: 'payload', path: 'payload', type: 'file' }] }
        }
      },
      screens: {}
    });
    expect(once.actions.create.construction).toEqual({ mode: 'upload', inputs: ['name', 'payload'] });
    const twice = projectUiContractChannels({ actions: once.actions, screens: {} });
    expect(twice.actions.create.construction).toEqual({ mode: 'upload', inputs: ['name', 'payload'] });
  });

  it('maps screen templates, type bindings, and lineage-scoped child sources', () => {
    const projected = projectUiContractChannels({
      actions: {},
      screens: {
        list: { id: 'list', template: 'typeList', typeId: 'queue', roleIds: ['op'] },
        detail: {
          id: 'detail',
          template: 'instanceDetail',
          typeId: 'queue',
          sources: [
            { id: 'queue', typeId: 'queue', mode: 'single', identifier: '$screen.scope.instanceId' },
            { id: 'runs_children', typeId: 'nesting_run', mode: 'list', filters: { queueId: '$screen.scope.instanceId' } }
          ],
          regions: [{ id: 'runs_region', slot: 'main', sourceId: 'runs_children', surface: 'card', actions: [] }]
        }
      }
    });
    expect(projected.screens.list).toMatchObject({ template: 'typeList', typeId: 'queue' });
    const detail = projected.screens.detail;
    expect(detail.template).toBe('instanceDetail');
    expect(detail.sources[0]).toMatchObject({ mode: 'single', typeId: 'queue' });
    expect(detail.sources[1].lineage).toEqual({ sourceId: 'queue', key: 'queueId' });
  });
});

describe('compiled ui contract consumes through the generator', () => {
  it('emits only generator vocabulary', () => {
    const { compiled } = compileFixture();
    for (const screen of Object.values(compiled.screens)) {
      expect(screen.typeId || screen.template === 'home').toBeTruthy();
      if (screen.template !== 'home') expect(UI_CONTRACT_TEMPLATES).toContain(screen.template);
      for (const source of screen.sources || []) expect(source.typeId || source.mode).toBeTruthy();
    }
    const manifestActions = Object.values(compiled.userAccess || {}).flatMap(access => access.actions || []);
    for (const action of manifestActions) {
      expect(UI_CONTRACT_ACTION_KINDS).toContain(action.actionKind);
      expect(action.id).toBeTruthy();
    }
  });

  it('composes every emitted and per-user screen through composeScreen with the client bundle', () => {
    const { compiled, registry } = compileFixture();
    const bundle = compileClientBundle(registry, ORGANIZATION_ID);
    const contract = { actions: Object.fromEntries(Object.values(compiled.userAccess || {}).flatMap(access => access.actions || []).map(action => [action.id, action])) };
    const pool = {};
    const screens = [
      ...Object.values(compiled.screens),
      ...Object.values(compiled.userAccess || {}).flatMap(access => access.screens || [])
    ];
    expect(screens.length).toBeGreaterThan(0);
    for (const screen of screens) {
      const composed = composeScreen(screen, contract, bundle, pool);
      expect(composed).toBeTruthy();
      expect(Array.isArray(composed.regions)).toBe(true);
    }
  });
});
