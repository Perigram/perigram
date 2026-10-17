import { describe, expect, it } from 'vitest';
import { isMarkdownDocument, renderMarkdown } from './markdown.js';

// The markdown document contract: one detection home and one render
// pipeline shared by the source editor and the read viewer — pinned here
// so the mime/filename rule cannot drift between its consumers.
describe('isMarkdownDocument', () => {
  it('matches the markdown mime regardless of filename', () => {
    expect(isMarkdownDocument({ mimeType: 'text/markdown', name: 'notes.txt' })).toBe(true);
    expect(isMarkdownDocument({ mimeType: 'text/markdown' })).toBe(true);
  });

  it('matches .md filenames regardless of mime', () => {
    expect(isMarkdownDocument({ mimeType: 'text/plain', name: 'notes.md' })).toBe(true);
    expect(isMarkdownDocument({ name: 'NOTES.MD' })).toBe(true);
  });

  it('rejects plain text and empty descriptors', () => {
    expect(isMarkdownDocument({ mimeType: 'text/plain', name: 'notes.txt' })).toBe(false);
    expect(isMarkdownDocument({})).toBe(false);
    expect(isMarkdownDocument()).toBe(false);
  });
});

describe('renderMarkdown', () => {
  it('renders nothing without a DOM (server)', () => {
    expect(renderMarkdown('# hi')).toBe('');
    expect(renderMarkdown('')).toBe('');
  });

  it('stays import-safe and empty server-side for mermaid fences', () => {
    expect(renderMarkdown('# t\n\n```mermaid\nflowchart LR\n  A --> B\n```\n')).toBe('');
  });
});
