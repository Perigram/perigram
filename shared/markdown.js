import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { render as renderMermaidDiagram } from 'pele';

// The markdown document contract: rendering lives here and nowhere else.
// The `text` preview mode is markdown prose, so the source editor and the
// read viewer share one pipeline — source in, sanitized HTML out.

// Mermaid fences render as diagrams (owner direction 2026-10-17): pele
// turns the fence source into an inline SVG inside the pipeline output,
// so every markdown reader (agent answers, chat and file previews)
// inherits diagrams from one hook. A fence pele cannot parse falls back
// to the plain code block; pele's own escaping and size limits run
// before DOMPurify sees the document.

// View fences carry a saved-view ref (SPEC §26): `{"id":"…","name":"…"}`
// as the fence body. The pipeline renders the ref as a quiet chip naming
// the view; the custom-page read composition splits view fences out and
// mounts the live collection region in their place (splitViewEmbeds
// below).
export function parseViewRef(text = '') {
  try {
    const parsed = JSON.parse(String(text).trim());
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (typeof parsed.id !== 'string' || !parsed.id.trim()) return null;
    return { id: parsed.id, name: typeof parsed.name === 'string' ? parsed.name : '' };
  } catch {
    return null;
  }
}

// Split a markdown document into markdown segments and view-embed
// blocks: the page surface's read composition. A fence whose body is no
// parseable ref stays markdown (the code block renders verbatim).
export function splitViewEmbeds(source = '') {
  const blocks = [];
  let text = '';
  for (const token of marked.lexer(String(source || ''))) {
    if (token.type === 'code' && String(token.lang || '').trim() === 'view') {
      const ref = parseViewRef(token.text);
      if (ref) {
        if (text) blocks.push({ type: 'markdown', text });
        text = '';
        blocks.push({ type: 'view', ...ref });
        continue;
      }
    }
    text += token.raw;
  }
  if (text) blocks.push({ type: 'markdown', text });
  return blocks;
}

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const plainCodeBlock = (code, lang = '', escaped = false) => {
  const body = `${String(code).replace(/\n$/, '')}\n`;
  const safe = escaped ? body : escapeHtml(body);
  return lang
    ? `<pre><code class="language-${escapeHtml(lang)}">${safe}</code></pre>\n`
    : `<pre><code>${safe}</code></pre>\n`;
};

marked.use({
  renderer: {
    code(code, infostring, escaped) {
      const lang = String(infostring || '').match(/^\S*/)?.[0] || '';
      if (lang === 'mermaid') {
        try {
          const { svg } = renderMermaidDiagram(String(code).replace(/\n$/, ''));
          return `<div class="mermaid-diagram">${svg}</div>\n`;
        } catch {
          return plainCodeBlock(code, lang, escaped);
        }
      }
      if (lang === 'view') {
        const ref = parseViewRef(code);
        // The static placeholder names the view; an id-only ref keeps
        // the code block (ids never render, and the pipeline owns no
        // store to resolve the name).
        if (ref?.name) return `<div class="ck-view-embed">${escapeHtml(ref.name)}</div>\n`;
      }
      return plainCodeBlock(code, lang, escaped);
    }
  }
});

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

// The markdown body element recipe: `ck-markdown-body`, the named
// global stylesheet recipe (assets/css/main.css) carrying the markdown
// editor's reading typography. One recipe, one home — every surface
// that mounts the pipeline's sanitized HTML (agent answers, file
// payload previews) wears it and reads like the editor.
export const MARKDOWN_ELEMENT_CLASSES = 'ck-markdown-body';

// The card-band modifier: bounded card media (tiles, thumbs, peeks)
// read the pipeline's HTML at compact scale.
export const MARKDOWN_COMPACT_CLASS = 'ck-markdown-body--compact';
