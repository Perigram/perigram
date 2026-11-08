import { iconFontGlyphs } from '#shared/icon-fonts.js';

const CURATED = Object.freeze([
  'pi pi-users', 'pi pi-file', 'pi pi-box', 'pi pi-folder', 'pi pi-cog',
  'pi pi-image', 'pi pi-tag', 'pi pi-map-marker', 'pi pi-calendar', 'pi pi-book'
]);

export const classGlyphOptions = Object.freeze([
  { label: '', value: '' },
  ...CURATED.map(value => ({ label: value, value })),
  ...iconFontGlyphs.map(value => ({ label: value, value }))
]);
