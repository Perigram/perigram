import { describe, expect, it } from 'vitest';
import { renderMarkdown, parseViewRef, splitViewEmbeds, parseInstanceHref, instanceHref } from './markdown.js';

// The markdown document contract: one render pipeline shared by the
// source editor and the read viewer — the text preview mode is markdown
// prose, so every consumer renders through this home. A view fence
// carries a saved-view or collection ref; the page surface splits the
// fences out and every other reader renders the pipeline's quiet
// placeholder.
describe('renderMarkdown', () => {
  it('renders nothing without a DOM (server)', () => {
    expect(renderMarkdown('# hi')).toBe('');
    expect(renderMarkdown('')).toBe('');
  });

  it('stays import-safe and empty server-side for mermaid fences', () => {
    expect(renderMarkdown('# t\n\n```mermaid\nflowchart LR\n  A --> B\n```\n')).toBe('');
  });
});

describe('parseViewRef', () => {
  it('parses a carried ref and refuses malformed bodies', () => {
    expect(parseViewRef('{"id":"v-1","name":"Walls"}')).toEqual({ id: 'v-1', name: 'Walls' });
    expect(parseViewRef('{"id":"v-1"}')).toEqual({ id: 'v-1', name: '' });
    expect(parseViewRef('{"typeId":"t-1","name":"Walls"}')).toEqual({ typeId: 't-1', name: 'Walls' });
    expect(parseViewRef('v-1')).toBeNull();
    expect(parseViewRef('{"name":"Walls"}')).toBeNull();
    expect(parseViewRef('[]')).toBeNull();
  });
});

describe('instance refs', () => {
  it('round-trips the instance link scheme', () => {
    const href = instanceHref('probe-note', 'id-1');
    expect(href).toBe('#instance:probe-note/id-1');
    expect(parseInstanceHref(href)).toEqual({ type: 'probe-note', id: 'id-1' });
    expect(parseInstanceHref('instance:probe-note/id-1')).toEqual({ type: 'probe-note', id: 'id-1' });
    expect(parseInstanceHref('https://example.com')).toBeNull();
    expect(parseInstanceHref('instance:missing')).toBeNull();
  });
});

describe('splitViewEmbeds', () => {
  const fence = (id, name) => '```view\n' + JSON.stringify({ id, name }) + '\n```';

  it('splits a document into markdown segments and view embeds', () => {
    const blocks = splitViewEmbeds(`# Notes\n\nintro\n\n${fence('v-1', 'Walls')}\n\noutro`);
    expect(blocks).toEqual([
      { type: 'markdown', text: '# Notes\n\nintro\n\n' },
      { type: 'view', id: 'v-1', name: 'Walls' },
      { type: 'markdown', text: '\n\noutro' }
    ]);
  });

  it('keeps a fence without a parseable ref as markdown', () => {
    const source = '```view\nnot-json\n```';
    expect(splitViewEmbeds(source)).toEqual([{ type: 'markdown', text: source }]);
  });

  it('carries consecutive and bare fences', () => {
    expect(splitViewEmbeds(fence('a', 'A'))).toEqual([{ type: 'view', id: 'a', name: 'A' }]);
    const pair = splitViewEmbeds(`${fence('a', 'A')}\n${fence('b', 'B')}`);
    expect(pair).toEqual([
      { type: 'view', id: 'a', name: 'A' },
      { type: 'view', id: 'b', name: 'B' }
    ]);
  });

  it('returns no blocks for an empty document', () => {
    expect(splitViewEmbeds('')).toEqual([]);
  });
});
