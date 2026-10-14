import DOMPurify from 'dompurify';
import { marked } from 'marked';

// The markdown document contract: detection and rendering live here and
// nowhere else. The payload IS the text, so the source editor and the
// read viewer share one pipeline — source in, sanitized HTML out —
// instead of each carrying its own marked+DOMPurify copy.

// A stored file is a markdown document by its declared mime or its
// filename; the read viewer and both editor hosts decide through this.
export function isMarkdownDocument({ mimeType = '', name = '' } = {}) {
  return mimeType === 'text/markdown' || /\.md$/i.test(name || '');
}

// Markdown source to sanitized HTML. Server-side there is no DOM, so the
// render is the empty string there — the module stays import-safe in
// Node (the render dependencies only run behind the window guard).
export function renderMarkdown(source = '') {
  if (!source || typeof window === 'undefined') return '';
  return DOMPurify.sanitize(marked.parse(source));
}
