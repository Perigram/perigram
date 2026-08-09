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
  });
});
