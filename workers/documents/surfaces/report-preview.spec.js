import { describe, expect, it } from 'vitest';
import { documentsOf } from './report-preview.mjs';

describe('Documents graph preview channel', () => {
  it('renders flowing documents and reports from unified graph execution envelopes', () => {
    const document = { type: 'text.flow-document', schemaVersion: 1, blocks: [] };
    const report = { type: 'document.report', schemaVersion: 1, sections: [] };
    const block = { type: 'paragraph', children: [] };
    const file = { payload: { mime: 'text/markdown', base64: 'IyBIZWxsbw==' } };

    expect(documentsOf({
      selectedOutput: { id: 'document', value: document },
      outputs: { document, report },
      nodeOutputs: {
        paragraph: { value: block },
        compose: { value: document },
        report: { value: report },
        export: { value: file }
      }
    })).toEqual([document, report]);
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
