import { describe, expect, it } from 'vitest';
import { blocksFromMarkdown, normalizePageDocument } from './page-document.js';

describe('page document', () => {
  it('splits markdown into ordered text and view blocks', () => {
    const document = blocksFromMarkdown('Intro\n\n```view\n{"typeId":"widget","name":"Widgets"}\n```\n\nOutro\n');
    expect(document.blocks.map(block => block.kind)).toEqual(['text', 'view', 'text']);
    expect(document.order).toEqual(document.blocks.map(block => block.id));
    expect(document.blocks[1].view).toMatchObject({ typeId: 'widget', name: 'Widgets' });
  });

  it('keeps only ordered, known blocks and appends missing order entries', () => {
    const document = normalizePageDocument({
      blocks: [
        { id: 'a', kind: 'text', text: 'A' },
        { id: 'b', kind: 'view', view: { typeId: 'w', name: 'W' } },
        { id: 'c', kind: 'text', text: 'C' }
      ],
      order: ['b', 'missing', 'b']
    });
    expect(document.order).toEqual(['b', 'a', 'c']);
    expect(document.blocks).toHaveLength(3);
  });
});
