import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Icon-font drift guard: every `ck-*` glyph class a mounted pack type
// declares must resolve to a rule in the generated font blocks of
// assets/css/main.css (the build contract lives in scripts/README.md).
// A glyph naming a class no font carries renders a silent blank icon —
// this spec makes the drift a loud failure instead. PrimeIcons
// (`pi pi-*`) resolve from the primeicons package and are out of scope.
describe('Icon font glyph coverage', () => {
  it('resolves every mounted pack glyph class in the generated font CSS', async () => {
    const { documentsTypes } = await import('../packages/documents/src/index.js');
    const { techDrawingTypes } = await import('../packages/tech-drawing/src/index.js');
    const css = readFileSync('assets/css/main.css', 'utf8');
    const escape = token => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let checked = 0;

    for (const declaration of [...documentsTypes, ...techDrawingTypes]) {
      for (const token of String(declaration.glyph || '').split(/\s+/).filter(token => token.startsWith('ck-'))) {
        checked += 1;
        expect(css, `${declaration.id} glyph class "${token}" has no rule in the generated icon-font CSS`)
          .toMatch(new RegExp(`\\.${escape(token)}[{:\\s]`));
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
