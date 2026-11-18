// Plugin executor dependency guard: a plugin's executor image installs
// from the plugin's own package.json (workers/plugin-executor.Dockerfile),
// so any bare import its code carries must be declared there. An
// undeclared import builds and runs on dev boxes (root node_modules bleeds
// through the bind mount) and dies on a hosted executor — this guard
// refuses it at merge time instead.
//
//   node scripts/check-plugin-deps.js
//
// Scans every installed workers/<plugin>/*.js/.mjs (spec files excluded) for static
// imports and requires; each bare specifier must be a key of that
// plugin's package.json dependencies.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const workersRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'workers');
const failures = [];
const SKIP_DIRS = new Set(['node_modules', 'assets', 'surfaces']);

function jsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) files.push(...jsFiles(join(dir, entry.name)));
    } else if (/\.(?:m?js)$/.test(entry.name) && !/\.spec\.(?:m?js)$/.test(entry.name)) {
      files.push(join(dir, entry.name));
    }
  }
  return files;
}

const plugins = readdirSync(workersRoot, { withFileTypes: true })
  .filter(entry => entry.isDirectory()
    && existsSync(join(workersRoot, entry.name, 'listing.json'))
    && existsSync(join(workersRoot, entry.name, 'package.json')));

const IMPORT = /(?:import[\s\S]*?from\s*|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;

function bareSpecifier(spec) {
  if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:')) return null;
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

for (const plugin of plugins) {
  const pluginDir = join(workersRoot, plugin.name);
  const manifestPath = join(pluginDir, 'package.json');
  const declared = new Set(Object.keys(JSON.parse(readFileSync(manifestPath, 'utf8')).dependencies || {}));
  const imported = new Set();
  for (const file of jsFiles(pluginDir)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(IMPORT)) {
      const specifier = bareSpecifier(match[1]);
      if (specifier) imported.add(specifier);
    }
  }
  for (const specifier of imported) {
    if (!declared.has(specifier)) {
      failures.push(`${plugin.name}: imports "${specifier}" but its package.json does not declare it`);
    }
  }
}

if (failures.length) {
  console.error('plugin dependency guard failed:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`plugin dependency guard: ${plugins.length} executor${plugins.length === 1 ? '' : 's'} covered, every bare import declared`);
