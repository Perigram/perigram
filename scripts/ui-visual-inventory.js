export const SCOPED_STYLE_EXCEPTIONS = Object.freeze({
  'components/ChatSupport.vue': 'layout',
  'components/calls/CallPanel.vue': 'layout',
  'components/calls/CallWorkspacePage.vue': 'layout',
  'components/shared/AiAvatar.vue': 'layout',
  'components/shared/DesignerDialog.vue': 'layout',
  'components/shared/DesignerWorkspace.vue': 'layout',
  'components/shared/InstancePage.vue': 'layout',
  'components/shared/InstanceSurfaceContent.vue': 'layout',
  'components/shared/InstanceWorkspace.vue': 'layout',
  'components/shared/ResponsiveGrid.vue': 'layout',
  'components/generated/GeneratedInstanceCollection.vue': 'layout',
  'components/ui-mapping/CollectionTable.vue': 'layout',
  'components/ui-mapping/RegionBlock.vue': 'layout',
  'components/ui-mapping/SurfaceHeader.vue': 'layout',
  'pages/organization/users.vue': 'layout',
  'pages/organization/partners.vue': 'layout',
  'pages/organization/plugins.vue': 'layout',
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
  'components/ChatSupport.vue': ['data-driven', [
    ':style="rowContentStyle(option)"',
    ':style="{ opacity: swipeIconOpacity(messageItem) }"',
    ':style="swipeStyle(messageItem)"'
  ]],
  'components/shared/blocks/DataBlock.vue': ['data-driven', [':style="{ backgroundColor: row.swatch }"']],
  'components/entities/PenTemplate/PenTemplateCard.vue': ['data-driven', [':style="lineStyle"']],
  'components/shared/DesignerSocketHandle.vue': ['data-driven', [':style="processSocketHandleStyle(socket)"']],
  'components/ui-mapping/GanttCollection.vue': ['data-driven', [
    ':style="tickStyle(tick)"',
    ':style="todayStyle"',
    ':style="barStyle(row.bar)"',
    ':style="pointStyle(row.point)"'
  ]],
  'components/process-designer/LaneBands.vue': ['data-driven', [
    ':style="{ top: `${band.top}px`, left: `${left}px`, width: `${Math.max(0, right - left)}px`, borderTop: \'1px solid var(--p-content-border-color)\' }"',
    ':style="labelStyle"',
    ':style="{ left: `${corridor.x}px`, width: `${corridor.width}px`, top: `${corridor.top}px`, height: `${corridor.height}px` }"'
  ]],
  'components/shared/ChatSupportDialog.vue': ['layout', [":style=\"{ width: 'min(94vw, 25rem)' }\""]],
  'components/calls/CallFloatingWindow.vue': ['data-driven', [':style="windowStyle"']],
  'pages/organization/process.vue': ['data-driven', [
    ':style="selectionDialStyle"',
    ':style="{ left: `${contextPalette.x}px`, top: `${contextPalette.y}px` }"'
  ]],
});


const VISUAL_CONCERNS = [
  ['centralize:typography', /\b(?:text-(?:xs|sm|base|lg|xl|[2-9]xl|\[[0-9.]+(?:px|rem|em)\])|font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black|mono|serif)|tracking-(?:tighter|tight|normal|wide|wider|widest|\[[^\]]+\])|leading-(?:none|tight|snug|normal|relaxed|loose|\[[^\]]+\]))\b/g],
  ['centralize:layout', /\b(?:basis|gap|grid-cols|grid-rows|h|max-h|max-w|min-h|min-w|m[trblxy]?|p[trblxy]?|w)-\[[^\]]+\]/g],
  ['replace:chrome', /(?:\bbg-(?!(?:content|subtle|chrome|process-canvas|primary(?:-surface)?|signal-?|status-?)[\w-]*\b)[\w-]+\b|(?<![-\w])border(?:-[trblxy])?(?:-(?:0|2|4|8|primary|transparent|dashed|double))?(?!-)\b|(?<![-\w])rounded\b(?!-)|\bshadow-(?!(?:card|overlay)\b)[\w-]+\b|\[box-shadow:[^\]]+\])/g],
  ['remove:state', /\b(?:active|disabled|focus|focus-visible|hover|invalid):[^\s"'`]+/g],
  ['remove:important-override', /(?:^|\s)![a-z][a-z0-9]*(?:-[a-z0-9]+)+\b/g]
];

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
  // Normalize template interpolations to a word char so dynamic shapes
  // (`` bg-signal-${signal} ``) analyze like their static form.
  const visualSource = [classSource, ...scriptStringLiterals(source)].join('\n').replace(/\$\{[^}]*\}/g, 'x');
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
