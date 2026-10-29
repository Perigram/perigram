import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown.js';

// The markdown document contract: one render pipeline shared by the
// source editor and the read viewer — the text preview mode is markdown
// prose, so every consumer renders through this home.
describe('renderMarkdown', () => {
  it('renders nothing without a DOM (server)', () => {
    expect(renderMarkdown('# hi')).toBe('');
    expect(renderMarkdown('')).toBe('');
  });

  it('stays import-safe and empty server-side for mermaid fences', () => {
    expect(renderMarkdown('# t\n\n```mermaid\nflowchart LR\n  A --> B\n```\n')).toBe('');
  });
});
