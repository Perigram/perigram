import { describe, expect, it } from 'vitest';
import { documentsOf } from './report-preview.mjs';

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
