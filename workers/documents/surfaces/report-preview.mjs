// The Documents preview channel renders flowing-document and report values
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
      return h('div', { class: 'flex flex-col gap-6' }, values.map((value, index) => value.type === 'text.flow-document' ? renderDocument(value, index) : renderReport(value, index)));
    }
  };
}

// Document/report values in node and branch order; the IR discriminator selects the renderer.
export function documentsOf(payload) {
  const found = [];
  const seen = new Set();
  const add = value => {
    if (!value || !['text.flow-document', 'document.report'].includes(value.type) || seen.has(value)) return;
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
