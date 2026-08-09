import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./app.vue', import.meta.url), 'utf8');

describe('app standalone designer routes', () => {
  it('gives the process designer the full bounded workspace', () => {
    expect(source).toContain("const isStandaloneDesignerRoute = computed(() => route.path === '/organization/process')");
    expect(source).toContain('|| isStandaloneDesignerRoute.value');
    expect(source).toContain("isStandaloneDesignerRoute ? 'max-w-none overflow-hidden p-0");
  });

  it('keeps chat access out of the desktop menubar and exposes the full chats route', () => {
    expect(source).toContain("command: () => router.push('/chats')");
    expect(source).toContain("class=\"fixed bottom-8 right-8 z-[999] hidden h-14 w-14");
    expect(source).toContain('v-if="!supportDialog && !isChatsRoute"');
    expect(source).toContain('data-testid="desktop-chat-launcher"');
    expect(source).toContain("const isChatsRoute = computed(() => route.path === '/chats' || route.path.startsWith('/chats/'))");
  });

  it('keeps the organization switcher visible and crops avatar images', () => {
    expect(source).toContain('if (authStore.userOrganizations.length)');
    expect(source).not.toContain('authStore.userOrganizations.length > 1');
    expect(source).toContain('[&_.p-avatar-image]:object-cover');
    expect(source).toContain('data-testid="user-menu-trigger"');
    expect(source).toContain("router.push('/organization')");
  });
});
