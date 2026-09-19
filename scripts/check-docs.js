#!/usr/bin/env node

/* Documentation guardrail for README.md integrity.
 *
 * Blocking findings:
 *  1. Broken internal markdown links (relative targets that do not resolve to
 *     an existing file under the repository).
 *  2. Duplicated canonical-contract passages: verbatim paragraphs of
 *     meaningful length repeated across more than one README. Canonical
 *     contracts (entity registries, DTO blocks, machines, lineage, auth
 *     context, workflow actions) must live in one canonical README and be
 *     linked, not restated.
 *  3. Duplicated fenced code blocks: canonical examples (workflow shapes,
 *     DTO snapshots, socket contracts) must also live in one canonical README
 *     and be linked, not re-pasted.
 *
 * Run from the repository root: `node scripts/check-docs.js`.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const SKIP_DIRS = new Set([
  'node_modules',
  '.nuxt',
  '.output',
  '.git',
  // Agent session worktrees are ephemeral per-session checkouts: scanning
  // them flags every committed README passage against its own copies while
  // parallel sessions run.
  '.agent-worktrees',
  'coverage',
  'dist',
  '.obsidian'
]);

const SKIP_FILES = new Set(['TODO.org_archive']);

const FENCE_RE = /^```/;

const MIN_DUPLICATE_LENGTH = 180;

const MIN_CODE_DUPLICATE_LENGTH = 60;

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.endsWith('.md') && !SKIP_FILES.has(entry)) {
      out.push(full);
    }
  }
  return out;
}

function collectLinks(content, file) {
  const links = [];
  const re = /!?\[[^\]]*\]\(([^)\s]+)\)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const raw = m[1];
    if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('mailto:')) {
      continue;
    }
    if (raw.startsWith('#') || raw.startsWith('#')) {
      continue;
    }
    links.push({ raw, file });
  }
  return links;
}

function resolveTarget(link) {
  const fileDir = path.dirname(link.file);
  const targetNoAnchor = decodeURIComponent(link.raw.split('#')[0]);
  if (targetNoAnchor === '') return null;
  const resolved = path.resolve(fileDir, targetNoAnchor);
  const rel = path.relative(REPO_ROOT, resolved);
  if (rel.startsWith('..')) return null;
  return resolved;
}

function main() {
  const failures = [];

  const files = walk(REPO_ROOT);

  for (const file of files) {
    const content = readFileSync(file, 'utf8');

    for (const { text } of splitOutsideFences(content)) {
      for (const link of collectLinks(text, file)) {
        if (link.raw.startsWith('#') || link.raw.startsWith('http://') || link.raw.startsWith('https://') || link.raw.startsWith('mailto:')) {
          continue;
        }
        const target = resolveTarget(link);
        if (target === null) continue;
        if (!existsSync(target)) {
          failures.push(
            `Broken link in ${path.relative(REPO_ROOT, file)}: "${link.raw}"`
          );
        }
      }
    }
  }

  failures.push(...findDuplicateParagraphs(files));
  failures.push(...findDuplicateCodeBlocks(files));

  if (failures.length > 0) {
    console.error('Blocking findings:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log('check-docs: OK — no broken links or duplicated canonical-contract passages.');
}

function findDuplicateParagraphs(files) {
  const seen = new Map();
  const duplicates = [];

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const rel = path.relative(REPO_ROOT, file);
    for (const { text, inCode } of splitOutsideFences(content)) {
      if (inCode) continue;
      for (const paragraph of text.split(/\n\s*\n/)) {
        const normalized = paragraph.replace(/\s+/g, ' ').trim();
        if (normalized.length < MIN_DUPLICATE_LENGTH) continue;
        if (normalized.startsWith('#') || normalized.startsWith('|')) continue;
        if (seen.has(normalized)) {
          duplicates.push(
            `Duplicated canonical paragraph in ${rel} and ${seen.get(normalized)}`
          );
        } else {
          seen.set(normalized, rel);
        }
      }
    }
  }

  return duplicates;
}

function findDuplicateCodeBlocks(files) {
  const seen = new Map();
  const duplicates = [];

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const rel = path.relative(REPO_ROOT, file);
    for (const { text, inCode } of splitOutsideFences(content)) {
      if (!inCode) continue;
      const normalized = text.replace(/\s+/g, ' ').trim();
      if (normalized.length < MIN_CODE_DUPLICATE_LENGTH) continue;
      if (seen.has(normalized)) {
        duplicates.push(
          `Duplicated code block in ${rel} and ${seen.get(normalized)}`
        );
      } else {
        seen.set(normalized, rel);
      }
    }
  }

  return duplicates;
}

function splitOutsideFences(content) {
  const chunks = [];
  let inCode = false;
  let current = '';
  let code = '';
  for (const line of content.split('\n')) {
    if (FENCE_RE.test(line)) {
      if (inCode) {
        chunks.push({ text: code, inCode: true });
        code = '';
      } else {
        chunks.push({ text: current, inCode: false });
        current = '';
      }
      inCode = !inCode;
      continue;
    }
    if (inCode) code += line + '\n';
    else current += line + '\n';
  }
  chunks.push({ text: inCode ? code : current, inCode });
  return chunks;
}

main();