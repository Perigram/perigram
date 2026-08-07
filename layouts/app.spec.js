import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./app.vue', import.meta.url), 'utf8');

describe('app standalone designer routes', () => {
  it('gives the process designer the full bounded workspace', () => {
    expect(source).toContain("const isStandaloneDesignerRoute = computed(() => route.path === '/organization/process')");
    expect(source).toContain('|| isStandaloneDesignerRoute.value');
    expect(source).toContain("isStandaloneDesignerRoute ? 'max-w-none overflow-hidden p-0");
  });
});
