import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// The surface-module check (`perigram-plugin surfaces <module>`): the
// author-side half of the consistency law (SPEC §Plugin marketplace,
// owner decision 2026-10-11). The host shell mount itself is proven by
// the platform's fixture-plugin e2e; this check proves what the SDK can
// prove alone and zero-dep — the module's import graph is clean of host
// externals (the mount injects vue, the component pack, and the locale;
// a module importing its own copies fails here), the default export is
// the factory `createSurface(ctx)`, and the factory returns a component
// against a stub context without logging errors.
export async function checkSurfaceModule(path) {
  const source = readFileSync(path, 'utf8');
  const offenders = [...source.matchAll(/(?:from\s*|import\(\s*)['"]([^'"]+)['"]/g)]
    .map(match => match[1])
    .filter(specifier => /^(vue|pinia|primevue)(\/|$)/.test(specifier));
  if (offenders.length) {
    throw new Error(`surface module must not import host externals — the mount injects them (found: ${[...new Set(offenders)].join(', ')})`);
  }
  const module = await import(pathToFileURL(path).href);
  const createSurface = module.default;
  if (typeof createSurface !== 'function') {
    throw new Error('surface module must default-export the factory createSurface(ctx) -> component');
  }
  const logged = [];
  const originalError = console.error;
  console.error = (...args) => logged.push(args.map(String).join(' '));
  try {
    const component = createSurface(stubContext());
    if (!component || !['object', 'function'].includes(typeof component)) {
      throw new Error('createSurface must return a component definition');
    }
  } finally {
    console.error = originalError;
  }
  if (logged.length) {
    throw new Error(`createSurface logged errors against the stub context: ${logged.join('; ')}`);
  }
  return true;
}

function stubContext() {
  const component = new Proxy({}, { get: (_target, key) => ({ name: String(key) }) });
  // The stub carries the contract-2 superset: the factory smoke proves a
  // module composes against the editor-grade context (queries, notify,
  // access) without reaching anything real.
  return {
    vue: {
      h: () => null,
      ref: value => ({ value }),
      computed: getter => ({ get value() { return getter(); } }),
      reactive: value => value,
      watch: () => () => {},
      onMounted: () => {},
      defineComponent: value => value
    },
    components: component,
    locale: { t: key => key, te: () => true, locale: () => 'en' },
    queries: { list: async () => [], get: async () => null },
    notify: () => {},
    access: { canWrite: () => true }
  };
}
