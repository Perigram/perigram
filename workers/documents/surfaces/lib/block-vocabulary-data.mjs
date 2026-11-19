// The block vocabulary every markdown authoring surface offers: the
// slash panel, the document gutter's insert menu, and the toolbar-free
// editor surfaces. Entry ids are the apply ids in block-vocabulary.mjs.
export const BLOCK_VOCABULARY = [
  { id: 'paragraph', labelKey: 'editors.paragraph', glyph: 'pi pi-align-left', match: ['text', 'paragraph', 'p'], insertable: true },
  { id: 'h1', labelKey: 'editors.heading1', glyphText: 'H1', match: ['h1', 'heading1', 'heading'], insertable: true },
  { id: 'h2', labelKey: 'editors.heading2', glyphText: 'H2', match: ['h2', 'heading2', 'heading'], insertable: true },
  { id: 'h3', labelKey: 'editors.heading3', glyphText: 'H3', match: ['h3', 'heading3', 'heading'], insertable: true },
  { id: 'h4', labelKey: 'editors.heading4', glyphText: 'H4', match: ['h4', 'heading4', 'heading'], insertable: true },
  { id: 'h5', labelKey: 'editors.heading5', glyphText: 'H5', match: ['h5', 'heading5', 'heading'], insertable: true },
  { id: 'h6', labelKey: 'editors.heading6', glyphText: 'H6', match: ['h6', 'heading6', 'heading'], insertable: true },
  { id: 'bullet', labelKey: 'editors.bulletList', glyph: 'pi pi-list', match: ['bullet', 'list', 'ul'], insertable: true },
  { id: 'ordered', labelKey: 'editors.numberedList', glyph: 'pi pi-list-check', match: ['ordered', 'numbered', 'ol'], insertable: true },
  { id: 'todo', labelKey: 'editors.todo', glyph: 'pi pi-check-square', match: ['todo', 'task', 'check'], insertable: true },
  { id: 'quote', labelKey: 'editors.quote', glyph: 'pi pi-comment', match: ['quote', 'blockquote'], insertable: true },
  { id: 'callout', labelKey: 'editors.callout', glyph: 'pi pi-info-circle', match: ['callout', 'note'], insertable: true },
  { id: 'codeblock', labelKey: 'editors.codeBlock', glyph: 'pi pi-code', match: ['code', 'codeblock'], insertable: true },
  { id: 'image', labelKey: 'editors.image', glyph: 'pi pi-image', match: ['image', 'picture', 'photo'], insertable: true },
  { id: 'file', labelKey: 'editors.file', glyph: 'pi pi-paperclip', match: ['file', 'attachment'], insertable: true },
  { id: 'diagram', labelKey: 'editors.diagram', glyph: 'pi pi-sitemap', match: ['diagram', 'mermaid', 'graph'], insertable: true },
  { id: 'divider', labelKey: 'editors.divider', glyph: 'pi pi-minus', match: ['divider', 'hr', 'line'], insertable: true },
  { id: 'table', labelKey: 'editors.table', glyph: 'pi pi-table', match: ['table'], insertable: true },
  { id: 'instance', labelKey: 'editors.instance', glyph: 'pi pi-at', match: ['instance', 'ref', 'mention'], insertable: true },
  { id: 'link', labelKey: 'editors.link', glyph: 'pi pi-link', match: ['link', 'url'], insertable: false },
  { id: 'view', labelKey: 'editors.collectionView', glyph: 'pi pi-objects-column', match: ['view', 'collection'], insertable: true },
  { id: 'reference', labelKey: 'editors.linkToRecord', glyph: 'pi pi-link', match: ['reference', 'record', 'ref'], insertable: true },
  { id: 'graph-output', labelKey: 'editors.graphResult', glyph: 'pi pi-sitemap', match: ['graph', 'result', 'output'], insertable: true }
];
