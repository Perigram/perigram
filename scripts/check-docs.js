#!/usr/bin/env node

/* Documentation guardrail for README.md integrity.
 *
 * Blocking findings:
 *  1. Broken internal markdown links (relative targets that do not resolve to
 *     an existing file under the repository), including links that resolve
 *     outside the repository root.
 *  2. Duplicated canonical-contract passages: verbatim paragraphs of
 *     meaningful length repeated across more than one README. Canonical
 *     contracts (entity registries, DTO blocks, machines, lineage, auth
 *     context, workflow actions) must live in one canonical README and be
 *     linked, not restated.
 *  3. Duplicated fenced code blocks: canonical examples (workflow shapes,
 *     DTO snapshots, socket contracts) must also live in one canonical README
 *     and be linked, not re-pasted.
 *  4. Orphaned READMEs: a README.md no other markdown file links (the root
 *     README is the tree entry).
 *
 * Advisory findings (reported, non-blocking):
 *  5. Contract-shaped code comments without a README home: block comments
 *     (or // runs) long enough and normative enough to be authoring or
 *     compilation semantics. Contracts live in READMEs; a comment that
 *     states one is a misplaced contract and should either become a README
 *     paragraph (leaving the comment as a pointer) or be consciously kept
 *     as tracked debt. Flagged comments that already mention a README are
 *     considered pointed and pass.
 *
 * Run from the repository root: `node scripts/check-docs.js`.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const SKIP_DIRS = new Set([
  'node_modules',
  '.nuxt',
  '.output',
  '.git',
  // Agent session worktrees are ephemeral per-session checkouts: scanning
  // them flags every committed README passage against its own copies while
  // parallel sessions run. `.agent-wt*` are the same sessions' scratch
  // checkouts (root README Development notes).
  '.agent-worktrees',
  '.agent-wt-hyd',
  'coverage',
  'dist',
  '.obsidian'
]);

// Vendored upstream distributions carry their own READMEs, help and
// source comments: the tree documents the integration, not the shipped
// app's own documentation.
const SKIP_PATHS = [
  path.join(REPO_ROOT, 'workers/tech-drawing/assets/vendor/cadcraft/app')
];

// Submodule content is pinned by commit; fresh worktrees leave it unpopulated.
const SUBMODULE_PATHS = (() => {
  try {
    const gitmodules = readFileSync(path.join(REPO_ROOT, '.gitmodules'), 'utf8');
    return [...gitmodules.matchAll(/path\s*=\s*(.+)/g)].map(m => path.join(REPO_ROOT, m[1].trim()));
  } catch {
    return [];
  }
})();

const EXCLUDED_PATHS = SKIP_PATHS.concat(SUBMODULE_PATHS);

function insideSubmodule(file) {
  return SUBMODULE_PATHS.some(prefix => file === prefix || file.startsWith(prefix + path.sep));
}

const FENCE_RE = /^```/;

const MIN_DUPLICATE_LENGTH = 180;

const MIN_CODE_DUPLICATE_LENGTH = 60;

function skipped(dir) {
  return EXCLUDED_PATHS.some(prefix => dir === prefix || dir.startsWith(prefix + path.sep));
}

export function walk(dir) {
  const out = [];
  if (skipped(dir)) return out;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.agent-wt')) continue;
    const full = path.join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

export function collectLinks(content, file) {
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

export function resolveTarget(link) {
  const fileDir = path.dirname(link.file);
  const targetNoAnchor = decodeURIComponent(link.raw.split('#')[0]);
  if (targetNoAnchor === '') return null;
  const resolved = path.resolve(fileDir, targetNoAnchor);
  return path.relative(REPO_ROOT, resolved);
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
        const rel = resolveTarget(link);
        if (rel === null) continue;
        if (rel.startsWith('..')) {
          failures.push(
            `Out-of-root link in ${path.relative(REPO_ROOT, file)}: "${link.raw}"`
          );
          continue;
        }
        const abs = path.join(REPO_ROOT, rel);
        if (!existsSync(abs) && !insideSubmodule(abs)) {
          failures.push(
            `Broken link in ${path.relative(REPO_ROOT, file)}: "${link.raw}"`
          );
        }
      }
    }
  }

  failures.push(...findOrphanedReadmes(files));
  failures.push(...findDuplicateParagraphs(files));
  failures.push(...findDuplicateCodeBlocks(files));

  const contractDebt = findContractShapedComments();
  if (contractDebt.length) {
    console.log(`Contract-homing debt (${contractDebt.length}) — comments stating semantics that belong in a README:`);
    for (const finding of contractDebt) console.log(`  ~ ${finding}`);
  }

  if (failures.length > 0) {
    console.error('Blocking findings:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log('check-docs: OK — no broken links or duplicated canonical-contract passages.');
}

// A README is registered when a different markdown file links it; the root
// README is the tree entry.
function findOrphanedReadmes(files) {
  const linked = new Set();
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    for (const { text } of splitOutsideFences(content)) {
      for (const link of collectLinks(text, file)) {
        const rel = resolveTarget(link);
        if (rel === null || rel.startsWith('..')) continue;
        const resolved = path.join(REPO_ROOT, rel);
        if (resolved === file) continue;
        linked.add(resolved);
      }
    }
  }
  const orphans = [];
  for (const file of files) {
    if (path.basename(file) !== 'README.md') continue;
    if (file === path.join(REPO_ROOT, 'README.md')) continue;
    if (!linked.has(file)) {
      orphans.push(`Orphaned README (no inbound markdown link): ${path.relative(REPO_ROOT, file)}`);
    }
  }
  return orphans;
}

function findDuplicateParagraphs(files) {  const seen = new Map();
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

const CONTRACT_COMMENT_MIN_LENGTH = 240;
const CONTRACT_COMMENT_MARKERS = [
  'must', 'never', 'always', 'owns', 'contract', 'doctrine', 'semantics',
  'invariant', 'canonical', 'SPEC §', 'authored', 'authoring'
];
const CONTRACT_COMMENT_MIN_MARKERS = 3;
const SOURCE_ROOTS = ['server/features', 'server/core', 'server/runtime', 'packages', 'shared', 'utils', 'composables', 'workers'];

function walkSource(dir, out = []) {
  if (skipped(dir)) return out;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      // package-level walk starts at packages/<name>/src
      if (dir === path.join(REPO_ROOT, 'packages') && !existsSync(path.join(full, 'src'))) continue;
      walkSource(full, out);
    } else if (/\.js$|\.vue$|\.ts$/.test(entry) && !/\.spec\.[jt]s$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

// A contract-shaped comment: long prose with repeated normative vocabulary
// — the shape of "how this concern compiles / what this authored data
// means", which the docs model homes in READMEs. Local implementation
// notes rarely reach this density of normative language.
function findContractShapedComments() {
  const findings = [];
  const files = SOURCE_ROOTS.flatMap(root => {
    const base = path.join(REPO_ROOT, root);
    if (root === 'packages') return walkSource(base);
    return walkSource(base);
  });
  const seen = new Set();
  for (const file of files) {
    if (seen.has(file)) continue;
    seen.add(file);
    const content = readFileSync(file, 'utf8');
    const rel = path.relative(REPO_ROOT, file);
    const blocks = [
      ...content.matchAll(/\/\*\*?([\s\S]*?)\*\//g)
    ].map(match => match[1]);
    // // line runs of 3+ lines
    let run = [];
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('//')) {
        run.push(trimmed.replace(/^\/\/+\s?/, ''));
      } else {
        if (run.length >= 3) blocks.push(run.join(' '));
        run = [];
      }
    }
    if (run.length >= 3) blocks.push(run.join(' '));
    for (const block of blocks) {
      const text = block.replace(/\s+/g, ' ').trim();
      if (text.length < CONTRACT_COMMENT_MIN_LENGTH) continue;
      // A comment citing its canonical home (a README link or a SPEC
      // section reference) is pointed, not debt.
      if (/README|SPEC §/.test(text)) continue;
      const markers = CONTRACT_COMMENT_MARKERS.filter(marker => text.includes(marker));
      if (markers.length < CONTRACT_COMMENT_MIN_MARKERS) continue;
      findings.push(`${rel} — contract-shaped comment (${text.length} chars; markers: ${markers.join(', ')})`);
    }
  }
  return findings;
}

export function splitOutsideFences(content) {
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

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();