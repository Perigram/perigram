import { describe, it, expect } from 'vitest';
import { checkValue, isRefDescriptor } from '#packages/cts';
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
            const value = isRefDescriptor(descriptor) ? instance.relations[name] : instance.fields[name];
            const errors = checkValue(descriptor, value);
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
        expect(composed.regions.length + composed.stubRegions.length, `seed ${seed} ${screen.screenKey}`).toBeGreaterThan(0);
        if (screen.template === 'instanceDetail') {
          const main = composed.regions[0];
          expect(main.surfaceKind).toBe('detail');
          expect(main.instances.length, `seed ${seed} ${screen.screenKey} main instance`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('carry valid data traits and a resolved arrangement at every width step on every composed node', () => {
    const BREADTHS = ['content', 'full'];
    const GROWTH = ['flowing', 'bounded'];
    const SHAPES = ['plain', 'media', 'temporal', 'prose', 'measure', 'stateful'];
    const MODES = ['stack', 'columns', 'mixed', 'tabs', 'side'];
    const STEPS = ['narrow', 'medium', 'wide'];
    const walk = (regions, visit) => {
      for (const region of regions) {
        visit(region);
        walk(region.childRegions || [], visit);
        walk(region.stubRegions || [], visit);
      }
    };
    // SPEC §22.17: the record page is a document — its depth-0 record
    // never engages the rail, columns, or tabs at any step, while list
    // screens keep the whole ladder.
    const listLadderOutcomes = new Set();
    for (const seed of SEEDS) {
      const world = generateUiMappingWorld(seed);
      const pool = buildInstancePool(world.instances);
      for (const screen of Object.values(world.contract.screens)) {
        const composed = composeScreen(screen, world.contract, world.bundle, pool);
        for (const step of STEPS) {
          listLadderOutcomes.add(composed.regionsArrangement[step].mode);
        }
        if (screen.template === 'instanceDetail') {
          const main = composed.regions.find(region => region.surfaceKind === 'detail');
          for (const step of STEPS) {
            expect(main.childArrangement[step], `seed ${seed} ${screen.screenKey} document@${step}`).toEqual({ mode: 'stack' });
          }
          expect(main.sideRail, `seed ${seed} ${screen.screenKey} sideRail`).toBe(null);
        }
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
          for (const step of STEPS) {
            expect(MODES, `seed ${seed} ${region.id} arrangement@${step}`).toContain(region.childArrangement[step].mode);
          }
          expect(region.childArrangement.wide.mode === 'side').toBe(Boolean(region.sideRail));
        });
      }
      // The screen's top-level sections resolve at every step too.
      for (const screen of Object.values(world.contract.screens)) {
        const composed = composeScreen(screen, world.contract, world.bundle, pool);
        for (const step of STEPS) {
          expect(MODES, `seed ${seed} ${screen.screenKey} sections@${step}`).toContain(composed.regionsArrangement[step].mode);
        }
      }
    }
    // List screens still reach the arranging outcomes: the ladder keeps
    // governing them (columns and tabs across the seeds' section sets).
    expect(listLadderOutcomes.has('columns') || listLadderOutcomes.has('tabs')).toBe(true);
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

  it('seeds a state matrix that assigns only known states to existing sources', () => {
    for (const seed of SEEDS) {
      const world = generateUiMappingWorld(seed);
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
