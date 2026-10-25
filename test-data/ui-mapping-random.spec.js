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
        // The deliberate dangling-scope screen is the one instanceDetail
        // whose main region resolves no instance (the missing state).
        if (screen.template === 'instanceDetail' && !screen.screenKey.startsWith('detail_missing_')) {
          const main = composed.regions[0];
          expect(main.surfaceKind).toBe('detail');
          expect(main.instances.length, `seed ${seed} ${screen.screenKey} main instance`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('carry valid data traits and a resolved arrangement on every composed node', () => {
    const BREADTHS = ['chip', 'content', 'full'];
    const GROWTH = ['flowing', 'bounded'];
    const SHAPES = ['plain', 'media', 'temporal', 'prose', 'measure', 'stateful'];
    const MODES = ['stack', 'columns', 'mixed', 'tabs'];
    const walk = (regions, visit) => {
      for (const region of regions) {
        visit(region);
        walk(region.childRegions || [], visit);
        walk(region.stubRegions || [], visit);
      }
    };
    for (const seed of SEEDS) {
      const world = generateUiMappingWorld(seed);
      const pool = buildInstancePool(world.instances);
      for (const screen of Object.values(world.contract.screens)) {
        const composed = composeScreen(screen, world.contract, world.bundle, pool);
        walk(composed.regions, region => {
          const traits = region.dataTraits;
          expect(traits, `seed ${seed} ${screen.screenKey} ${region.id} dataTraits`).toBeTruthy();
          expect(Number.isFinite(traits.weight), `seed ${seed} ${region.id} weight`).toBe(true);
          expect(BREADTHS, `seed ${seed} ${region.id} breadth`).toContain(traits.breadth);
          expect(GROWTH, `seed ${seed} ${region.id} growth`).toContain(traits.growth);
          expect(SHAPES, `seed ${seed} ${region.id} shape`).toContain(traits.shape);
          expect(traits.volume, `seed ${seed} ${region.id} volume`).toBe(region.instances.length);
          expect(['filled', 'inert'], `seed ${seed} ${region.id} filledness`).toContain(traits.filledness);
          expect(traits.filledness === 'inert').toBe(region.instances.length === 0);
          expect(MODES, `seed ${seed} ${region.id} arrangement`).toContain(region.childArrangement.mode);
        });
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

describe('showcase-reachable contracts in every world', () => {
  it('ships the authored naming vocabulary and full action-kind coverage', () => {
    for (const seed of SEEDS) {
      const world = generateUiMappingWorld(seed);
      const types = world.bundle.types;
      expect(types.every(type => typeof type.name === 'string' && type.name), `seed ${seed} authored names`).toBe(true);
      expect(types.some(type => type.identifier), `seed ${seed} identifier flag`).toBe(true);
      expect(types.some(type => Object.values(type.fields).some(field => field.control)), `seed ${seed} authored control`).toBe(true);
      const kinds = Object.values(world.contract.actions).map(action => action.actionKind);
      expect(kinds, `seed ${seed} runCommand`).toContain('runCommand');
      expect(kinds, `seed ${seed} unlink`).toContain('unlink');
    }
  });

  it('guarantees loaded parents with sized peer collections', () => {
    for (const seed of SEEDS) {
      const world = generateUiMappingWorld(seed);
      const pool = buildInstancePool(world.instances);
      const loaded = Object.values(world.contract.screens)
        .filter(screen => screen.template === 'instanceDetail')
        .some(screen => composeScreen(screen, world.contract, world.bundle, pool).regions
          .some(region => region.childRegions
            .filter(child => child.instances.length >= 2).length >= 2));
      expect(loaded, `seed ${seed} loaded parent`).toBe(true);
    }
  });

  it('guarantees the budget thresholds and data-state surfaces', () => {
    for (const seed of SEEDS) {
      const world = generateUiMappingWorld(seed);
      const pool = buildInstancePool(world.instances);
      // One large collection: virtualization (>50), pagination, toolbar search.
      expect(world.bundle.types.some(type => world.instances[type.id].length > 50), `seed ${seed} volume type`).toBe(true);
      // The guaranteed-empty type has a screen whose main region composes empty.
      const emptyScreen = Object.values(world.contract.screens).find(screen => screen.label?.endsWith('— empty state'));
      expect(emptyScreen, `seed ${seed} empty screen`).toBeTruthy();
      expect(composeScreen(emptyScreen, world.contract, world.bundle, pool).regions[0].dataState).toBe('empty');
      // The dangling-scope detail composes missing.
      const missingScreen = Object.values(world.contract.screens).find(screen => screen.screenKey.startsWith('detail_missing_'));
      expect(missingScreen, `seed ${seed} missing screen`).toBeTruthy();
      expect(composeScreen(missingScreen, world.contract, world.bundle, pool).regions[0].dataState).toBe('missing');
      // The seeded state matrix assigns only known states to existing sources.
      for (const [screenKey, states] of Object.entries(world.sourceStatesMatrix || {})) {
        const screen = world.contract.screens[screenKey];
        expect(screen, `seed ${seed} matrix screen ${screenKey}`).toBeTruthy();
        expect(Object.keys(states).length).toBeGreaterThan(0);
        for (const [sourceId, state] of Object.entries(states)) {
          expect(screen.sources.some(source => source.id === sourceId), `seed ${seed} matrix source ${sourceId}`).toBe(true);
          expect(['loading', 'denied', 'error']).toContain(state);
        }
      }
    }
  });
});
