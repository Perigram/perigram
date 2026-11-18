import { describe, expect, it } from 'vitest';
import { templateTokenKeys, fillMarkdown } from './template-ir.mjs';

describe('Documents template token grammar', () => {
  it('discovers unique named tokens using the same grammar as substitution', () => {
    const source = '# {title}\\n{name} / {title} / {date.created}';
    expect(templateTokenKeys(source)).toEqual(['title', 'name', 'date.created']);
    expect(fillMarkdown(source, { title: 'Report', name: 'Ada', 'date.created': 'Today' }))
      .toBe('# Report\\nAda / Report / Today');
  });
});
