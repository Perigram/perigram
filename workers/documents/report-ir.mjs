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
  if (/^https?:\\/\\//i.test(href) || /^mailto:/i.test(href)) return href;
  if (/^(?:\\/(?!\\/)|#|\\?)/.test(href)) return href;
  return '';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

