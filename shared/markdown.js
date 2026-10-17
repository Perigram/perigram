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
// Parsed as GFM with line breaks: a single newline is a hard break, the
// way GitHub-flavored documents and model answers read — strict
// CommonMark would glue those lines into one paragraph.
export function renderMarkdown(source = '') {
  if (!source || typeof window === 'undefined') return '';
  return DOMPurify.sanitize(marked.parse(source, { gfm: true, breaks: true }));
}
