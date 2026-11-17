import { describe, expect, it, vi } from 'vitest';
import createHtmlPreview from './html-preview.mjs';

describe('HTML document preview surface', () => {
  it('renders host-sanitized HTML inside a scriptless, network-restricted iframe', () => {
    const h = (tag, props, children) => ({ tag, props, children });
    const renderMarkdown = vi.fn(() => '<h1>Quarterly report</h1>');
    const surface = createHtmlPreview({ vue: { h }, renderMarkdown });
    const render = surface.setup({ payload: { type: 'html-document', text: '<script>bad()</script><h1>Quarterly report</h1>' } });
    const tree = render();
    const iframe = tree.children[0];
    expect(renderMarkdown).toHaveBeenCalledWith('<script>bad()</script><h1>Quarterly report</h1>');
    expect(iframe.tag).toBe('iframe');
    expect(iframe.props.sandbox).toBe('');
    expect(iframe.props.referrerpolicy).toBe('no-referrer');
    expect(iframe.props.srcdoc).toContain("default-src 'none'");
    expect(iframe.props.srcdoc).toContain('<h1>Quarterly report</h1>');
  });

  it('does not inject untrusted HTML when the host sanitizer is unavailable', () => {
    const h = (tag, props, children) => ({ tag, props, children });
    const surface = createHtmlPreview({ vue: { h } });
    const source = '<img src=x onerror=alert(1)>';
    const tree = surface.setup({ payload: { text: source } })();
    expect(tree.tag).toBe('pre');
    expect(tree.children).toBe(source);
  });
});
