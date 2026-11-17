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
// declared dependency map in the isolated runtime worker.
export function collectRuntimeAssetFiles(packageRoot, entry, language = 'javascript') {
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
    if (/\bimport\s*\(\s*(?!['"])/.test(source)) {
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
      if (specifier.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(specifier)) continue;
      pending.push(resolve(dirname(resolved.absolute), specifier));
    }
  }
  return assets.sort((a, b) => a.path.localeCompare(b.path));
}
