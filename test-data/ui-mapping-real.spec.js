import { describe, it, expect } from 'vitest';
import { composeScreen, buildInstancePool } from '#shared/ui-mapping/index.js';
import { createRealUiMappingWorld } from './ui-mapping-real.js';

describe('real pipeline hydration', () => {
  const world = createRealUiMappingWorld();
  const pool = buildInstancePool(world.instances);

  it('hydrates the bundle from the real CTS registry with the CNC pack', () => {
    const ids = world.bundle.types.map(type => type.id);
    for (const packType of ['material', 'part', 'project', 'facade', 'queue', 'solve-run']) {
      expect(ids, packType).toContain(packType);
    }
    expect(ids).toContain('artifact');
    expect(world.bundle.ok).toBe(true);
  });

  it('projects the real compiled contract into the CTS vocabulary', () => {
    const templates = Object.values(world.contract.screens).map(screen => screen.template);
    expect(templates).toContain('home');
    expect(templates).toContain('typeList');
    expect(templates).toContain('instanceDetail');
    for (const screen of Object.values(world.contract.screens)) {
      expect(screen.typeId).toBeUndefined();
      for (const source of screen.sources || []) {
        expect(source.typeId).toBeUndefined();
        expect(source.typeId).toBeTruthy();
      }
    }
    for (const action of Object.values(world.contract.actions)) {
      expect(['createInstance', 'updateInstance', 'deleteInstance', 'link', 'unlink', 'runCommand']).toContain(action.actionKind);
    }
  });

  it('carries real fixture instances in the CTS stored shape', () => {
    expect(world.instances.project[0]).toMatchObject({ type: 'project' });
    expect(world.instances.project[0].fields.name).toBeTruthy();
    expect(world.instances.facade[0].lineage.projectId).toMatchObject({ type: 'project' });
  });

  it('composes every real screen without domain knowledge', () => {
    for (const screen of Object.values(world.contract.screens)) {
      const composed = composeScreen(screen, world.contract, world.bundle, pool);
      expect(composed.regions.length, screen.screenKey).toBeGreaterThan(0);
    }
  });
});
