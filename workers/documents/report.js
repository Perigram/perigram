// The document IR adapters for the report vertical (HAG over the one
// graph): markdown ↔ `text.flow-document@1`, `document.report@1`
// composition, and the report's export representations. Pure value
// code — the IR contracts live in this worker's README.
import { marked } from 'marked';
import { renderPdfFromMarkdown } from './fill.js';

export const FLOW_DOCUMENT_TYPE = 'text.flow-document';
export const REPORT_TYPE = 'document.report';

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

export function exportMarkdown(document) {
  if (document?.type !== FLOW_DOCUMENT_TYPE || !Array.isArray(document.blocks)) {
    throw badInput(`export-markdown requires a ${FLOW_DOCUMENT_TYPE} value`);
  }
  return document.blocks.map(blockMarkdown).join('\n\n').trimEnd() + '\n';
}

function blockMarkdown(block) {
  switch (block.type) {
    case 'heading':
      return `${'#'.repeat(Math.min(6, Math.max(1, block.level || 1)))} ${inlineMarkdown(block.children)}`;
    case 'paragraph':
      return inlineMarkdown(block.children);
    case 'list':
      return block.items
        .map((item, index) => `${block.ordered ? `${index + 1}.` : '-'} ${inlineMarkdown(item)}`)
        .join('\n');
    case 'blockquote':
      return block.blocks.map(blockMarkdown).join('\n\n').split('\n').map(line => `> ${line}`).join('\n');
    case 'code-block':
      return `\`\`\`${block.language || ''}\n${block.text}\n\`\`\``;
    case 'table': {
      const columns = [...new Set((block.rows || []).flatMap(row => Object.keys(row)))];
      if (!columns.length) return '';
      const line = cells => `| ${cells.join(' | ')} |`;
      return [
        line(columns),
        line(columns.map(() => '---')),
        ...(block.rows || []).map(row => line(columns.map(column => String(row[column] ?? ''))))
      ].join('\n');
    }
    case 'horizontal-rule':
      return '---';
    default:
      throw badInput(`export-markdown cannot serialize block type ${block.type}`);
  }
}

function inlineMarkdown(nodes = []) {
  return nodes.map(node => {
    switch (node.type) {
      case 'text': return node.text;
      case 'strong': return `**${inlineMarkdown(node.children)}**`;
      case 'emphasis': return `*${inlineMarkdown(node.children)}*`;
      case 'code': return `\`${node.text}\``;
      case 'link': return `[${inlineMarkdown(node.children)}](${node.href})`;
      default: return '';
    }
  }).join('');
}

// One report over the composed inputs: the flow document renders as the
// section's content, the row records as its table. Inputs keep their
// kinds — an implicit parse or extraction at compose time would hide the
// graph's own operations.
export function composeReport({ title, sectionTitle, flow, rows } = {}) {
  const sections = [];
  if (flow !== undefined && flow !== null) {
    if (flow?.type !== FLOW_DOCUMENT_TYPE || !Array.isArray(flow.blocks)) {
      throw badInput(`compose-report flow input requires a ${FLOW_DOCUMENT_TYPE} value`);
    }
    sections.push({
      id: 'content',
      ...(sectionTitle ? { title: String(sectionTitle) } : {}),
      blocks: [{ type: 'flow', document: flow }]
    });
  }
  if (rows !== undefined && rows !== null) {
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
      throw badInput('compose-report rows input requires a list of row records');
    }
    const table = { type: 'table', rows };
    const existing = sections.find(section => section.id === 'content');
    if (existing) existing.blocks.push(table);
    else sections.push({ id: 'content', ...(sectionTitle ? { title: String(sectionTitle) } : {}), blocks: [table] });
  }
  if (!sections.length) {
    throw badInput('compose-report requires a flow document or row records');
  }
  return {
    type: REPORT_TYPE,
    schemaVersion: 1,
    ...(title ? { title: String(title) } : {}),
    sections
  };
}

function requireReport(report) {
  if (report?.type !== REPORT_TYPE || !Array.isArray(report.sections)) {
    throw badInput(`this operation requires a ${REPORT_TYPE} value`);
  }
  return report;
}

function requireFlowDocument(document) {
  if (document?.type !== FLOW_DOCUMENT_TYPE || !Array.isArray(document.blocks)) {
    throw badInput(`this operation requires a ${FLOW_DOCUMENT_TYPE} value`);
  }
  return document;
}

// The flow document's first table block as row records — the markdown
// table's path onto the table operations.
export function extractTable(document) {
  const flow = requireFlowDocument(document);
  const table = flow.blocks.find(block => block?.type === 'table' && Array.isArray(block.rows));
  if (!table) throw badInput('the flow document carries no table');
  return table.rows;
}

// The report as one standalone HTML document — a representation of the
// report, composed from escaped content.
export function renderReportHtml(report) {
  requireReport(report);
  const title = String(report.title || 'Report');
  const body = (report.sections || []).map(section => {
    const heading = section.title ? `  <h2>${escapeHtml(section.title)}</h2>\n` : '';
    const blocks = (section.blocks || []).map(block => `  ${htmlBlock(block)}`).join('\n');
    return `<section>\n${heading}${blocks}\n</section>`;
  }).join('\n');
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    '</head>',
    '<body>',
    `<h1>${escapeHtml(title)}</h1>`,
    body,
    '</body>',
    '</html>'
  ].join('\n');
}

function htmlBlock(block) {
  switch (block.type) {
    case 'flow':
      return (block.document?.blocks || []).map(htmlBlock).join('\n');
    case 'heading':
      return `<h${Math.min(6, Math.max(1, block.level || 1))}>${inlineHtml(block.children)}</h${Math.min(6, Math.max(1, block.level || 1))}>`;
    case 'paragraph':
      return `<p>${inlineHtml(block.children)}</p>`;
    case 'list': {
      const items = (block.items || []).map(item => `<li>${inlineHtml(item)}</li>`).join('');
      return block.ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`;
    }
    case 'blockquote':
      return `<blockquote>${(block.blocks || []).map(htmlBlock).join('\n')}</blockquote>`;
    case 'code-block':
      return `<pre><code>${escapeHtml(block.text ?? '')}</code></pre>`;
    case 'table': {
      const columns = [...new Set((block.rows || []).flatMap(row => Object.keys(row || {})))];
      if (!columns.length) return '';
      const head = `<tr>${columns.map(column => `<th>${escapeHtml(column)}</th>`).join('')}</tr>`;
      const rows = (block.rows || []).map(row => `<tr>${columns.map(column => `<td>${escapeHtml(String(row?.[column] ?? ''))}</td>`).join('')}</tr>`);
      return `<table>${head}${rows.join('')}</table>`;
    }
    case 'horizontal-rule':
      return '<hr>';
    default:
      return '';
  }
}

function inlineHtml(nodes = []) {
  return nodes.map(node => {
    switch (node.type) {
      case 'strong': return `<strong>${inlineHtml(node.children)}</strong>`;
      case 'emphasis': return `<em>${inlineHtml(node.children)}</em>`;
      case 'code': return `<code>${escapeHtml(node.text ?? '')}</code>`;
      case 'link': return `<a href="${escapeHtml(node.href || '')}">${inlineHtml(node.children)}</a>`;
      default: return escapeHtml(node.text ?? '');
    }
  }).join('');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

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
