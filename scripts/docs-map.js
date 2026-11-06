#!/usr/bin/env node

/* README tree map printer (npm run docs:map).
 *
 *   node scripts/docs-map.js                outline + link graph of every README
 *   node scripts/docs-map.js --near <path>  one README's outline, outbound and
 *                                           inbound links (its contract
 *                                           neighborhood)
 *
 * Tree walking, link parsing, and exclusion rules come from check-docs.js,
 * so the map and the guard always see the same tree.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  REPO_ROOT,
  walk,
  collectLinks,
  resolveTarget,
  splitOutsideFences
} from './check-docs.js';

function docEntry(file) {
  const content = readFileSync(file, 'utf8');
  const headings = [];
  const links = new Set();
  for (const { text, inCode } of splitOutsideFences(content)) {
    if (inCode) continue;
    for (const line of text.split('\n')) {
      const m = /^(#{1,3})\s+(.+)$/.exec(line);
      if (m) headings.push({ depth: m[1].length, text: m[2].trim() });
    }
    for (const link of collectLinks(text, file)) {
      const rel = resolveTarget(link);
      if (!rel || rel.startsWith('..') || !rel.endsWith('.md')) continue;
      if (path.join(REPO_ROOT, rel) === file) continue;
      links.add(rel);
    }
  }
  return { file, rel: path.relative(REPO_ROOT, file), headings, links: [...links].sort() };
}

function h1(entry) {
  const heading = entry.headings.find(h => h.depth === 1);
  return heading ? heading.text : '(no H1)';
}

function titleOf(rel, cache) {
  if (!cache.has(rel)) {
    try {
      cache.set(rel, h1(docEntry(path.join(REPO_ROOT, rel))));
    } catch {
      cache.set(rel, '(submodule)');
    }
  }
  return cache.get(rel);
}

function printFullMap(readmeEntries) {
  readmeEntries.sort((a, b) => a.rel.localeCompare(b.rel, undefined, { numeric: true }));
  for (const entry of readmeEntries) {
    console.log(`${entry.rel} — ${h1(entry)}`);
    const sections = entry.headings.filter(h => h.depth === 2).map(h => h.text);
    if (sections.length) console.log(`    ${sections.join(' · ')}`);
    for (const link of entry.links) console.log(`    → ${link}`);
  }
}

function resolveTargetArg(arg, readmeEntries) {
  const norm = arg.replace(/\/+$/, '');
  const candidates = [];
  for (const entry of readmeEntries) {
    const stripped = entry.rel.replace(/README\.md$/, '');
    if (norm === entry.rel || norm === stripped ||
        `${norm}/README.md` === entry.rel || `${norm}.md` === entry.rel) {
      return entry.rel;
    }
    if (entry.rel.includes(norm)) candidates.push(entry.rel);
  }
  if (candidates.length === 1) return candidates[0];
  console.error(candidates.length
    ? `Ambiguous target "${arg}", candidates:\n  ${candidates.join('\n  ')}`
    : `No README matches "${arg}"`);
  process.exit(1);
}

function printNear(target, mdFiles) {
  const cache = new Map();
  console.log(`${target.rel} — ${h1(target)}`);
  for (const heading of target.headings) {
    if (heading.depth === 1) continue;
    console.log(`  ${'#'.repeat(heading.depth)} ${heading.text}`);
  }
  if (target.links.length) {
    console.log('  outbound:');
    for (const link of target.links) {
      console.log(`    → ${link} — ${titleOf(link, cache)}`);
    }
  }
  const inbound = [];
  for (const file of mdFiles) {
    if (file === target.file) continue;
    const entry = docEntry(file);
    if (entry.links.includes(target.rel)) inbound.push(entry);
  }
  if (inbound.length) {
    console.log('  inbound:');
    for (const entry of inbound.sort((a, b) => a.rel.localeCompare(b.rel, undefined, { numeric: true }))) {
      console.log(`    ← ${entry.rel} — ${h1(entry)}`);
    }
  }
}

const args = process.argv.slice(2);
const nearIdx = args.indexOf('--near');

if (nearIdx !== -1 && !args[nearIdx + 1]) {
  console.error('Usage: node scripts/docs-map.js [--near <path>]');
  process.exit(1);
}

const mdFiles = walk(REPO_ROOT);
const readmeEntries = mdFiles
  .filter(file => path.basename(file) === 'README.md')
  .map(docEntry);

if (nearIdx === -1) {
  printFullMap(readmeEntries);
} else {
  const rel = resolveTargetArg(args[nearIdx + 1], readmeEntries);
  const target = readmeEntries.find(entry => entry.rel === rel);
  printNear(target, mdFiles);
}
