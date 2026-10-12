import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// The surface-module check (`perigram-plugin surfaces <module>`): the
// author-side half of the consistency law (SPEC §Plugin marketplace,
// owner decision 2026-10-11). The host shell mount itself is proven by
// the platform's fixture-plugin e2e; this check proves what the SDK can
// prove alone and zero-dep — the module's whole import graph is
// self-contained (vendored assets imported by relative URL: bare
// specifiers resolve in node via npm but never load in the browser, and
// the mount injects vue, the component pack, and the locale), the
// default export is the factory `createSurface(ctx)`, and the factory
// returns a component against a stub context without logging errors.
export async function checkSurfaceModule(path) {
  const offenders = [...new Set(graphOffenders(resolve(path)))];
  if (offenders.length) {
    throw new Error(`surface module graph must be self-contained — vendor third-party code under the executor root and import it relatively; the mount injects host externals (found: ${offenders.join(', ')})`);
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

// Collects every offender in the module's local import graph: bare
// specifiers (npm packages, node builtins, host externals) and relative
// specifiers no browser could resolve (extension-less paths). The walk
// is cycle-safe and skips what it cannot read.
function graphOffenders(entry, seen = new Set()) {
  if (seen.has(entry)) return [];
  seen.add(entry);
  let source;
  try {
    source = readFileSync(entry, 'utf8');
  } catch {
    return [];
  }
  const offenders = [];
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '');
  for (const match of code.matchAll(/(?:from\s*|import\(\s*)['"]([^'"]+)['"]/g)) {
    const specifier = match[1];
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
      offenders.push(specifier);
      continue;
    }
    const resolved = resolveLocalModule(entry, specifier);
    if (!resolved) {
      offenders.push(specifier);
      continue;
    }
    offenders.push(...graphOffenders(resolved, seen));
  }
  return offenders;
}

function resolveLocalModule(entry, specifier) {
  const base = resolve(dirname(entry), specifier);
  for (const candidate of [base, `${base}.js`, `${base}.mjs`]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // try the next extension
    }
  }
  return null;
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
    records: { create: async () => null, update: async () => null },
    notify: () => {},
    access: { canWrite: () => true }
  };
}
