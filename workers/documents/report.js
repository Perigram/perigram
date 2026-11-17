// The document IR adapters for the report vertical (HAG over the one
// graph): markdown ↔ `text.flow-document@1`, `document.report@1`
// composition, and the report's export representations. Pure value
// code — the IR contracts live in this worker's README.
import { marked } from 'marked';
import { FLOW_DOCUMENT_TYPE, requireReport, composeReport, extractTable, renderReportHtml, exportMarkdown, blockMarkdown } from './report-ir.mjs';
import { renderPdfFromMarkdown } from './fill.js';
export { composeReport, extractTable, renderReportHtml, exportMarkdown };

function flowDocument(blocks, diagnostics = []) {
  return {
    type: FLOW_DOCUMENT_TYPE,
    schemaVersion: 1,
    blocks,
    ...(diagnostics.length ? { diagnostics } : {})
  };
}

export function parseMarkdown(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw badInput('parse-markdown requires a non-empty text string');
  }
  const diagnostics = [];
  const document = flowDocument(blockTokens(marked.lexer(text), diagnostics), diagnostics);
  if (!document.blocks.length && !diagnostics.length) {
    throw badInput('parse-markdown found no content blocks');
  }
  return document;
}

function blockTokens(tokens = [], diagnostics) {
  const blocks = [];
  for (const token of tokens) {
    const block = blockOf(token, diagnostics);
    if (block) blocks.push(block);
  }
  return blocks;
}

function blockOf(token, diagnostics) {
  switch (token.type) {
    case 'heading':
      return { type: 'heading', level: token.depth || 1, children: inlineTokens(token.tokens, diagnostics) };
    case 'paragraph': {
      const inner = token.tokens || [];
      if (inner.length === 1 && inner[0].type === 'image') {
        diagnostics.push('UNSUPPORTED_IMAGE');
        return null;
      }
      return { type: 'paragraph', children: inlineTokens(inner, diagnostics) };
    }
    case 'list':
      return {
        type: 'list',
        ordered: Boolean(token.ordered),
        items: (token.items || []).map(item => inlineTokens(item.tokens, diagnostics))
      };
    case 'blockquote':
      return { type: 'blockquote', blocks: blockTokens(token.tokens, diagnostics) };
    case 'code':
      return { type: 'code-block', ...(token.lang ? { language: token.lang } : {}), text: token.text ?? '' };
    case 'hr':
      return { type: 'horizontal-rule' };
    case 'table': {
      const headers = (token.header || []).map(cell => inlineText(cell.tokens ?? [], cell.text ?? ''));
      const rows = (token.rows || []).map(row => Object.fromEntries(
        headers.map((header, index) => [header, inlineText(row[index]?.tokens ?? [], row[index]?.text ?? '')])
      ));
      return { type: 'table', rows };
    }
    case 'html':
      diagnostics.push('UNSUPPORTED_HTML');
      return null;
    default:
      return null;
  }
}

function inlineTokens(tokens = [], diagnostics) {
  const nodes = tokens.flatMap(token => inlineOf(token, diagnostics));
  return nodes.length ? nodes : [{ type: 'text', text: '' }];
}

function inlineOf(token, diagnostics) {
  switch (token.type) {
    // A text token may nest inline structure (smartypants, loose
    // emphasis): its children splice in place.
    case 'text':
      return token.tokens?.length
        ? inlineTokens(token.tokens, diagnostics)
        : [{ type: 'text', text: token.text ?? '' }];
    case 'strong':
      return [{ type: 'strong', children: inlineTokens(token.tokens, diagnostics) }];
    case 'em':
      return [{ type: 'emphasis', children: inlineTokens(token.tokens, diagnostics) }];
    case 'codespan':
      return [{ type: 'code', text: token.text ?? '' }];
    case 'link':
      return [{ type: 'link', href: token.href || '', children: inlineTokens(token.tokens, diagnostics) }];
    case 'br':
      return [{ type: 'text', text: '\n' }];
    case 'image':
      diagnostics.push('UNSUPPORTED_IMAGE');
      return [{ type: 'text', text: `![${token.text || ''}](${token.href || ''})` }];
    default:
      return [{ type: 'text', text: token.text ?? '' }];
  }
}

// Plain text of inline tokens (table cells keep their string value).
function inlineText(tokens, fallback) {
  const nodes = tokens.length ? inlineTokens(tokens, []) : null;
  if (!nodes) return String(fallback ?? '');
  return nodes.map(node => node.text ?? '').join('');
}

function badInput(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

// One report over the composed inputs: the flow document renders as the
// section's content, the row records as its table. Inputs keep their
// kinds — an implicit parse or extraction at compose time would hide the
// graph's own operations.
// The report as markdown text: sections assemble as headings, flow
// content, and tables — the assembly the PDF writer lays out and a
// plain-text representation in its own right.
export function reportMarkdown(report) {
  requireReport(report);
  const parts = [];
  if (report.title) parts.push(`# ${report.title}`);
  for (const section of report.sections) {
    if (section.title) parts.push(`## ${section.title}`);
    for (const block of section.blocks) {
      if (block.type === 'flow') parts.push(exportMarkdown(block.document).trimEnd());
      else if (block.type === 'table' && Array.isArray(block.rows)) {
        parts.push(blockMarkdown({ type: 'table', rows: block.rows }));
      }
    }
  }
  return parts.join('\n\n');
}

export async function renderReportPdf(report) {
  return await renderPdfFromMarkdown(reportMarkdown(report));
}
