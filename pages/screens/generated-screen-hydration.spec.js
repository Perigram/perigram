import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const screenRoute = fs.readFileSync(path.resolve('pages/screens/[screenKey].vue'), 'utf8');

describe('generated screen hydration', () => {
  it('uses the auth middleware manifest without remounting after hydration', () => {
    expect(screenRoute).toContain('const refreshingAuth = ref(!authStore.userIsSet);');
    expect(screenRoute).not.toContain('onMounted(() => refreshProcessManifest())');
    expect(screenRoute).not.toContain('watch(screenKey, () => refreshProcessManifest())');
    expect(screenRoute).not.toContain('await authStore.setUser()');
  });
});
