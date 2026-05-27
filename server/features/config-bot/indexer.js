import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join, relative, resolve } from 'node:path';

const APP_DOC_PATHS = [
  'README.md',
  'server/README.md',
  'server/features/README.md',
  'server/runtime/README.md',
  'server/core/commands/README.md',
  'server/core/tasks/README.md',
  'server/core/access/README.md',
  'components/README.md',
  'components/shared/README.md',
  'composables/README.md',
  'packages/README.md',
  'packages/domain-cnc/README.md',
  'packages/mcp/README.md',
  'packages/devtools/README.md',
  'docs/DESIGN_SYSTEM.md',
  'docs/FRAMEWORK_EXTRACTION_STATUS.md'
];

const CORTEX_DOC_NAMES = new Set([
  'ConfigBot как интерфейс настройки платформы.md',
  'cutkit-core как доменное ядро.md',
  'RAG.md',
  'Ollama.md',
  'Частный AI-сервер на локальной модели с подключением к облачным LLM.md'
]);

const SKIP_DIRS = new Set([
  '.git',
  '.nuxt',
  '.output',
  '.obsidian',
  'node_modules',
  '6_assets'
]);

export async function buildConfigBotKnowledge({
  rootDir = process.cwd(),
  cortexPath = process.env.CONFIG_BOT_CORTEX_PATH || '/home/isuo/Documents/cutkit-cortex'
} = {}) {
  const chunks = [];
  chunks.push(...await loadAppDocs(rootDir));
  chunks.push(...await loadCortexDocs(cortexPath));
  return chunks;
}

async function loadAppDocs(rootDir) {
  const docs = [];
  for (const path of APP_DOC_PATHS) {
    const absolutePath = resolve(rootDir, path);
    if (!existsSync(absolutePath)) continue;
    docs.push(...chunkDocument({
      source: 'app',
      path,
      content: await readFile(absolutePath, 'utf8')
    }));
  }
  return docs;
}

async function loadCortexDocs(cortexPath) {
  if (!cortexPath || !existsSync(cortexPath)) return [];
  const root = resolve(cortexPath);
  const files = await collectMarkdownFiles(root);
  const selected = files.filter(file => CORTEX_DOC_NAMES.has(basename(file)));
  const docs = [];

  for (const file of selected) {
    docs.push(...chunkDocument({
      source: 'cortex',
      path: relative(root, file),
      content: await readFile(file, 'utf8')
    }));
  }
  return docs;
}

async function collectMarkdownFiles(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectMarkdownFiles(fullPath, out);
      continue;
    }
    if (entry.isFile() && extname(entry.name).toLowerCase() === '.md' && (await stat(fullPath)).size < 200000) {
      out.push(fullPath);
    }
  }
  return out;
}

export function chunkDocument({ source, path, content }) {
  const sections = [];
  let current = { title: path, lines: [] };

  for (const line of String(content || '').split('\n')) {
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading && current.lines.length) {
      sections.push(current);
      current = { title: heading[1].trim(), lines: [line] };
      continue;
    }
    if (heading) current.title = heading[1].trim();
    current.lines.push(line);
  }
  if (current.lines.length) sections.push(current);

  return sections.flatMap(section => splitSection({
    source,
    path,
    title: section.title,
    content: section.lines.join('\n').trim()
  }));
}

function splitSection(section) {
  const maxLength = 1800;
  const content = section.content || '';
  if (content.length <= maxLength) return [{ ...section, content }];

  const chunks = [];
  for (let offset = 0; offset < content.length; offset += maxLength) {
    chunks.push({
      ...section,
      title: `${section.title} (${chunks.length + 1})`,
      content: content.slice(offset, offset + maxLength)
    });
  }
  return chunks;
}
