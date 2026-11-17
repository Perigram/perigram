import { describe, expect, it, vi } from 'vitest';
import createSurface, { documentsOf } from './report-preview.mjs';

describe('Documents graph preview channel', () => {
  it('renders flowing documents and reports from unified graph execution envelopes', () => {
    const document = { type: 'text.flow-document', schemaVersion: 1, blocks: [] };
    const report = { type: 'document.report', schemaVersion: 1, sections: [] };
    const block = { type: 'paragraph', children: [] };
    const file = { payload: { mime: 'text/markdown', base64: 'IyBIZWxsbw==' } };

    const htmlFile = { payload: { mime: 'text/html', base64: 'PGgxPkhlbGxvPC9oMT4=', name: 'hello.html' } };
    expect(documentsOf({
      selectedOutput: { id: 'document', value: document },
      outputs: { document, report },
      nodeOutputs: {
        paragraph: { value: block },
        compose: { value: document },
        report: { value: report },
        export: { value: file },
        html: { value: htmlFile }
      }
    })).toEqual([document, report, file, htmlFile]);
  });

  it.each([
    ['text/markdown', '# Hello', 'hello.md'],
    ['text/html', '<h1>Hello</h1>', 'hello.html']
  ])('renders %s file payloads through the host sanitizer in a sandbox', (mime, source, name) => {
    const renderMarkdown = vi.fn(() => '<h1>Sanitized</h1>');
    const h = (type, props, children) => ({ type, props: props || {}, children });
    const component = createSurface({ vue: { h }, renderMarkdown });
    const file = {
      payload: {
        mime,
        name,
        base64: Buffer.from(source).toString('base64')
      }
    };
    const tree = component.render.call({
      payload: { selectedOutput: { id: 'file', value: file } }
    });
    const section = tree.children[0];
    const iframe = section.children.find(child => child.type === 'iframe');
    expect(renderMarkdown).toHaveBeenCalledWith(source);
    expect(iframe.props).toMatchObject({
      sandbox: '',
      referrerpolicy: 'no-referrer'
    });
    expect(iframe.props.srcdoc).toContain('<h1>Sanitized</h1>');
    expect(iframe.props.srcdoc).toContain("default-src 'none'");
  });

  it('retains the legacy branch-tree preview envelope', () => {
    const report = { type: 'document.report', sections: [] };
    const document = { type: 'text.flow-document', blocks: [] };
    expect(documentsOf({
      nodes: {
        node: {
          outputs: {
            value: { branches: [{ items: [report, document] }] }
          }
        }
      }
    })).toEqual([report, document]);
  });
});
