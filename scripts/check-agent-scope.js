#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_BASE = 'origin/local';
const DEFAULT_ALLOWLIST = '.agents/app-layer.allowlist';
const IGNORED_PATTERNS = [
  '.obsidian/**',
  'node_modules/**',
  '.nuxt/**',
  '.output/**',
  'coverage/**'
];

const args = parseArgs(process.argv.slice(2));
const baseRef = args.base || DEFAULT_BASE;
const allowlistPath = args.allow || DEFAULT_ALLOWLIST;

if (!existsSync(allowlistPath)) {
  fail(`Allowlist not found: ${allowlistPath}`);
}

const allowedPatterns = readPatternFile(allowlistPath);
const changedFiles = collectChangedFiles(baseRef)
  .map(normalizePath)
  .filter(file => file && !matchesAny(file, IGNORED_PATTERNS));

const forbidden = changedFiles.filter(file => !matchesAny(file, allowedPatterns));

if (forbidden.length > 0) {
  console.error('Agent scope check failed. Forbidden files changed:');
  for (const file of forbidden) console.error(`- ${file}`);
  console.error('');
  console.error(`Allowed patterns are defined in ${allowlistPath}.`);
  console.error('Ask the repository owner for a platform extension instead of editing forbidden paths.');
  process.exit(1);
}

console.log(`Agent scope check passed (${changedFiles.length} changed file(s), ${allowedPatterns.length} allowed pattern(s)).`);

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--base') result.base = argv[++index];
    else if (arg === '--allow') result.allow = argv[++index];
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/check-agent-scope.js [--base origin/local] [--allow .agents/app-layer.allowlist]');
      process.exit(0);
    } else {
      fail(`Unknown argument: ${arg}`);
    }
  }
  return result;
}

function collectChangedFiles(baseRef) {
  return unique([
    ...gitNames(['diff', '--name-only', `${baseRef}...HEAD`], { optional: true }),
    ...gitNames(['diff', '--name-only']),
    ...gitNames(['diff', '--cached', '--name-only']),
    ...gitNames(['ls-files', '--others', '--exclude-standard'])
  ]);
}

function gitNames(args, { optional = false } = {}) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.error?.code === 'EPERM' && !result.stdout) return [];
  if (result.error && !result.stdout) {
    if (optional) return [];
    throw result.error;
  }
  if (result.status !== 0 && !result.stdout) {
    if (optional) return [];
    fail(result.stderr || `git ${args.join(' ')} failed`);
  }
  return result.stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function readPatternFile(filePath) {
  return readFileSync(filePath, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
}

function matchesAny(file, patterns) {
  return patterns.some(pattern => globToRegExp(pattern).test(file));
}

function globToRegExp(pattern) {
  const normalized = normalizePath(pattern);
  let source = '';
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];
    if (char === '*' && next === '*') {
      source += '.*';
      index += 1;
    } else if (char === '*') {
      source += '[^/]*';
    } else {
      source += escapeRegExp(char);
    }
  }
  return new RegExp(`^${source}$`);
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/').replace(/^\.\//, '');
}

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function unique(values) {
  return [...new Set(values)];
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
