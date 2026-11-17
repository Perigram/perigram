import { describe, expect, it } from 'vitest';
import { checkSurfaceModule } from '@perigram/plugin-sdk/surface-check';

describe('Facade preview surfaces', () => {
  it('loads the cassette preview module and validates its surface factory', async () => {
    await expect(checkSurfaceModule(
      new URL('./cassette-preview.mjs', import.meta.url).pathname
    )).resolves.toBe(true);
  });

  it('loads the profile preview module and validates its surface factory', async () => {
    await expect(checkSurfaceModule(
      new URL('./profile-preview.mjs', import.meta.url).pathname
    )).resolves.toBe(true);
  });
});
