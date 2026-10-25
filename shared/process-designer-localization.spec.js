import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const locale = name => JSON.parse(readFileSync(new URL(`../i18n/locales/${name}.json`, import.meta.url), 'utf8'));

describe('process designer hard-cut localization', () => {
  it('keeps the retained palette translated in every locale', () => {
    for (const name of ['en', 'ru']) {
      const copy = locale(name).processDesigner;
      expect(copy.paletteGroups.control).toBeTruthy();
      expect(copy.paletteItems.allEntities).toBeTruthy();
      expect(copy.paletteItems.choosePath).toBeTruthy();
      expect(copy.paletteItems.switchPaths).toBeTruthy();
      expect(copy.paletteItems.parallelPaths).toBeTruthy();
      expect(copy.paletteItems.joinAllPaths).toBeTruthy();
      expect(copy.paletteItems.joinAnyPaths).toBeTruthy();
      expect(copy.paletteItems.finish).toBeTruthy();
      expect(copy.paletteItems.fail).toBeTruthy();
    }
  });
});
