import { describe, expect, it } from 'vitest';
import { reconcileTemplateSectionDrafts, templateSectionState } from './template-section-drafts.js';

describe('template repeat-section drafts', () => {
  it('preserves an invalid draft in one section when another section changes', () => {
    const previous = templateSectionState(['items', 'notes'], {
      items: [{ name: 'A' }],
      notes: []
    });
    const next = templateSectionState(['items', 'notes'], {
      items: [{ name: 'A' }],
      notes: ['updated']
    });

    expect(reconcileTemplateSectionDrafts(next, previous, {
      items: '[{"name":',
      notes: '[]'
    }, { items: true, notes: false })).toEqual({
      drafts: { items: '[{"name":' },
      errors: { items: true }
    });
  });

  it('clears only the section whose committed value changed', () => {
    const previous = templateSectionState(['items', 'notes'], { items: [], notes: [] });
    const next = templateSectionState(['items', 'notes'], { items: [{ name: 'B' }], notes: [] });

    expect(reconcileTemplateSectionDrafts(next, previous, {
      items: '[{"name":"B"}]',
      notes: '[{"unfinished":'
    }, { items: false, notes: true })).toEqual({
      drafts: { notes: '[{"unfinished":' },
      errors: { notes: true }
    });
  });

  it('drops drafts for sections removed from the template metadata', () => {
    const previous = templateSectionState(['items', 'notes'], { items: [], notes: [] });
    const next = templateSectionState(['items'], { items: [] });

    expect(reconcileTemplateSectionDrafts(next, previous, {
      items: '[{"name":',
      notes: '[{"text":'
    }, { items: true, notes: true })).toEqual({
      drafts: { items: '[{"name":' },
      errors: { items: true }
    });
  });
});
