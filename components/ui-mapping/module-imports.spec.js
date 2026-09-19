import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = new URL('.', import.meta.url).pathname;

describe('ui-mapping component module imports', () => {
  it('every SFC module loads with resolvable named imports', async () => {
    const files = readdirSync(dir).filter(file => file.endsWith('.vue'));
    expect(files.length).toBeGreaterThan(15);
    for (const file of files) {
      const source = readFileSync(join(dir, file), 'utf8');
      const sharedImports = [...source.matchAll(/import \{([^}]+)\} from '#shared\/ui-mapping\/index.js'/g)]
        .flatMap(match => match[1].split(',').map(name => name.trim()).filter(Boolean));
      const indexModule = await import('#shared/ui-mapping/index.js');
      for (const name of sharedImports) {
        expect(indexModule[name], `${file} imports ${name}`).toBeDefined();
      }
      const SHARED_HELPERS = ['formatValue', 'formatQuantity', 'instanceIdentity', 'fieldLabel',
        'applyBudget', 'resolveListLayout', 'resolveSurface', 'resolveFieldControl',
        'tableColumnCount', 'cardFactCount', 'cardVariantFor', 'analyzeTypeShape', 'composeScreen'];
      const scriptBody = source.slice(source.indexOf('<script'));
      for (const helper of SHARED_HELPERS) {
        const called = new RegExp(`\\b${helper}\\s*\\(`).test(scriptBody);
        const imported = sharedImports.includes(helper);
        expect(called && !imported, `${file} calls ${helper} without importing it`).toBe(false);
      }
    }
  });
});
