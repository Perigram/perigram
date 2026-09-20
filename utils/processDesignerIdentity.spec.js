// Class id semantics: opaque, stable, randomly generated — never derived
// from the name. Renaming cannot re-key identity because there is no
// coupling to remove.
import { describe, expect, it } from 'vitest';
import { generateTypeId } from './processDesignerIdentity.js';

describe('generateTypeId', () => {
  it('produces registry-safe kebab ids', () => {
    for (let index = 0; index < 50; index += 1) {
      expect(generateTypeId()).toMatch(/^t-[a-z0-9]{10}$/);
    }
  });

  it('produces unique ids', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateTypeId()));
    expect(seen.size).toBe(200);
  });
});
