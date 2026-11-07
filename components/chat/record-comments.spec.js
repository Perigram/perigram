// The record comments band's re-key law: the thread is a pure function of
// the opened record. Every record host (routed page, pane tab, record
// popup) swaps the record in place through the same unkeyed chain, so the
// band itself must re-key the thread mount — and the thread core pins one
// conversation per mount by design (the call-workspace pin law).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import ConfirmationService from 'primevue/confirmationservice';
import ToastService from 'primevue/toastservice';
import Re_L from '~/assets/presets/re_l';
import { describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '~/stores/auth';

vi.mock('./ChatThreadStage.vue', async () => {
  const { defineComponent, h: render } = await import('vue');
  return {
    default: defineComponent({
      props: ['thread'],
      setup(props) {
        return () => render('div', {
          'data-thread-key': props.thread?.activeConversation?.value?.conversationKey
            || props.thread?.activeConversation?.conversationKey
            || ''
        });
      }
    })
  };
});

globalThis.$fetch = vi.fn(async () => ({}));
const nuxtState = new Map();
globalThis.useState = (key, init) => {
  if (!nuxtState.has(key)) nuxtState.set(key, { value: typeof init === 'function' ? init() : null });
  return nuxtState.get(key);
};

const RecordCommentsThread = (await import('./RecordCommentsThread.vue')).default;

const bootBand = async ({ typeId, instanceId, viewerId = null }) => {
  nuxtState.clear();
  const pinia = createPinia();
  if (viewerId) useAuthStore(pinia).user = { id: viewerId };
  const i18n = createI18n({ legacy: false, missingWarn: false, fallbackWarn: false, messages: { en: {} } });
  const app = createSSRApp({ render: () => h(RecordCommentsThread, { typeId, instanceId, name: 'Record' }) });
  app.use(i18n);
  app.use(pinia);
  app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }] }));
  app.use(PrimeVue, { theme: { preset: Re_L, options: { darkModeSelector: '.dark-mode' } } });
  app.use(ConfirmationService);
  app.use(ToastService);
  return await renderToString(app);
};

describe('record comments thread', () => {
  it('pins the conversation of the record it mounts for', async () => {
    const bandA = await bootBand({ typeId: 'widget', instanceId: 'a1' });
    expect(bandA).toContain('data-thread-key="instance:widget:a1"');

    // The same component mounted for another record — the host swapped the
    // record in place — carries that record's thread.
    const bandB = await bootBand({ typeId: 'widget', instanceId: 'b2' });
    expect(bandB).toContain('data-thread-key="instance:widget:b2"');
  });

  it('rides the direct thread with the viewing user for a user record', async () => {
    const band = await bootBand({ typeId: 'user', instanceId: 'u-9', viewerId: 'viewer-1' });
    expect(band).toContain('data-thread-key="direct:u-9:viewer-1"');
  });

  it('keys the thread mount by the record identity', () => {
    const source = readFileSync(join(__dirname, 'RecordComments.vue'), 'utf8');
    const threadMount = source.match(/<RecordCommentsThread[\s\S]*?>/)?.[0] || '';
    expect(threadMount).toContain(':key=');
    expect(threadMount).toMatch(/key="`\$\{typeId\}:\$\{instanceId\}`"/);
  });
});
