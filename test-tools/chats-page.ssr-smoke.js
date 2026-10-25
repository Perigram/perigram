// SSR smoke for the chats page: boots the real ChatSupport surface
// (inbox, dialogs, composer components, message rendering) with the
// Nuxt globals stubbed. The chat content components have their own
// smoke; this one guards the assembled surface — a render-time crash
// anywhere in the chat tree (the missing renderMarkdown import class)
// must fail here, not as a runtime 500 on every chat route. The seeded
// run guards the inbox folder contract: the chip strip (All / Personal
// / one chip per organization) over the flat row list.
import { describe, beforeEach, expect, it, vi } from 'vitest';
import { createSSRApp, h, ref } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ConfirmationService from 'primevue/confirmationservice';
import ToastService from 'primevue/toastservice';
import Re_L from '~/assets/presets/re_l';
import ChatsPage from '~/pages/chats.vue';
import ChatSupport from '~/components/ChatSupport.vue';
import { useSupportChatStore } from '~/stores/supportChat';

globalThis.$fetch = vi.fn(async () => ({}));
globalThis.definePageMeta = () => {};
globalThis.navigateTo = () => {};
const nuxtState = new Map();
globalThis.useState = (key, init) => {
  if (!nuxtState.has(key)) nuxtState.set(key, ref(typeof init === 'function' ? init() : null));
  return nuxtState.get(key);
};

const bootPage = async (seed) => {
  const i18n = createI18n({
    legacy: false,
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: {} }
  });
  const pinia = createPinia();
  seed?.(pinia);
  const app = createSSRApp({ render: () => h(ChatsPage) });
  app.use(i18n);
  app.use(pinia);
  app.use(PrimeVue, { theme: { preset: Re_L, options: { darkModeSelector: '.dark-mode' } } });
  app.use(ConfirmationService);
  app.use(ToastService);
  app.directive('tooltip', { getSSRProps: () => ({}) });
  return await renderToString(app);
};

describe('chats page SSR smoke', () => {
  beforeEach(() => nuxtState.clear());

  it('boots the chat surface and renders the inbox without throwing', async () => {
    const html = await bootPage();

    expect(html).toContain('chats-new-menu');
    expect(html).toContain('chat-empty');
  });

  it('scopes the flat inbox by folder chips', async () => {
    const html = await bootPage((pinia) => {
      useSupportChatStore(pinia).conversations = [
        {
          conversationKey: 'instance:organization:org-1',
          conversationKind: 'instance',
          typeId: 'organization',
          instanceId: 'org-1',
          instanceName: 'Acme',
          timestamp: '2026-10-17T10:00:00.000Z',
          unreadCount: 0
        },
        {
          conversationKey: 'instance:project:p-1',
          conversationKind: 'instance',
          typeId: 'project',
          instanceId: 'p-1',
          instanceName: 'Facade job',
          parentKey: 'instance:organization:org-1',
          timestamp: '2026-10-17T11:00:00.000Z',
          unreadCount: 2
        },
        {
          conversationKey: 'direct:user-a:user-b',
          conversationKind: 'direct',
          participant: { name: 'Ann' },
          timestamp: '2026-10-17T09:00:00.000Z',
          unreadCount: 0
        }
      ];
    });

    // Folder strip: All + Personal + the organization chip named by its
    // own chat row; the default All scope lists every row flat — the
    // nested instance row and the direct row render beside the org row.
    expect(html).toContain('chats-folders');
    expect(html).toContain('support.folderAll');
    expect(html).toContain('support.folderPersonal');
    expect(html).toContain('Acme');
    expect(html).toContain('Facade job');
    expect(html).toContain('Ann');
  });

    it('renders an open thread with messages, seen marks, and the message menu without throwing', async () => {
        const now = new Date().toISOString();
        globalThis.$fetch = vi.fn(async (url) => {
            if (String(url).includes('/api/support/messages')) {
                return {
                    data: [{
                        _id: 'msg-1',
                        message: 'hello thread',
                        senderUserId: 'user-b',
                        timestamp: now
                    }],
                    hasMore: false,
                    readCursors: [{ userId: 'user-b', lastReadAt: now }],
                    conversation: { conversationKey: 'direct:user-a:user-b', kind: 'direct' }
                };
            }
            return {};
        });
        try {
            const i18n = createI18n({ legacy: false, missingWarn: false, fallbackWarn: false, messages: { en: {} } });
            const pinia = createPinia();
            useSupportChatStore(pinia).conversations = [
                {
                    conversationKey: 'direct:user-a:user-b',
                    conversationKind: 'direct',
                    participant: { _id: 'user-b', name: 'Ann' },
                    timestamp: now,
                    unreadCount: 0
                }
            ];
            const app = createSSRApp({
                render: () => h(ChatSupport, { embedded: true, conversationKey: 'direct:user-a:user-b' })
            });
            app.use(i18n);
            app.use(pinia);
            app.use(PrimeVue, { theme: { preset: Re_L, options: { darkModeSelector: '.dark-mode' } } });
            app.use(ConfirmationService);
            app.use(ToastService);
            app.directive('tooltip', { getSSRProps: () => ({}) });
            const html = await renderToString(app);
            // SSR renders the open thread synchronously (header, list,
            // composer); history loads client-side, so the guard is the
            // no-throw render plus the fired history load.
            expect(html).toContain('chat-composer');
            expect(html).not.toContain('chat-empty');
            expect(globalThis.$fetch).toHaveBeenCalled();
        } finally {
            globalThis.$fetch = vi.fn(async () => ({}));
        }
    });
});
