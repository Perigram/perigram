import { describe, expect, it } from 'vitest';
import { graphOutputViews } from './graphOutputViews.js';

describe('graph output views', () => {
  it('prefers Markdown for string values and keeps text available', () => {
    expect(graphOutputViews('# Heading').map(view => view.value)).toEqual(['markdown', 'text', 'json']);
  });

  it('offers the document view for inline file payloads', () => {
    const views = graphOutputViews({ payload: { base64: 'YWJj', mime: 'application/pdf', name: 'report.pdf' } });
    expect(views.map(view => view.value)).toEqual(['document', 'json']);
  });
});
