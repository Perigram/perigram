// The default Page class (SPEC §27): custom pages and their sidebar
// sections are Page instances carrying an ordered block document. The
// pages feature seeds this organization type and owns the instance surface.
export const PAGE_TYPE_ID = 'page';

export const pageTypeDeclaration = Object.freeze({
  id: PAGE_TYPE_ID,
  class: 'item',
  version: 2,
  name: 'Page',
  glyph: 'pi pi-file',
  fields: {
    name: { base: 'string', identifier: true },
    blocks: { base: 'list', itemType: { base: 'json', nullable: true }, nullable: true },
    order: { base: 'list', itemType: { base: 'string' }, nullable: true },
    section: { base: 'boolean' },
    classTypeId: { base: 'string', nullable: true }
  },
  migrate: [
    { kind: 'remove-field', field: 'content' }
  ],
  edges: {
    children: {
      pages: { types: [PAGE_TYPE_ID], lineageKey: 'pageId', onRemove: 'detach' }
    }
  }
});
