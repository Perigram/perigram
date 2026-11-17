export const FLOW_DOCUMENT_TYPE = 'text.flow-document';
export const REPORT_TYPE = 'document.report';

function badInput(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

export function exportMarkdown(document) {
  if (document?.type !== FLOW_DOCUMENT_TYPE || !Array.isArray(document.blocks)) {
    throw badInput(`export-markdown requires a ${FLOW_DOCUMENT_TYPE} value`);
  }
  return document.blocks.map(blockMarkdown).join('\n\n').trimEnd() + '\n';
}

export function blockMarkdown(block) {
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

export const DOCUMENT_BLOCK_TYPE = 'text.document-block';
export const INLINE_VALUE_TYPE = 'text.inline';
function inlineText(text) { return { type: 'text', text: String(text ?? '') }; }
function isSafeDocumentHref(value) {
  const href = String(value || '').trim();
  return Boolean(href && /^(https?:|mailto:|\/|#|\?)/i.test(href) && !href.startsWith('//'));
}
function isInlineValue(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
  if (node.type === 'text' || node.type === 'code') return typeof node.text === 'string';
  if (node.type === 'strong' || node.type === 'emphasis') return Array.isArray(node.children) && node.children.every(isInlineValue);
  if (node.type === 'link') return isSafeDocumentHref(node.href) && Array.isArray(node.children) && node.children.every(isInlineValue);
  return false;
}
function requireInlineList(value, label = 'children') {
  if (!Array.isArray(value) || value.some(node => !isInlineValue(node))) throw badInput(`${label} must be a list of document inline values`);
  return value;
}
export function createInlineValue(operationId, input = {}) {
  if (operationId === 'inline-text') return inlineText(input.text);
  if (operationId === 'inline-mark') {
    const mark = String(input.mark || '');
    if (!['strong', 'emphasis', 'code'].includes(mark)) throw badInput('inline-mark requires strong, emphasis, or code');
    if (mark === 'code') return { type: 'code', text: String(input.text ?? '') };
    return { type: mark, children: requireInlineList(input.children) };
  }
  if (operationId === 'inline-link') {
    const href = String(input.href || '').trim();
    if (!href || !/^(https?:|mailto:|\/|#|\?)/i.test(href) || href.startsWith('//')) throw badInput('inline-link requires a safe HTTP(S), mailto, local path, or fragment URL');
    return { type: 'link', href, children: requireInlineList(input.children) };
  }
  throw badInput(`Unsupported inline operation: ${operationId}`);
}
export function createDocumentBlock(operationId, input = {}) {
  const text = input.text == null ? '' : String(input.text);
  const children = input.children == null ? [inlineText(text)] : requireInlineList(input.children);
  switch (operationId) {
    case 'document-paragraph': return { type: 'paragraph', children };
    case 'document-heading': {
      const level = Number(input.level ?? 1);
      if (!Number.isInteger(level) || level < 1 || level > 6) throw badInput('document-heading level must be an integer from 1 to 6');
      return { type: 'heading', level, children };
    }
    case 'document-list': {
      const items = input.items ?? [];
      const inlineItems = input.inlineItems ?? [];
      if (!Array.isArray(items) || !Array.isArray(inlineItems) || (!items.length && !inlineItems.length)) {
        throw badInput('document-list requires text items or inline items');
      }
      if (inlineItems.some(item => !isInlineValue(item))) {
        throw badInput('document-list inlineItems must contain text.inline values');
      }
      return {
        type: 'list',
        ordered: input.ordered === true,
        items: [
          ...items.map(item => Array.isArray(item) ? requireInlineList(item, 'list item') : [inlineText(item)]),
          ...inlineItems.map(item => [structuredClone(item)])
        ]
      };
    }
    case 'document-table':
      if (!Array.isArray(input.rows) || input.rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw badInput('document-table requires a list of row records');
      return { type: 'table', rows: input.rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, String(value ?? '')]))) };
    case 'document-quote':
      if (!Array.isArray(input.blocks) || input.blocks.some(block => !isDocumentBlock(block))) throw badInput('document-quote requires a list of document blocks');
      return { type: 'blockquote', blocks: input.blocks.map(block => structuredClone(block)) };
    case 'document-code-block': return { type: 'code-block', ...(input.language ? { language: String(input.language) } : {}), text };
    case 'document-divider': return { type: 'horizontal-rule' };
    default: throw badInput(`Unsupported document block operation: ${operationId}`);
  }
}
export function composeDocument({ title, blocks } = {}) {
  if (!Array.isArray(blocks) || blocks.some(block => !isDocumentBlock(block))) throw badInput('compose-document requires a list of text.document-block values');
  return { type: FLOW_DOCUMENT_TYPE, schemaVersion: 1, ...(title ? { title: String(title) } : {}), blocks: blocks.map(block => structuredClone(block)) };
}
export function appendDocumentBlock(document, block) {
  requireFlowDocument(document);
  if (!isDocumentBlock(block)) throw badInput('append-document-block requires a text.document-block value');
  return { ...structuredClone(document), blocks: [...document.blocks, structuredClone(block)] };
}
export function isDocumentBlock(block) {
  if (!block || typeof block !== 'object' || Array.isArray(block)) return false;
  switch (block.type) {
    case 'paragraph': return Array.isArray(block.children) && block.children.every(isInlineValue);
    case 'heading': return Number.isInteger(block.level) && block.level >= 1 && block.level <= 6 && Array.isArray(block.children) && block.children.every(isInlineValue);
    case 'list': return typeof block.ordered === 'boolean' && Array.isArray(block.items) && block.items.every(item => Array.isArray(item) && item.every(isInlineValue));
    case 'blockquote': return Array.isArray(block.blocks) && block.blocks.every(isDocumentBlock);
    case 'code-block': return typeof block.text === 'string';
    case 'table': return Array.isArray(block.rows) && block.rows.every(row => row && typeof row === 'object' && !Array.isArray(row));
    case 'horizontal-rule': return true;
    default: return false;
  }
}
export function renderDocumentHtml(document) {
  requireFlowDocument(document);
  return renderReportHtml({ type: REPORT_TYPE, ...(document.title ? { title: document.title } : {}), sections: [{ id: 'document', blocks: [{ type: 'flow', document }] }] });
}

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

export function requireReport(report) {
  if (report?.type !== REPORT_TYPE || !Array.isArray(report.sections)) {
    throw badInput(`this operation requires a ${REPORT_TYPE} value`);
  }
  return report;
}

function requireFlowDocument(document) {
  if (document?.type !== FLOW_DOCUMENT_TYPE || !Array.isArray(document.blocks) || document.blocks.some(block => !isDocumentBlock(block))) {
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
      case 'link': {
        const href = safeHref(node.href);
        return href ? `<a href="${escapeHtml(href)}">${inlineHtml(node.children)}</a>` : inlineHtml(node.children);
      }
      default: return escapeHtml(node.text ?? '');
    }
  }).join('');
}

function safeHref(value) {
  const href = String(value || '').trim();
  if (href.toLowerCase().startsWith('https://')
    || href.toLowerCase().startsWith('http://')
    || /^mailto:/i.test(href)) return href;
  if ((href.startsWith('/') && !href.startsWith('//'))
    || href.startsWith('#') || href.startsWith('?')) return href;
  return '';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

