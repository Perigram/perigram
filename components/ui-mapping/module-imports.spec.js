import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = new URL('.', import.meta.url).pathname;
const VUE_BUILTINS = new Set(['Transition', 'TransitionGroup', 'KeepAlive', 'Teleport', 'Suspense']);

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

  it('imports every component its template references', () => {
    // The auto-import module may resolve unimported components at Nuxt
    // runtime, but anything else (SSR smoke, plain Vue consumers, the
    // showcase) renders them as empty nodes — the MeterGroup/Chart/Rating
    // defect. A capitalized template tag must be imported by the SFC
    // (self-reference by filename and Vue built-ins excepted).
    for (const file of readdirSync(dir).filter(file => file.endsWith('.vue'))) {
      const source = readFileSync(join(dir, file), 'utf8');
      const template = source.slice(0, source.indexOf('<script'));
      const tags = new Set([...template.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)].map(match => match[1]));
      const imports = new Set([...source.matchAll(/import ([A-Z][A-Za-z0-9]*) from/g)].map(match => match[1]));
      const self = file.replace(/\.vue$/, '');
      const missing = [...tags].filter(tag => !imports.has(tag) && !VUE_BUILTINS.has(tag) && tag !== self);
      expect(missing, `${file} references unimported components`).toEqual([]);
    }
  });
});
