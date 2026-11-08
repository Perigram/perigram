import { iconFontGlyphs } from '#shared/icon-fonts.js';
import { primeiconGlyphs } from '#shared/primeicons.js';

function glyphOption(value) {
  const className = value.split(/\s+/).at(-1);
  const label = className
    .replace(/^pi-/, '')
    .replace(/^ck-entity-icon-/, '')
    .replace(/^ck-file-type-icon-/, '')
    .replace(/-/g, ' ');
  return { value, label, search: `${label} ${value}`.toLowerCase() };
}

export const classGlyphOptions = Object.freeze([
  { value: '', label: '', search: '' },
  ...primeiconGlyphs.map(glyphOption),
  ...iconFontGlyphs.map(glyphOption)
]);
