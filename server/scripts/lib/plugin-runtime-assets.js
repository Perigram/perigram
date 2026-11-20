import { readFileSync } from 'node:fs';
import { dirname, extname, relative, resolve, sep } from 'node:path';

function safePackagePath(root, target) {
  const absolute = resolve(target);
  const rel = relative(root, absolute);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || rel.startsWith(sep)) {
    throw new Error(`Runtime asset escapes plugin package: ${target}`);
  }
  return { absolute, path: rel.split(sep).join('/') };
}

function contentTypeFor(path) {
  const extension = extname(path).toLowerCase();
  if (extension === '.mjs' || extension === '.js') return 'text/javascript';
  if (extension === '.wasm') return 'application/wasm';
  if (extension === '.py') return 'text/x-python';
  if (extension === '.json') return 'application/json';
  if (extension === '.css') return 'text/css';
  return 'application/octet-stream';
}

// Collect a managed runtime's entrypoint and its statically imported,
// package-relative modules. Bare imports are resolved by the listing's
// declared dependency map in the isolated runtime worker. `vendor`
// marks a declared dependency bundle: third-party code may carry
// runtime-computed dynamic imports (worker URLs) whose targets are
// never package assets, so only the static relative-import walk
// applies there; first-party runtime entries keep the literal-import
// law. `engine` marks a client engine's entry graph (SPEC §20): its
// staged binaries and wheels are enumerated by the engine declaration,
// so the walk applies alone there too.
export function collectRuntimeAssetFiles(packageRoot, entry, language = 'javascript', { vendor = false, engine = false } = {}) {
  const root = resolve(packageRoot);
  const first = safePackagePath(root, resolve(root, String(entry || '').replace(/^\/+/, '')));
  const pending = [first.absolute];
  const visited = new Set();
  const assets = [];
  while (pending.length) {
    const file = pending.pop();
    const resolved = safePackagePath(root, file);
    if (visited.has(resolved.absolute)) continue;
    visited.add(resolved.absolute);
    const buffer = readFileSync(resolved.absolute);
    assets.push({
      path: resolved.path,
      buffer,
      contentType: contentTypeFor(resolved.path)
    });
    if (language !== 'javascript' || !/\.(?:m?js)$/.test(resolved.path)) continue;
    const source = buffer.toString('utf8');
    if (!vendor && !engine && /\bimport\s*\(\s*(?!['"])/.test(source)) {
      throw new Error(`Managed runtime ${entry} uses a non-literal dynamic import; runtime assets must be statically discoverable`);
    }
    const imports = source.matchAll(/(?:\bimport|\bexport)\s+(?:[^'"]*?\s+from\s*)?['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g);
    for (const match of imports) {
      const specifier = match[1] || match[2];
      if (!specifier.startsWith('.')) continue;
      const dependency = resolve(dirname(resolved.absolute), specifier);
      pending.push(dependency);
    }
    // WASM and other package assets are commonly resolved relative to the
    // importing module at runtime rather than imported as JavaScript.
    const relativeAssets = source.matchAll(/\bnew\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g);
    for (const match of relativeAssets) {
      const specifier = match[1];
      // A trailing slash resolves to a directory (a module base URL),
      // never a staged asset.
      if (specifier.endsWith('/') || specifier.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(specifier)) continue;
      pending.push(resolve(dirname(resolved.absolute), specifier));
    }
  }
  return assets.sort((a, b) => a.path.localeCompare(b.path));
}

// The complete package-asset set a listing's release stages: every
// declared runtime entry, engine entry, surface module, and dependency
// bundle with its walked import graph, plus the engine's staged assets.
// Publishing (the seed script) and install materialization share the
// set through their content-hash manifests.
export function prepareListingRelease(listing, packageRoot) {
  const root = resolve(packageRoot);
  const declaredEntries = [
    ...(listing.declarations.runtimes || []).map(runtime => ({ entry: runtime.entry, language: runtime.language })),
    ...(listing.declarations.engine ? [{ entry: listing.declarations.engine.module, language: 'javascript', engine: true }] : []),
    ...(listing.declarations.surfaces || []).map(surface => ({ entry: surface.module, language: 'javascript' })),
    ...(listing.declarations.dependencies || [])
      .filter(dependency => dependency?.module && !String(dependency.module).startsWith('plugin:'))
      .map(dependency => ({ entry: dependency.module, language: 'javascript', vendor: true }))
  ];
  const byPath = new Map();
  for (const { entry, language, vendor, engine } of declaredEntries) {
    if (!entry) continue;
    for (const asset of collectRuntimeAssetFiles(root, entry, language, { vendor, engine })) {
      byPath.set(asset.path, asset);
    }
  }
  // Engine assets stage by declaration alone: they are fetched at
  // runtime through the module proxy, so the import walker cannot
  // discover them.
  for (const assetPath of listing.declarations.engine?.assets || []) {
    const path = String(assetPath).replace(/^\/+/, '');
    if (byPath.has(path)) continue;
    const resolved = safePackagePath(root, resolve(root, path));
    byPath.set(path, {
      path,
      buffer: readFileSync(resolved.absolute),
      contentType: contentTypeFor(resolved.path)
    });
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}
