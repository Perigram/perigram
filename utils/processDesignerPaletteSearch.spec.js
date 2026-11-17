import { describe, expect, it } from 'vitest';
import { matchesPaletteSearch } from './processDesignerPaletteSearch.js';

describe('process designer palette search', () => {
  const item = {
    id: 'plugin.documents:document.compose@2',
    kind: 'cts.service',
    label: 'Compose report',
    description: 'Create a report document',
    keywords: ['markdown', 'pdf'],
    searchTerms: ['plugin.documents', 'document.compose']
  };

  it('searches visible copy, stable operation identity, provider, group, and aliases', () => {
    for (const query of ['compose report', 'cts.service', 'document.compose', 'plugin.documents', 'document-compose', 'Document authoring', 'markdown']) {
      expect(matchesPaletteSearch(item, query, 'document-compose', 'Document authoring')).toBe(true);
    }
  });

  it('ignores surrounding whitespace and matches case-insensitively', () => {
    expect(matchesPaletteSearch(item, '  MARKDOWN  ')).toBe(true);
    expect(matchesPaletteSearch(item, 'missing')).toBe(false);
  });

  it('shows every item for an empty query', () => {
    expect(matchesPaletteSearch(item, '')).toBe(true);
    expect(matchesPaletteSearch(item, '   ')).toBe(true);
  });
});
