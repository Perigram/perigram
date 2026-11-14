import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';

const roots = [
  'server', 'shared', 'composables', 'components', 'utils', 'stores',
  'plugins', 'middleware', 'pages', 'layouts', 'scripts', 'test-tools', 'workers'
].filter(path => {
  try { return statSync(path).isDirectory(); } catch { return false; }
});
const extensions = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.vue']);
const packages = new Set(['core', 'cts', 'processes', 'plugin-sdk']);
const hits = [];

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'generated') continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.isFile() && extensions.has(path.slice(path.lastIndexOf('.')))) inspect(path);
  }
}

function inspect(file) {
  const source = readFileSync(file, 'utf8');
  const pattern = /(?:from\s*|import\s*(?:\(\s*)?|require\s*\(\s*)['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(pattern)) {
    const specifier = match[1];
    let packageName = null;
    let kind = null;

    if (specifier.startsWith('@perigram/')) {
      packageName = specifier.slice('@perigram/'.length).split('/')[0];
      kind = 'package-name';
    } else {
      const alias = specifier.match(/^(?:~|#packages)\/packages?\/?(core|cts|processes|plugin-sdk)(?:\/|$)/);
      const direct = specifier.match(/^(?:~|#packages)\/(core|cts|processes|plugin-sdk)(?:\/|$)/);
      const matchPackage = alias || direct;
      if (matchPackage) {
        packageName = matchPackage[1];
        kind = 'root-alias';
      } else if (specifier.startsWith('.')) {
        const resolved = resolve(dirname(file), specifier);
        const normalized = resolved.split(sep).join('/');
        const matchPath = normalized.match(/(?:^|\/)packages\/(core|cts|processes|plugin-sdk)(?:\/|$)/);
        if (matchPath) {
          packageName = matchPath[1];
          kind = 'relative-source-path';
        }
      }
    }

    if (packageName && (packages.has(packageName) || packageName.startsWith('@perigram/'))) {
      const before = source.slice(0, match.index);
      const line = before.split('\n').length;
      hits.push({
        file: relative(process.cwd(), file).split(sep).join('/'),
        line,
        package: packageName,
        kind,
        specifier
      });
    }
  }
}

for (const root of roots) walk(resolve(root));
hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
const summary = Object.groupBy ? Object.groupBy(hits, item => item.package) :
  hits.reduce((groups, item) => ((groups[item.package] ||= []).push(item), groups), {});
console.log(JSON.stringify({
  roots,
  totalImports: hits.length,
  byPackage: Object.fromEntries(Object.entries(summary).map(([name, items]) => [name, items.length])),
  imports: hits
}, null, 2));
