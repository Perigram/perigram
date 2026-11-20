// The vendor command (`perigram-plugin vendor`, owner decision
// 2026-10-17): builds a plugin's declared runtime dependencies as flat
// bundles. A dependency tree never crosses the platform boundary — the
// plugin's own import graph decides what vendors, each name bundles
// once with the plugin repo's esbuild install (the SDK stays
// zero-dependency), and the flattened `{ name, version, module,
// license }` manifest is what a listing declares and the platform gates.
//
// Bare specifiers the graph still cannot resolve (host externals like
// vue — the mount injects them) surface here as leftovers: they are not
// vendorable and the surface check refuses them.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { createRequire } from 'node:module';

function vendorSlug(name) {
  return `${String(name).replace(/^@/, '').replace(/\//g, '-')}.mjs`;
}

// Every bare specifier across the plugin's own module graph (relative
// imports walk; extension-less relatives are ignored the way the browser
// would).
function collectBareImports(entries, seen = new Set(), bare = new Set()) {
  for (const entry of entries) {
    if (seen.has(entry)) continue;
    seen.add(entry);
    let source;
    try {
      source = readFileSync(entry, 'utf8');
    } catch {
      continue;
    }
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '');
    for (const match of code.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"]+)\1/g)) {
      const specifier = match[2];
      if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
        bare.add(specifier);
        continue;
      }
      collectBareImports([resolveModuleFile(entry, specifier)], seen, bare);
    }
  }
  return [...bare];
}

function resolveModuleFile(entry, specifier) {
  const base = resolve(dirname(entry), specifier);
  for (const candidate of [base, `${base}.js`, `${base}.mjs`, join(base, 'index.js'), join(base, 'index.mjs')]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // try the next form
    }
  }
  return base;
}

export async function vendorDependencies({ pluginRoot, entry, listingPath = null }) {
  const root = resolve(pluginRoot);
  const entryStat = statSync(resolve(entry));
  const entries = entryStat.isDirectory()
    ? collectModuleFiles(resolve(entry))
    : [resolve(entry)];
  const names = collectBareImports(entries);
  if (!names.length) {
    return { bundled: [], manifest: [], leftovers: [] };
  }

  const require = createRequire(resolve(root, 'package.json'));
  let esbuild;
  try {
    esbuild = require('esbuild');
  } catch {
    throw new Error('vendoring needs esbuild in the plugin repo — npm install -D esbuild (the SDK itself stays zero-dependency)');
  }

  // One split build over every name: each declared dependency is an
  // entry, shared internals land in shared chunks — subpath families
  // (prosemirror state/view/commands) keep one class identity across
  // their bundles, which separate builds would break.
  const entryPoints = {};
  const manifest = [];
  const leftovers = [];
  for (const name of names) {
    let meta = packageMeta(require, name, root);
    if (!meta) {
      leftovers.push(name);
      continue;
    }
    const slug = vendorSlug(name).replace(/\.mjs$/, '');
    entryPoints[slug] = name;
    manifest.push({
      name,
      version: String(meta.version || ''),
      module: `/assets/vendor/${slug}.mjs`,
      license: String(meta.license || 'UNKNOWN')
    });
  }
  const bundled = manifest.map(entry => entry.name);
  if (bundled.length) {
    await esbuild.build({
      entryPoints,
      bundle: true,
      splitting: true,
      format: 'esm',
      platform: 'browser',
      target: 'esnext',
      absWorkingDir: root,
      outdir: resolve(root, 'assets/vendor'),
      entryNames: '[name]',
      chunkNames: 'chunks/[name]-[hash]',
      outExtension: { '.js': '.mjs' },
      // Universal WASM loaders (emscripten) carry a Node-only fallback
      // branch with dynamic `import("node:…")`; the browser never executes
      // it, so the specifier stays external rather than breaking the
      // bundle resolution.
      external: ['node:*'],
      logLevel: 'silent'
    });
  }

  if (listingPath) {
    const path = resolve(listingPath);
    const listing = JSON.parse(readFileSync(path, 'utf8'));
    const byName = new Map((listing.declarations?.dependencies || []).map(dep => [dep.name, dep]));
    for (const entry of manifest) byName.set(entry.name, entry);
    listing.declarations = { ...(listing.declarations || {}), dependencies: [...byName.values()] };
    writeFileSync(path, `${JSON.stringify(listing, null, 2)}\n`);
  }

  return { bundled, manifest, leftovers };
}

// A dependency's package metadata: read `<rootName>/package.json` by
// walking node_modules upward from the plugin root (npm's classic
// lookup — `require.resolve` refuses ESM-only exports maps like
// milkdown's, but the file is always on disk).
function packageMeta(require, name, pluginRoot) {
  const rootName = name.startsWith('@') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0];
  let dir = resolve(pluginRoot);
  for (let depth = 0; depth < 16; depth += 1) {
    const candidate = join(dir, 'node_modules', rootName, 'package.json');
    try {
      const meta = JSON.parse(readFileSync(candidate, 'utf8'));
      if (meta.name === rootName) return meta;
    } catch {
      // keep climbing
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function collectModuleFiles(dir, files = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || name === 'node_modules') continue;
    const path = join(dir, name);
    const stats = statSync(path);
    if (stats.isDirectory()) collectModuleFiles(path, files);
    else if (/\.[cm]?js$/.test(name)) files.push(path);
  }
  return files;
}
