import { describe, expect, it } from 'vitest';
import { parsePluginPreviewPayload } from './file-preview-contract.js';

describe('plugin preview payload parsing', () => {
  it('preserves HTML file bytes as a typed text payload for the plugin preview', () => {
    const html = '<!doctype html><h1>Report</h1>';
    expect(parsePluginPreviewPayload(html, 'text/html')).toEqual({
      type: 'html-document', mime: 'text/html', text: html
    });
  });

  it('continues parsing structured plugin payloads as JSON', () => {
    expect(parsePluginPreviewPayload('{"occs":{},"documentType":"cassette"}', 'application/perigram+occs'))
      .toEqual({ occs: {}, documentType: 'cassette' });
  });

  it('keeps malformed non-HTML payloads unavailable to preview surfaces', () => {
    expect(parsePluginPreviewPayload('not-json', 'application/perigram+occs')).toBeNull();
  });
});
