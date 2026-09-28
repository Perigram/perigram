import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DESIGN_SYSTEM_PRIMITIVES } from '../utils/design-system-contract.js';

export const SCOPED_STYLE_EXCEPTIONS = Object.freeze({
  'components/ChatSupport.vue': 'layout',
  'components/calls/CallPanel.vue': 'layout',
  'components/calls/CallWorkspacePage.vue': 'layout',
  'components/shared/DesignerDialog.vue': 'layout',
  'components/shared/DesignerWorkspace.vue': 'layout',
  'components/shared/InstancePage.vue': 'layout',
  'components/shared/InstanceSurfaceContent.vue': 'layout',
  'components/shared/InstanceWorkspace.vue': 'layout',
  'components/shared/ResponsiveGrid.vue': 'layout',
  'components/generated/GeneratedInstanceCollection.vue': 'layout',
  'components/ui-mapping/CollectionTable.vue': 'layout',
  'components/ui-mapping/HierarchyTable.vue': 'layout',
  'components/ui-mapping/SurfaceHeader.vue': 'layout',
  'pages/organization/users.vue': 'layout',
  'pages/organization/partners.vue': 'layout',
  'pages/profile/index.vue': 'layout',
  'components/shared/blocks/DataBlock.vue': 'layout'
});

export const SCOPED_LAYOUT_PROPERTIES = new Set([
  'align-items',
  'align-self',
  'border-collapse',
  'border-spacing',
  'justify-self',
  'container-type',
  'display',
  'flex',
  'flex-direction',
  'flex-wrap',
  'grid-area',
  'grid-column',
  'grid-template-areas',
  'grid-template-columns',
  'grid-template-rows',
  'justify-content',
  'left',
  'margin',
  'position',
  'z-index',
  'max-height',
  'max-width',
  'min-height',
  'min-width',
  'overflow',
  'width',
  // Text flow is layout, not typography: wrap behavior sizes the box
  // (long labels grow the row instead of overflowing it).
  'white-space',
  'text-overflow',
  'overflow-wrap',
  'word-break'
]);

export const SCOPED_EXCEPTION_PROPERTIES = Object.freeze({
  layout: SCOPED_LAYOUT_PROPERTIES
});

export const INLINE_STYLE_EXCEPTIONS = Object.freeze({
  'components/calls/CallPanel.vue': ['data-driven', [':style="{ left: `${reaction.left}%` }"']],
  'components/calls/CallTile.vue': ['data-driven', [':style="hugAspect ? { aspectRatio: String(tile.aspect) } : null"']],
  'components/CassetteDesignerV2.vue': ['data-driven', [
    ':style="{ left: `${inlineEditor.x}px`, top: `${inlineEditor.y}px` }"',
    ':style="workpieceAccentStyle(row.id)"'
  ]],
  'components/ChatSupport.vue': ['data-driven', [
    ':style="{ opacity: swipeIconOpacity(messageItem) }"',
    ':style="swipeStyle(messageItem)"'
  ]],
  'components/shared/blocks/DataBlock.vue': ['data-driven', [':style="{ backgroundColor: row.swatch }"']],
  'components/entities/PenTemplate/PenTemplateCard.vue': ['data-driven', [':style="lineStyle"']],
  'components/shared/DesignerSocketHandle.vue': ['data-driven', [':style="processSocketHandleStyle(socket)"']],
  'components/shared/InstanceInlineRef.vue': ['data-driven', [':style="toneStyle"', ':style="toneStyle"']],
  'components/ui-mapping/GanttCollection.vue': ['data-driven', [
    ':style="tickStyle(tick)"',
    ':style="todayStyle"',
    ':style="barStyle(row.bar)"',
    ':style="pointStyle(row.point)"'
  ]],
});

const REGISTERED_PRIMITIVE_PATHS = new Set(DESIGN_SYSTEM_PRIMITIVES.map(primitive => primitive.componentPath));

const VISUAL_CONCERNS = [
  ['centralize:typography', /\b(?:text-(?:xs|sm|base|lg|xl|[2-9]xl|\[[0-9.]+(?:px|rem|em)\])|font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black|mono|serif)|tracking-(?:tighter|tight|normal|wide|wider|widest|\[[^\]]+\])|leading-(?:none|tight|snug|normal|relaxed|loose|\[[^\]]+\]))\b/g],
  ['centralize:layout', /\b(?:basis|gap|grid-cols|grid-rows|h|max-h|max-w|min-h|min-w|m[trblxy]?|p[trblxy]?|w)-\[[^\]]+\]/g],
  ['replace:chrome', /(?:\bbg-(?!(?:content|subtle|chrome)\b)[\w-]+\b|\bborder(?:-[trblxy])?(?:-(?:0|2|4|8|primary|transparent|dashed|double))?\b|\brounded\b|\brounded-(?!(?:ui|t-ui)\b)[\w-]+\b|\bshadow-(?!(?:card|overlay)\b)[\w-]+\b|\[box-shadow:[^\]]+\])/g],
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

export const inlineStyleAttributes = source => Array.from(
  source.matchAll(/(?:\bv-bind:|:)style\s*=\s*"[^"]*"|\bstyle\s*=\s*"[^"]*"/g),
  match => match[0].replace(/\s+/g, ' ')
);

export const renderStyleBindings = source => /^\s*render\s*\(\)\s*\{/m.test(source)
  ? Array.from(source.matchAll(/\bstyle\s*:\s*(?:\{|[A-Za-z_$][\w$]*)/g), match => match[0])
  : [];

export const scriptStringLiterals = source => Array.from(
  source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g),
  match => match[1]
).flatMap(script => Array.from(
  script.matchAll(/(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g),
  match => match[2]
));

export const analyzeVueVisuals = (file, source) => {
  const template = source
    .replace(/<script\b[\s\S]*?<\/script>/g, '')
    .replace(/<style\b[\s\S]*?<\/style>/g, '');
  const classSource = Array.from(
    template.matchAll(/(?:^|\s):?class\s*=\s*["']([^"']*)["']/g),
    match => match[1]
  ).join('\n');
  const visualSource = [classSource, ...scriptStringLiterals(source)].join('\n');
  const findings = VISUAL_CONCERNS.flatMap(([disposition, pattern]) => {
    const count = visualSource.match(pattern)?.length || 0;
    return count ? [`${disposition} (${count})`] : [];
  });
  const scopedBody = source.match(/<style\s+scoped[^>]*>([\s\S]*?)<\/style>/)?.[1]?.trim();

  if (scopedBody) {
    const exception = SCOPED_STYLE_EXCEPTIONS[file];
    findings.push(exception ? `compliant:scoped-${exception}` : 'replace:scoped-visual');
  }

  const inlineStyles = inlineStyleAttributes(template);
  if (inlineStyles.length) {
    const [category, expectedStyles] = INLINE_STYLE_EXCEPTIONS[file] || [];
    findings.push(category && JSON.stringify(inlineStyles) === JSON.stringify(expectedStyles)
      ? `${category === 'data-driven' ? 'narrowly-allowlist' : 'compliant'}:inline-${category} (${inlineStyles.length})`
      : `replace:inline-visual (${inlineStyles.length})`);
  }

  const renderStyles = renderStyleBindings(source);
  if (renderStyles.length) findings.push(`replace:render-visual (${renderStyles.length})`);

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
