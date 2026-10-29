import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { render as renderMermaidDiagram } from 'pele';

// The markdown document contract: detection and rendering live here and
// nowhere else. The payload IS the text, so the source editor and the
// read viewer share one pipeline — source in, sanitized HTML out —
// instead of each carrying its own marked+DOMPurify copy.

// A stored file is a markdown document by its declared mime or its
// filename; the read viewer and both editor hosts decide through this.
export function isMarkdownDocument({ mimeType = '', name = '' } = {}) {
  return mimeType === 'text/markdown' || /\.md$/i.test(name || '');
}

// Mermaid fences render as diagrams (owner direction 2026-10-17): pele
// turns the fence source into an inline SVG inside the pipeline output,
// so every markdown reader (agent answers, chat and file previews)
// inherits diagrams from one hook. A fence pele cannot parse falls back
// to the plain code block; pele's own escaping and size limits run
// before DOMPurify sees the document.
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
      if (lang !== 'mermaid') return plainCodeBlock(code, lang, escaped);
      try {
        const { svg } = renderMermaidDiagram(String(code).replace(/\n$/, ''));
        return `<div class="mermaid-diagram">${svg}</div>\n`;
      } catch {
        return plainCodeBlock(code, lang, escaped);
      }
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

// The markdown body element recipe: the class string every surface that
// mounts the pipeline's sanitized HTML (agent answers, file payload
// previews) puts on the HTML host. One recipe, one home — a surface
// composing its own element styles over pipeline output is a defect.
export const MARKDOWN_ELEMENT_CLASSES = [
  '[&_>*:first-child]:mt-0 [&_>*:last-child]:mb-0',
  '[&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_blockquote]:my-2 [&_table]:my-2 [&_pre]:my-2',
  '[&_h1]:mt-3 [&_h2]:mt-3 [&_h3]:mt-3 [&_h4]:mt-3',
  '[&_h1]:mb-1.5 [&_h2]:mb-1.5 [&_h3]:mb-1.5 [&_h4]:mb-1.5',
  '[&_h1]:text-editor [&_h2]:text-editor',
  '[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-0.5',
  '[&_hr]:my-3 [&_hr]:border-chrome-border',
  '[&_code]:text-technical [&_code]:bg-subtle [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded',
  '[&_pre]:text-technical [&_pre]:bg-subtle [&_pre]:p-3 [&_pre]:rounded-ui [&_pre]:overflow-x-auto',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_blockquote]:border-l-2 [&_blockquote]:border-chrome-border [&_blockquote]:pl-3',
  '[&_table]:w-full [&_table]:border-collapse',
  '[&_th]:border [&_th]:border-chrome-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:align-top [&_th]:bg-subtle',
  '[&_td]:border [&_td]:border-chrome-border [&_td]:px-2 [&_td]:py-1 [&_td]:text-left [&_td]:align-top',
  '[&_a]:underline [&_img]:max-w-full'
].join(' ');
