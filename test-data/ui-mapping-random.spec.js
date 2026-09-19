import { describe, it, expect } from 'vitest';
import { checkValue } from '#packages/cts/src/values.js';
import { composeScreen, buildInstancePool, resolveFieldControl, VARIANTS } from '#shared/ui-mapping/index.js';
import { generateUiMappingWorld } from './ui-mapping-random.js';

const SEEDS = [1, 2, 3, 7, 11, 19, 42, 99, 123, 777];

describe('random worlds', () => {
  it('are deterministic per seed and differ across seeds', () => {
    expect(generateUiMappingWorld(42)).toEqual(generateUiMappingWorld(42));
    expect(generateUiMappingWorld(42)).not.toEqual(generateUiMappingWorld(43));
  });

  it('produce instance values that conform to their descriptors (CTS checkValue)', () => {
    for (const seed of SEEDS) {
      const world = generateUiMappingWorld(seed);
      for (const type of world.bundle.types) {
        for (const instance of world.instances[type.id]) {
          for (const [name, descriptor] of Object.entries(type.fields)) {
            const errors = checkValue(descriptor, instance.fields[name]);
            expect(errors, `seed ${seed} ${type.id}.${name}`).toEqual([]);
          }
        }
      }
    }
  });

  it('compose every screen without throwing, across seeds', () => {
    for (const seed of SEEDS) {
      const world = generateUiMappingWorld(seed);
      const pool = buildInstancePool(world.instances);
      for (const screen of Object.values(world.contract.screens)) {
        const composed = composeScreen(screen, world.contract, world.bundle, pool);
        expect(composed.regions.length, `seed ${seed} ${screen.screenKey}`).toBeGreaterThan(0);
        if (screen.template === 'instanceDetail') {
          const main = composed.regions[0];
          expect(main.surfaceKind).toBe('detail');
          expect(main.instances.length, `seed ${seed} ${screen.screenKey} main instance`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('resolve every generated field descriptor in every variant', () => {
    for (const seed of SEEDS.slice(0, 4)) {
      const world = generateUiMappingWorld(seed);
      for (const type of world.bundle.types) {
        for (const [name, descriptor] of Object.entries(type.fields)) {
          for (const variant of VARIANTS) {
            const outcome = resolveFieldControl(descriptor, { variant });
            expect(outcome.component, `seed ${seed} ${type.id}.${name}/${variant}`).toBeTruthy();
          }
        }
      }
    }
  });

  it('generate unanticipated shapes: structural depth, empty types, mixed cardinality', () => {
    const stats = { emptyTypes: 0, structuralFields: 0, nullableRefs: 0, lists: 0 };
    for (const seed of SEEDS) {
      const world = generateUiMappingWorld(seed);
      for (const type of world.bundle.types) {
        if (!world.instances[type.id].length) stats.emptyTypes += 1;
        for (const descriptor of Object.values(type.fields)) {
          if (['record', 'variant', 'map', 'json'].includes(descriptor.base)) stats.structuralFields += 1;
          if (descriptor.base === 'ref' && descriptor.nullable) stats.nullableRefs += 1;
          if (descriptor.base === 'list') stats.lists += 1;
        }
      }
    }
    expect(stats.emptyTypes).toBeGreaterThan(0);
    expect(stats.structuralFields).toBeGreaterThan(10);
    expect(stats.nullableRefs).toBeGreaterThan(0);
    expect(stats.lists).toBeGreaterThan(10);
  });
});
