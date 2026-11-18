import * as XLSX from '../assets/vendor/xlsx.mjs';

// The Documents preview channel renders flowing-document, report, and file values
// from the whole-graph evaluation. The host owns the preview workspace;
// this surface only renders the provider's read-only representations.
export default function createSurface(ctx) {
  const h = ctx?.vue?.h || (() => null);

  const safeHref = value => {
    const href = String(value || '').trim();
    return href && /^(https?:|mailto:|\/|#|\?)/i.test(href) && !href.startsWith('//') ? href : null;
  };

  const renderInline = nodes => (Array.isArray(nodes) ? nodes : []).map((node, index) => {
    if (node.type === 'strong') return h('strong', { key: index }, renderInline(node.children));
    if (node.type === 'emphasis') return h('em', { key: index }, renderInline(node.children));
    if (node.type === 'code') return h('code', { key: index }, node.text);
    if (node.type === 'link') {
      const href = safeHref(node.href);
      return href
        ? h('a', { key: index, href, target: '_blank', rel: 'noopener noreferrer' }, renderInline(node.children))
        : h('span', { key: index }, renderInline(node.children));
    }
    return h('span', { key: index }, typeof node.text === 'string' ? node.text : '');
  });

  const renderBlock = (block, key) => {
    if (!block || typeof block !== 'object') return null;
    if (block.type === 'flow') {
      return h('div', { key, class: 'flex flex-col gap-2' }, (block.document?.blocks || []).map(renderBlock));
    }
    if (block.type === 'heading') {
      return h(`h${Math.min(6, Math.max(1, block.level || 1))}`, { key }, renderInline(block.children));
    }
    if (block.type === 'paragraph') return h('p', { key }, renderInline(block.children));
    if (block.type === 'list') {
      const items = (block.items || []).map((item, index) => h('li', { key: index }, renderInline(item)));
      return h(block.ordered ? 'ol' : 'ul', { key }, items);
    }
    if (block.type === 'blockquote') return h('blockquote', { key }, (block.blocks || []).map(renderBlock));
    if (block.type === 'code-block') {
      return h('pre', { key }, [h('code', null, block.text)]);
    }
    if (block.type === 'horizontal-rule') return h('hr', { key });
    if (block.type === 'table') return renderTable(block, key);
    return null;
  };

  const renderTable = (block, key) => {
    const rows = Array.isArray(block.rows) ? block.rows.filter(row => row && typeof row === 'object' && !Array.isArray(row)) : [];
    const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
    if (!columns.length) return null;
    const head = h('thead', null, [h('tr', null, columns.map(column => h('th', { key: column }, column)))]);
    const body = h('tbody', null, rows.map((row, index) => h(
      'tr', { key: index }, columns.map(column => h('td', { key: column }, String(row?.[column] ?? '')))
    )));
    return h('table', { key }, [head, body]);
  };

  const renderDocument = (document, key) => h('article', { key, class: 'flex flex-col gap-3' }, [
    document.title ? h('h2', { key: 'title' }, document.title) : null,
    ...(document.blocks || []).map((block, index) => renderBlock(block, index))
  ].filter(Boolean));

  const renderWorkbookPayload = (bytes, name, key) => {
    let workbook;
    try { workbook = XLSX.read(bytes, { type: 'array' }); } catch {
      return h('div', { key, class: 'text-supporting text-muted' }, 'The workbook payload could not be opened');
    }
    const sheetName = workbook.SheetNames?.[0];
    const sheet = sheetName ? workbook.Sheets?.[sheetName] : null;
    if (!sheet) return h('div', { key, class: 'text-supporting text-muted' }, 'The workbook contains no worksheets');
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }).slice(0, 200);
    const columns = Math.min(30, Math.max(0, ...rows.map(row => row.length)));
    const head = rows[0] || [];
    const body = rows.slice(1);
    return h('section', { key, class: 'flex min-h-0 flex-col gap-2' }, [
      h('div', { class: 'text-supporting text-muted' }, `${name || 'Workbook'} · ${sheetName}`),
      h('div', { class: 'max-h-96 overflow-auto' }, [
        h('table', { class: 'w-full border-collapse text-supporting' }, [
          h('thead', null, [h('tr', null, Array.from({ length: columns }, (_, index) => (
            h('th', { key: index, class: 'border-b px-2 py-1 text-left' }, String(head[index] ?? ''))
          )))]),
          h('tbody', null, body.map((row, rowIndex) => h('tr', { key: rowIndex }, Array.from({ length: columns }, (_, columnIndex) => (
            h('td', { key: columnIndex, class: 'border-b px-2 py-1' }, String(row[columnIndex] ?? ''))
          )))))
        ])
      ]),
      rows.length > 200 ? h('div', { class: 'text-supporting text-muted' }, 'Showing the first 200 rows') : null
    ].filter(Boolean));
  };

  const renderFilePayload = (value, key) => {
    const payload = value?.payload || {};
    const mime = String(payload.mime || '');
    const isWorkbook = mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (!['text/markdown', 'text/html'].includes(mime) && !isWorkbook || typeof payload.base64 !== 'string') {
      return h('div', { key, class: 'text-supporting text-muted' }, [
        h('strong', null, payload.name || 'Document file'),
        h('p', null, mime || 'Unsupported document preview')
      ]);
    }
    let bytes;
    let source = '';
    try {
      const binary = atob(payload.base64);
      bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
      if (!isWorkbook) source = new TextDecoder().decode(bytes);
    } catch {
      return h('div', { key, class: 'text-supporting text-muted' }, 'The file payload could not be decoded');
    }
    if (isWorkbook) return renderWorkbookPayload(bytes, payload.name, key);
    if (typeof ctx?.renderMarkdown !== 'function') {
      return h('pre', { key, class: 'whitespace-pre-wrap break-words' }, source);
    }
    let sanitized = '';
    try { sanitized = String(ctx.renderMarkdown(source) || ''); } catch { sanitized = ''; }
    if (!sanitized) return h('pre', { key, class: 'whitespace-pre-wrap break-words' }, source);
    const csp = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none';";
    const srcdoc = '<!doctype html><meta http-equiv="Content-Security-Policy" content="' + csp + '">' + sanitized;
    return h('section', { key, class: 'flex min-h-0 flex-col gap-2' }, [
      h('div', { class: 'text-supporting text-muted' }, payload.name || mime),
      h('iframe', {
        title: payload.name || 'Document file preview',
        sandbox: '',
        referrerpolicy: 'no-referrer',
        srcdoc,
        class: 'min-h-64 h-96 w-full border-0 bg-white'
      })
    ]);
  };

  const renderReport = (report, key) => {
    const sections = (report.sections || []).flatMap((section, sectionIndex) => {
      const heading = section.title
        ? [h('h3', { key: `s${sectionIndex}` }, section.title)]
        : [];
      return [...heading, ...(section.blocks || []).map((block, index) => renderBlock(block, `${sectionIndex}-${index}`))];
    });
    return h('article', { key, class: 'flex flex-col gap-3' }, [
      report.title ? h('h2', { key: 'title' }, report.title) : null,
      ...sections
    ].filter(Boolean));
  };

  return {
    props: {
      record: { type: Object, default: null },
      payload: { type: Object, default: null }
    },
    render() {
      const values = documentsOf(this.payload);
      if (!values.length) return h('div');
      return h('div', { class: 'flex flex-col gap-6' }, values.map((value, index) => {
        if (value.type === 'text.flow-document') return renderDocument(value, index);
        if (value.type === 'document.report') return renderReport(value, index);
        return renderFilePayload(value, index);
      }));
    }
  };
}

// Document/report/file values in node and branch order; the value envelope selects the renderer.
export function documentsOf(payload) {
  const found = [];
  const seen = new Set();
  const add = value => {
    const isIr = value && ['text.flow-document', 'document.report'].includes(value.type);
    const isFile = value && value.payload && typeof value.payload.base64 === 'string'
      && ['text/markdown', 'text/html', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(value.payload.mime);
    if ((!isIr && !isFile) || seen.has(value)) return;
    seen.add(value);
    found.push(value);
  };

  add(payload?.selectedOutput?.value);
  for (const value of Object.values(payload?.outputs || {})) add(value);
  for (const node of Object.values(payload?.nodeOutputs || {})) {
    for (const value of Object.values(node || {})) add(value);
  }
  // Retain support for the branch-tree envelope used by older preview hosts.
  for (const node of Object.values(payload?.nodes || {})) {
    for (const tree of Object.values(node?.outputs || {})) {
      for (const branch of Array.isArray(tree?.branches) ? tree.branches : []) {
        for (const item of Array.isArray(branch?.items) ? branch.items : []) add(item);
      }
    }
  }
  return found;
}
