// Safe HTML file preview: the host's marked + DOMPurify pipeline sanitizes
// the document, then a sandboxed iframe keeps its navigation/script context
// away from the Perigram application.
const CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none';";

export default function createSurface({ vue, renderMarkdown }) {
  const h = vue?.h || (() => null);
  return {
    name: 'HtmlDocumentPreview',
    props: {
      record: { type: Object, default: null },
      payload: { type: Object, default: null }
    },
    setup(props) {
      return () => {
        const source = typeof props.payload?.text === 'string' ? props.payload.text : '';
        if (!source) return h('div', { class: 'h-full w-full' });
        if (typeof renderMarkdown !== 'function') {
          return h('pre', { class: 'max-h-full overflow-auto whitespace-pre-wrap' }, source);
        }
        let sanitized = '';
        try {
          sanitized = String(renderMarkdown(source) || '');
        } catch {
          sanitized = '';
        }
        if (!sanitized) return h('pre', { class: 'max-h-full overflow-auto whitespace-pre-wrap' }, source);
        const srcdoc = '<!doctype html><meta http-equiv="Content-Security-Policy" content="' + CSP + '">' + sanitized;
        return h('div', { class: 'h-full min-h-0 w-full overflow-hidden' }, [
          h('iframe', {
            title: 'HTML document preview',
            sandbox: '',
            referrerpolicy: 'no-referrer',
            srcdoc,
            class: 'h-full min-h-0 w-full border-0 bg-white'
          })
        ]);
      };
    }
  };
}
