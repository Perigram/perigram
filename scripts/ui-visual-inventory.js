import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { cncDesignSystemPrimitives } from '../packages/domain-cnc/src/ui.js';

export const SCOPED_STYLE_EXCEPTIONS = Object.freeze({
  'components/ChatSupport.vue': 'browser-pseudo',
  'components/QueueEditor.vue': 'layout',
  'components/entities/Queue/QueueEntryCard.vue': 'layout',
  'components/generated/GeneratedProjectWorkspace.vue': 'layout',
  'components/shared/DesignerDialog.vue': 'primevue-integration',
  'components/shared/DesignerWorkspace.vue': 'layout',
  'components/shared/EntityPage.vue': 'layout',
  'components/shared/EntityWorkspace.vue': 'layout',
  'components/shared/ResponsiveGrid.vue': 'layout',
  'components/shared/WorkspaceSplitNode.vue': 'operational-state',
  'components/shared/blocks/DataBlock.vue': 'layout',
  'components/shared/blocks/SpecsBlock.vue': 'layout'
});

export const SCOPED_LAYOUT_PROPERTIES = new Set([
  'align-items',
  'container-type',
  'display',
  'flex',
  'flex-direction',
  'grid-area',
  'grid-column',
  'grid-template-areas',
  'grid-template-columns',
  'grid-template-rows',
  'justify-content',
  'max-width',
  'min-height',
  'min-width',
  'overflow',
  'width'
]);

export const SCOPED_EXCEPTION_PROPERTIES = Object.freeze({
  'browser-pseudo': new Set(['background', 'border-radius', 'width']),
  layout: SCOPED_LAYOUT_PROPERTIES,
  'operational-state': new Set(['background']),
  'primevue-integration': new Set(['display', 'flex', 'min-height', 'padding'])
});

const REGISTERED_PRIMITIVE_PATHS = new Set(cncDesignSystemPrimitives.map(primitive => primitive.componentPath));

const VISUAL_CONCERNS = [
  ['centralize:typography', /\b(?:text-(?:xs|sm|base|lg|xl|[2-9]xl)|font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black)|tracking-(?:tighter|tight|normal|wide|wider|widest|\[[^\]]+\]))\b/g],
  ['centralize:layout', /\b(?:basis|gap|grid-cols|grid-rows|h|max-h|max-w|min-h|min-w|m[trblxy]?|p[trblxy]?|w)-\[[^\]]+\]/g],
  ['replace:chrome', /(?:\bbg-(?:content|subtle)\b|\bborder(?:-[trblxy])?(?:-(?:0|2|4|8|content-border|primary|transparent|dashed|double))?\b|\brounded(?:-[\w-]+)?\b|\bshadow(?:-[\w-]+)?\b|\[box-shadow:[^\]]+\])/g],
  ['remove:state', /\b(?:active|disabled|focus|focus-visible|hover|invalid):[^\s"'`]+/g],
  ['remove:important-override', /(?:^|\s)![\w\[][^\s"'`]*/gm]
];

const walkVueFiles = (dir, files = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) walkVueFiles(target, files);
    else if (entry.name.endsWith('.vue')) files.push(target);
  }
  return files;
};

export const inventoryId = (file) => `ui-${file.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

export const scopedStyleDeclarations = (source) => Array.from(
  source.match(/<style\s+scoped[^>]*>([\s\S]*?)<\/style>/)?.[1]?.matchAll(/(?:^|[;{])\s*([a-z-]+)\s*:/gm) || [],
  match => match[1]
);

export const analyzeVueVisuals = (file, source) => {
  const template = source
    .replace(/<script\b[\s\S]*?<\/script>/g, '')
    .replace(/<style\b[\s\S]*?<\/style>/g, '');
  const findings = VISUAL_CONCERNS.flatMap(([disposition, pattern]) => {
    const count = template.match(pattern)?.length || 0;
    return count ? [`${disposition} (${count})`] : [];
  });
  const scopedBody = source.match(/<style\s+scoped[^>]*>([\s\S]*?)<\/style>/)?.[1]?.trim();

  if (scopedBody) {
    const exception = SCOPED_STYLE_EXCEPTIONS[file];
    findings.push(exception ? `narrowly-allowlist:scoped-${exception}` : 'replace:scoped-visual');
  }

  return findings.length ? findings : ['compliant'];
};

export const repositoryVueInventory = (repoRoot) => [
  ...['components', 'layouts', 'pages'].flatMap(dir => walkVueFiles(path.join(repoRoot, dir))),
  path.join(repoRoot, 'error.vue')
]
  .filter(file => fs.existsSync(file))
  .map((absolutePath) => {
    const file = path.relative(repoRoot, absolutePath);
    return {
      id: inventoryId(file),
      file,
      findings: analyzeVueVisuals(file, fs.readFileSync(absolutePath, 'utf8'))
    };
  })
  .sort((a, b) => a.file.localeCompare(b.file));

export const inventoryOwnership = file => REGISTERED_PRIMITIVE_PATHS.has(file)
  ? 'shared/domain primitive'
  : 'derived usage';

const updateAudit = (repoRoot) => {
  const auditPath = path.join(repoRoot, 'docs/UI_COMPONENT_AUDIT.md');
  const source = fs.readFileSync(auditPath, 'utf8');
  const rows = repositoryVueInventory(repoRoot).map(({ id, file, findings }) =>
    `| \`${id}\` | \`${file}\` | ${inventoryOwnership(file)} | ${findings.join('; ')} |`
  );
  const inventory = [
    '## Component Inventory',
    '',
    'This generated matrix records durable ownership plus current source-derived',
    'visual findings. Counts are occurrences, not exemptions. Run',
    '`node scripts/ui-visual-inventory.js` after an intentional visual change;',
    '`shared/design-system.spec.js` fails when source and this matrix diverge.',
    '',
    '| ID | Path | Primary ownership | Current disposition |',
    '|---|---|---|---|',
    ...rows,
    ''
  ].join('\n');
  fs.writeFileSync(auditPath, `${source.slice(0, source.indexOf('## Component Inventory'))}${inventory}`);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  updateAudit(path.resolve(fileURLToPath(new URL('..', import.meta.url))));
}
