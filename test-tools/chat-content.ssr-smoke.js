// SSR smoke for the chat content components: boots the real SFCs
// (SupportMessageContent in every mode, ChatInstanceRefs, AgentActivity,
// InstanceInlineRef's chip branches) and renders them to string with the
// Nuxt globals stubbed. Import-only checks cannot see a dropped setup
// binding — the defect class where a render-time symbol goes missing
// (the missing renderMarkdown import that 500'd every chat surface) —
// so these components must RENDER, not merely compile.
import { describe, expect, it, vi } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import Re_L from '~/assets/presets/re_l';
import SupportMessageContent from '~/components/shared/SupportMessageContent.vue';
import ChatInstanceRefs from '~/components/shared/ChatInstanceRefs.vue';
import AgentActivity from '~/components/shared/AgentActivity.vue';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';

globalThis.$fetch = vi.fn(async () => ({}));
globalThis.navigateTo = () => {};

const boot = Component => {
  const i18n = createI18n({
    legacy: false,
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: {} }
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

  it('renders attached instance refs and their preview summary', async () => {
    const refs = [
      { type: 'cassette', id: 'abc', instance: { _id: 'abc', identity: { name: 'Cassette One' } } },
      { type: 'sheetDesign', id: 'def' }
    ];
    // Full mode renders one chip per resolved ref; a ref without a
    // snapshot renders the muted unresolved fallback. Labels resolve
    // through the registry's type view, which this smoke does not load —
    // assert structure, not names.
    const row = await boot({
      setup: () => () => h(ChatInstanceRefs, { refs })
    });
    expect(row).toContain('data-testid="chat-instance-refs"');
    expect(row.match(/p-chip-label/g)?.length).toBe(1);
    expect(row).toContain('>def<');

    const summary = await boot({
      setup: () => () => h(ChatInstanceRefs, { refs, singleLine: true })
    });
    expect(summary).toContain('Cassette One');
    expect(summary).toContain('+1');
  });

  it('renders the agent chronology, thinking disclosure, and tool rows', async () => {
    const html = await boot({
      setup: () => () => h(AgentActivity, {
        activity: {
          steps: [
            { kind: 'thinking', text: 'reasoning here' },
            { kind: 'tool', id: 't1', name: 'list_types', status: 'done' },
            { kind: 'tool', id: 't2', name: 'broken_tool', status: 'error', error: 'it failed' }
          ],
          answer: ''
        },
        live: true
      })
    });
    expect(html).toContain('reasoning here');
    expect(html).toContain('list_types');
    expect(html).toContain('it failed');
    expect(html).toContain('data-testid="agent-tool"');
  });

  it('renders the pending run as a pulsing skeleton disclosure', async () => {
    const html = await boot({
      setup: () => () => h(AgentActivity, {
        activity: { steps: [], answer: '' },
        live: true
      })
    });
    expect(html).toContain('data-testid="agent-pending"');
    expect(html.match(/p-skeleton-circle/g)?.length).toBe(3);
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
