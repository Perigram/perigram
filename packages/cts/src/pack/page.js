// The default Page class (SPEC §27): custom pages and their sidebar
// sections are Page instances carrying markdown block source. The pages
// feature seeds this organization type and owns the instance surface.
export const PAGE_TYPE_ID = 'page';

export const pageTypeDeclaration = Object.freeze({
  id: PAGE_TYPE_ID,
  class: 'item',
  version: 1,
  name: 'Page',
  glyph: 'pi pi-file',
  fields: {
    name: { base: 'string', identifier: true },
    content: { base: 'string', nullable: true },
    section: { base: 'boolean' },
    classTypeId: { base: 'string', nullable: true }
  },
  edges: {
    children: {
      pages: { types: [PAGE_TYPE_ID], lineageKey: 'pageId', onRemove: 'detach' }
    }
  }
});
