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
    const documentsListing = (await import('../workers/documents/listing.json', { with: { type: 'json' } })).default;
    const documentsTypes = documentsListing.declarations.types;
    const techDrawingListing = (await import('../workers/tech-drawing/listing.json', { with: { type: 'json' } })).default;
    const techDrawingTypes = techDrawingListing.declarations.types;
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

  it('keeps the generated palette module in sync with the font CSS', async () => {
    const { iconFontGlyphs } = await import('../shared/icon-fonts.js');
    const css = readFileSync('assets/css/main.css', 'utf8');
    const escape = token => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    expect(new Set(iconFontGlyphs).size).toBe(iconFontGlyphs.length);
    for (const glyph of iconFontGlyphs) {
      const [base, glyphClass] = glyph.split(/\s+/);
      expect(glyph, `"${glyph}" must be a "base class" pair`).toMatch(/^ck-[\w-]+ ck-[\w-]+$/);
      expect(css, `palette entry "${glyphClass}" has no ::before rule — rerun npm run icons:build`)
        .toMatch(new RegExp(`\\.${escape(glyphClass)}::before`));
      expect(css, `palette entry base "${base}" has no family rule`)
        .toMatch(new RegExp(`\\.${escape(base)}\\s*\\{`));
    }
    const cssGlyphClasses = [...css.matchAll(/\.((?:ck-)[\w-]+)::before/g)].map(match => match[1]);
    const moduleGlyphClasses = iconFontGlyphs.map(glyph => glyph.split(/\s+/)[1]);
    expect(cssGlyphClasses.sort(), 'the CSS carries glyph classes the palette module does not list')
      .toEqual(moduleGlyphClasses.sort());
  });
});
