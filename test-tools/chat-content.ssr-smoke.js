// SSR smoke for the chat content components: boots the real SFCs
// (SupportMessageContent in every mode, MessageAttachments,
// AgentActivity, InstanceInlineRef's chip branches) and renders them to
// string with the Nuxt globals stubbed. Import-only checks cannot see a
// dropped setup binding — the defect class where a render-time symbol
// goes missing (the missing renderMarkdown import that 500'd every chat
// surface) — so these components must RENDER, not merely compile.
import { describe, expect, it, vi } from 'vitest';
import { createSSRApp, h, ref } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createI18n } from 'vue-i18n';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import Re_L from '~/assets/presets/re_l';
import enLocale from '~/i18n/locales/en.json';
import SupportMessageContent from '~/components/shared/SupportMessageContent.vue';
import MessageAttachments from '~/components/shared/MessageAttachments.vue';
import AgentActivity from '~/components/shared/AgentActivity.vue';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';

globalThis.$fetch = vi.fn(async () => ({}));
globalThis.navigateTo = () => {};
const nuxtState = new Map();
globalThis.useState = (key, init) => {
  if (!nuxtState.has(key)) nuxtState.set(key, ref(typeof init === 'function' ? init() : null));
  return nuxtState.get(key);
};

const boot = Component => {
  const i18n = createI18n({
    legacy: false,
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: enLocale }
  });
  const app = createSSRApp({ render: () => h(Component) });
  app.use(i18n);
  app.use(createPinia());
  app.use(PrimeVue, { theme: { preset: Re_L, options: { darkModeSelector: '.dark-mode' } } });
  return renderToString(app);
};

describe('chat content SSR smoke', () => {
  it('renders message bodies in plain, markdown, and preview modes', async () => {
    await expect(boot({
      setup: () => () => h(SupportMessageContent, {
        message: { message: 'plain body https://example.com/a.' }
      })
    })).resolves.toContain('plain body');

    const markdown = await boot({
      setup: () => () => h(SupportMessageContent, {
        message: { message: '# heading\n\nanswer **bold**' },
        markdown: true
      })
    });
    // The shared pipeline renders '' without a DOM: SSR paints the plain
    // text, hydration swaps in the formatted document.
    expect(markdown).toContain('heading');
    expect(markdown).toContain('bold');

    const preview = await boot({
      setup: () => () => h(SupportMessageContent, {
        message: { message: 'preview text {{instance:cassette:abc}} tail' },
        singleLine: true
      })
    });
    // Instance tokens strip from display in every mode.
    expect(preview).toContain('preview text');
    expect(preview).toContain('tail');
    expect(preview).not.toContain('instance:cassette');
  });

  it('renders the stacked preview card for refs with resolving preview media', async () => {
    // The served type view rides the mocked $fetch: a cassette type with
    // payload traits plus a plugin preview binding flips both gates
    // (MessageAttachments' refHasPreview and the compact card's preview
    // surface). The org-scoped user picks a fresh type-view cache key.
    globalThis.$fetch.mockImplementation(async (url) => (
      String(url).includes('/api/admin/cts/types')
        ? {
            types: [{ id: 'cassette', payload: { maxSize: null }, fields: {}, sections: [] }],
            editors: [],
            surfaces: [],
            previews: [{
              type: 'cassette',
              surface: 'cassette-preview',
              url: '/api/plugins/facade/module/surfaces/cassette-preview.mjs',
              surfaceContract: 1
            }]
          }
        : {}
    ));
    const i18n = createI18n({ legacy: false, missingWarn: false, fallbackWarn: false, messages: { en: enLocale } });
    const app = createSSRApp({
      setup: () => () => h(MessageAttachments, {
        refs: [{ type: 'cassette', id: 'abc', instance: { _id: 'abc', name: 'Колхозная', state: 'READY', fields: {} } }]
      })
    });
    const pinia = createPinia();
    app.use(i18n);
    app.use(pinia);
    app.use(PrimeVue, { theme: { preset: Re_L, options: { darkModeSelector: '.dark-mode' } } });
    const { useAuthStore } = await import('~/stores/auth');
    useAuthStore(pinia).user = { organizationId: 'org-preview-smoke' };
    const { useFileTypeView } = await import('~/composables/useFileTypeView.js');
    setActivePinia(pinia);
    useFileTypeView();
    await new Promise(resolve => setTimeout(resolve));
    let html;
    try {
      html = await renderToString(app);
    } finally {
      globalThis.$fetch.mockImplementation(async () => ({}));
    }
    expect(html).toContain('instance-inline-compact--stacked');
    expect(html).toContain('instance-inline-compact-preview');
    expect(html).toContain('instance-inline-compact-header');
    // The stacked card's caption strip is one line: the small state tag
    // rides the header, the standalone status row stays with the row
    // layout.
    const header = html.split('instance-inline-compact-header')[1] || '';
    expect(header.slice(0, 2000)).toContain('p-tag');
    expect(html).not.toContain('instance-inline-compact-status-row');
  });

  it('tiles several preview refs into a grid', async () => {
    globalThis.$fetch.mockImplementation(async (url) => (
      String(url).includes('/api/admin/cts/types')
        ? {
            types: [{ id: 'cassette', payload: { maxSize: null }, fields: {}, sections: [] }],
            editors: [],
            surfaces: [],
            previews: [{
              type: 'cassette',
              surface: 'cassette-preview',
              url: '/api/plugins/facade/module/surfaces/cassette-preview.mjs',
              surfaceContract: 1
            }]
          }
        : {}
    ));
    const i18n = createI18n({ legacy: false, missingWarn: false, fallbackWarn: false, messages: { en: enLocale } });
    const renderGallery = async (props) => {
      const app = createSSRApp({
        setup: () => () => h(MessageAttachments, {
          refs: ['a', 'b', 'c'].map(id => ({
            type: 'cassette',
            id,
            instance: { _id: id, fields: {} }
          })),
          ...props
        })
      });
      const pinia = createPinia();
      app.use(i18n);
      app.use(pinia);
      app.use(PrimeVue, { theme: { preset: Re_L, options: { darkModeSelector: '.dark-mode' } } });
      const { useAuthStore } = await import('~/stores/auth');
      useAuthStore(pinia).user = { organizationId: 'org-preview-grid-smoke' };
      const { useFileTypeView } = await import('~/composables/useFileTypeView.js');
      setActivePinia(pinia);
      useFileTypeView();
      await new Promise(resolve => setTimeout(resolve));
      try {
        return await renderToString(app);
      } finally {
        globalThis.$fetch.mockImplementation(async () => ({}));
      }
    };
    let html = await renderGallery({});
    expect(html).toContain('data-testid="chat-attachment-gallery"');
    // Round-robin fill: items alternate across columns from the sender
    // edge, each column reversed so its earliest item renders at the
    // base; columns rest on the gallery's bottom edge.
    const columns = html.split('data-testid="chat-masonry-column"').slice(1);
    expect(columns).toHaveLength(2);
    expect((columns[0].match(/instance-inline-compact--stacked/g) || []).length).toBe(2);
    expect((columns[1].match(/instance-inline-compact--stacked/g) || []).length).toBe(1);
    expect(html).toContain('justify-end');
    expect(html).not.toContain('flex-row-reverse');

    html = await renderGallery({ ownMessage: true });
    expect(html).toContain('flex-row-reverse');
  });

  it('renders attached instance refs and their preview summary', async () => {
    const refs = [
      { type: 'cassette', id: 'abc', label: 'Cassette One', instance: { _id: 'abc', name: 'Cassette One', fields: {} } },
      { type: 'sheetDesign', id: 'def' }
    ];
    // Without the CTS type view (which this smoke does not load) no ref
    // resolves preview media, so every ref rides the masonry as a
    // compact chip; the raw id never renders.
    const row = await boot({
      setup: () => () => h(MessageAttachments, { refs })
    });
    expect(row).toContain('data-testid="chat-attachment-gallery"');
    expect(row.match(/p-chip-label/g)?.length).toBe(1);
    expect(row).not.toContain('>def<');

    const summary = await boot({
      setup: () => () => h(MessageAttachments, { refs, singleLine: true })
    });
    expect(summary).toContain('Cassette One');
    expect(summary).toContain('+1');
  });

  it('renders file attachments as the same chip anatomy, gallery and summary beside', async () => {
    const attachments = [
      { kind: 'file', fileId: 'f1', mimeType: 'application/pdf', name: 'report.pdf', size: 120034 },
      { kind: 'file', fileId: 'f2', mimeType: 'application/octet-stream', name: 'cut.dxf', size: 4096 },
      { kind: 'image', fileId: 'f3', mimeType: 'image/png', name: 'site.png' }
    ];
    // Documents render one bordered chip each, stacked in a column —
    // click opens the preview dialog (no inline download chrome); images
    // keep their gallery path.
    const row = await boot({
      setup: () => () => h(MessageAttachments, { attachments })
    });
    expect(row).toContain('data-testid="chat-attachment-files"');
    expect(row.match(/p-chip-label/g)?.length).toBe(2);
    expect(row).toContain('>report.pdf<');
    expect(row).toContain('>cut.dxf<');
    expect(row).not.toContain('pi-download');

    const summary = await boot({
      setup: () => () => h(MessageAttachments, { attachments, singleLine: true })
    });
    expect(summary).toContain('data-testid="chat-attachment-summary"');
  });

  it('renders the agent chronology, thinking disclosure, and typed tool messages', async () => {
    const html = await boot({
      setup: () => () => h(AgentActivity, {
        activity: {
          steps: [
            { kind: 'thinking', text: 'reasoning here' },
            { kind: 'tool', id: 't1', name: 'list_types', status: 'done' },
            { kind: 'tool', id: 't2', name: 'run_action', status: 'running', detail: 'rename' },
            { kind: 'tool', id: 't3', name: 'broken_tool', status: 'error', error: 'it failed' }
          ],
          answer: ''
        },
        live: true
      })
    });
    expect(html).toContain('reasoning here');
    // One typed message per tool invocation: localized names off the
    // catalog vocabulary (unknown tools fall back to the raw name), the
    // call's detail after the label, the failure inside the same
    // message, severity classes by outcome, and no Tag chrome.
    expect(html).toContain('Types listed');
    expect(html).toContain('Action executed — rename');
    expect(html).toContain('broken_tool');
    expect(html).toContain('it failed');
    expect((html.match(/data-testid="agent-tool"/g) || []).length).toBe(3);
    expect(html).toContain('p-message-secondary');
    expect(html).toContain('p-message-info');
    expect(html).toContain('p-message-error');
    expect(html).not.toContain('p-tag');
  });

  it('renders nothing while the run has no steps — the typing line owns that presence', async () => {
    const html = await boot({
      setup: () => () => h(AgentActivity, {
        activity: { steps: [], answer: '' },
        live: true
      })
    });
    expect(html).not.toContain('p-fieldset');
    expect(html).not.toContain('p-skeleton');
    expect(html).not.toContain('data-testid="agent-thinking"');
  });

  it('renders the inline ref chip resolved, unresolved, and non-interactive', async () => {
    const resolved = await boot({
      setup: () => () => h(InstanceInlineRef, {
        type: 'cassette',
        id: 'abc',
        entity: { _id: 'abc', identity: { name: 'Chip Label' } },
        fetch: false
      })
    });
    expect(resolved).toContain('p-chip-label');
    expect(resolved).toContain('data-instance-card-interactive="true"');
    expect(resolved).not.toContain('>abc<');

    const passive = await boot({
      setup: () => () => h(InstanceInlineRef, {
        type: 'cassette',
        id: 'abc',
        entity: { _id: 'abc', identity: { name: 'Row Label' } },
        fetch: false,
        interactive: false,
        variant: 'inline'
      })
    });
    expect(passive).toContain('pointer-events-none');
  });
});
