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
//
// With a parsed listing's `dependencies` (owner decision 2026-10-17), a
// bare specifier naming a declared dependency is legal — the platform's
// module proxy resolves it to the plugin's own vendor scope — and every
// declared vendor module must exist under the plugin root.
export async function checkSurfaceModule(path, { dependencies = [], pluginRoot = null } = {}) {
  const declared = new Set((dependencies || []).map(dependency => dependency.name));
  // The host markdown pipeline is mount-provided even when a server
  // runtime legitimately vendors marked as a dependency: a surface that
  // imports it loses the single shared instance.
  const neverInSurfaces = new Set(['marked', 'dompurify', 'pele', 'vue', 'primevue', 'pinia']);
  const offenders = [...new Set(graphOffenders(resolve(path), { allowedBare: declared, forbiddenBare: neverInSurfaces }))];
  if (offenders.length) {
    throw new Error(`surface module graph must be self-contained — vendor third-party code under the executor root and import it relatively (or declare it as a dependency), and never import host externals (found: ${offenders.join(', ')})`);
  }
  if (pluginRoot) {
    for (const dependency of dependencies || []) {
      // Cross-plugin modules (plugin:<id><path>) live under the required
      // plugin's root; every other listing module path is root-relative
      // in the plugin's own space and anchors at the plugin root.
      if (String(dependency.module || '').startsWith('plugin:')) continue;
      let exists = false;
      try {
        exists = statSync(resolve(pluginRoot, `.${dependency.module}`)).isFile();
      } catch {
        exists = false;
      }
      if (!exists) {
        throw new Error(`declared dependency ${dependency.name} serves no module at ${dependency.module} under the plugin root`);
      }
    }
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
// specifiers (npm packages, node builtins, host externals — unless the
// listing declares them as dependencies, and never the mount-injected
// set) and relative
// specifiers no browser could resolve (extension-less paths). The walk
// is cycle-safe and skips what it cannot read.
function graphOffenders(entry, { allowedBare = new Set(), forbiddenBare = new Set(), seen = new Set() } = {}) {
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
  for (const match of code.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"]+)\1/g)) {
    const specifier = match[2];
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
      if (forbiddenBare.has(specifier) || !allowedBare.has(specifier)) offenders.push(specifier);
      continue;
    }
    const resolved = resolveLocalModule(entry, specifier);
    if (!resolved) {
      offenders.push(specifier);
      continue;
    }
    offenders.push(...graphOffenders(resolved, { allowedBare, forbiddenBare, seen }));
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
  // The stub carries the contract-4 superset: the factory smoke proves a
  // module composes against the navigation mount (queries, notify,
  // access, sync, upload, open) without reaching anything real.
  return {
    vue: {
      h: () => null,
      ref: value => ({ value }),
      computed: getter => ({ get value() { return getter(); } }),
      reactive: value => value,
      watch: () => () => {},
      onMounted: () => {},
      defineComponent: value => value,
      Teleport: () => null
    },
    components: component,
    locale: { t: key => key, te: () => true, locale: () => 'en' },
    queries: { list: async () => [], get: async () => null },
    records: { create: async () => null, update: async () => null, delete: async () => null },
    notify: () => {},
    access: { canWrite: () => true },
    sync: { onRecordChanged: () => () => {} },
    upload: { file: async () => ({ id: 'stub', filename: 'stub' }) },
    open: { instance: () => false }
  };
}
