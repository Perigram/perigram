import { describe, expect, it } from 'vitest';
import { contentTypeForFile } from './service.js';

describe('contentTypeForFile', () => {
  it('serves stylesheets as text/css from their extension', () => {
    expect(contentTypeForFile({ filename: 'assets/text-editor.css' })).toBe('text/css');
  });

  it('keeps a declared content type', () => {
    expect(contentTypeForFile({ filename: 'payload.bin', contentType: 'image/png' })).toBe('image/png');
  });
});
