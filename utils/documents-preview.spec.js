import { describe, expect, it } from 'vitest';
import { isDocumentsPreviewValue } from './documents-preview.js';

describe('Documents preview value classification', () => {
  it('recognizes document IR and supported file payloads', () => {
    expect(isDocumentsPreviewValue({ type: 'text.flow-document' })).toBe(true);
    for (const mime of [
      'text/markdown',
      'text/html',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]) {
      expect(isDocumentsPreviewValue({ payload: { base64: 'AA==', mime } })).toBe(true);
    }
  });

  it('ignores unsupported and incomplete file envelopes', () => {
    expect(isDocumentsPreviewValue({ payload: { base64: 'AA==', mime: 'application/pdf' } })).toBe(false);
    expect(isDocumentsPreviewValue({ payload: { mime: 'text/markdown' } })).toBe(false);
    expect(isDocumentsPreviewValue(null)).toBe(false);
  });
});
