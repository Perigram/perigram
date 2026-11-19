import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  DESIGN_SYSTEM_ENTITY_CONTRACTS,
  DESIGN_SYSTEM_SURFACE_CONTRACTS,
  DESIGN_SYSTEM_VARIANTS,
  DESIGN_SYSTEM_PRIMITIVES,
  validateDesignSystemContracts,
  validateDesignSystemDisplayContracts
} from '../utils/design-system-contract.js';
import * as factories from '../test-data/factories.js';
import {
  cssVariableTokens,
  darkCssVariableTokens,
  designTokens,
  primeComponentTokens,
  primeSemanticTokens,
  tailwindThemeExtension
} from '../assets/tokens/index.js';
import { facadeFileTypes } from '../test-tools/facade-plugin.js';
import { CONTAINER_WIDTH_STEPS } from './ui-mapping/tables.js';
// Declaration-owned lifecycles replace the deleted legacy workflow table:
// one registry view projection derives entities and workflows.
import { createTypeRegistry, frameworkTypes as ctsFrameworkTypes, projectDomainFromView } from '#packages/cts';
import techDrawingListing from '../workers/tech-drawing/listing.json';
const techDrawingTypes = techDrawingListing.declarations.types;
const viewRegistry = createTypeRegistry({ id: 'design-system-view' });
for (const declaration of [...ctsFrameworkTypes, ...techDrawingTypes, ...facadeFileTypes]) viewRegistry.defineType(declaration);
// Machines are graph-compiled at runtime (SPEC §7: the projection carries
// no workflows); for status-source assertions the declared state trees
// normalize into the same machine shape the compiler emits.
const { normalizeWorkflow } = await import('#packages/core');
const declaredWorkflows = [...ctsFrameworkTypes, ...techDrawingTypes, ...facadeFileTypes]
  .filter(declaration => declaration.states && Object.keys(declaration.states).length);
// Declaration transitions fold into their axis region, the same fold the
// registry compiler performs for the graph-authored machines.
const cncWorkflows = Object.fromEntries(declaredWorkflows.map(declaration => {
  const regions = Object.fromEntries(Object.entries(declaration.states).map(([axis, region]) => [
    axis,
    {
      ...region,
      transitions: (declaration.transitions || []).filter(transition => (transition.axis || 'main') === axis)
    }
  ]));
  return [declaration.id, normalizeWorkflow({ regions })];
}));
import { frameworkTypes } from '#packages/cts';
import { normalizeType, renderPolicyFor } from '#packages/cts';
import { decorateDataValue, resolveDataPath } from '../utils/data-display.js';
import { resolveInstanceRelationRefs } from '../utils/instance-relations.js';
import {
  FILE_CHIP_CLASS,
  FILE_PROSE_CHIP_CLASS,
  INSTANCE_CHIP_CLASS,
  INSTANCE_PROSE_CHIP_CLASS
} from '../components/shared/chip-surface.js';
import {
  HOST_PROFILES,
  LAYOUT,
  SPACING_SCALES
} from '../shared/ui-mapping/index.js';
import {
  analyzeVueVisuals,
  INLINE_STYLE_EXCEPTIONS,
  inlineStyleAttributes,
  renderStyleBindings,
  SCOPED_EXCEPTION_PROPERTIES,
  SCOPED_STYLE_EXCEPTIONS,
  scopedStyleDeclarations,
  scriptStringLiterals
} from '../scripts/ui-visual-inventory.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

const declarationFor = (typeId) => [...frameworkTypes, ...techDrawingTypes, ...facadeFileTypes]
  .find(type => type.id === typeId);

const walkFiles = (dir, predicate, acc = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, predicate, acc);
    } else if (predicate(fullPath)) {
      acc.push(fullPath);
    }
  }
  return acc;
};

const usedVueFiles = () => ['components', 'layouts', 'pages']
  .flatMap((dir) => walkFiles(
    path.join(REPO_ROOT, dir),
    (file) => file.endsWith('.vue') && !file.endsWith('.old.vue') && !file.endsWith('.v23.vue')
  ))
  .map((file) => path.relative(REPO_ROOT, file));

describe('Design system manifest', () => {



  it('declares the standard entity card variants', () => {
    expect(DESIGN_SYSTEM_VARIANTS).toEqual(['card', 'compact', 'inline']);
  });

  it('has complete manifest entries and v24 DTO factories', () => {
    expect(validateDesignSystemContracts()).toEqual([]);
    expect(DESIGN_SYSTEM_ENTITY_CONTRACTS.length).toBeGreaterThan(0);

    for (const entry of DESIGN_SYSTEM_ENTITY_CONTRACTS) {
      const factory = factories[entry.factoryName];
      expect(typeof factory).toBe('function');

      const entity = factory();
      expect(entity.identity).toBeTruthy();
      expect(entity.origin).toBeTruthy();
      expect(entity.status).toBeTruthy();
      expect(entity.lineage).toBeTruthy();
      expect(entity.attachments).toBeTruthy();
      expect(entity.data).toBeTruthy();

    }
  });

  it('declares shared design-system primitives with existing components', () => {
    expect(DESIGN_SYSTEM_PRIMITIVES.length).toBeGreaterThan(0);

    for (const primitive of DESIGN_SYSTEM_PRIMITIVES) {
      expect(primitive.key).toBeTruthy();
      expect(primitive.kind).toBeTruthy();
      expect(fs.existsSync(path.join(REPO_ROOT, primitive.componentPath)), primitive.componentPath).toBe(true);
    }
  });

  it('renders every declared shared primitive in UI lab examples', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'pages/test/ui-lab.vue'), 'utf8');
    const match = source.match(/const PRIMITIVE_EXAMPLE_KEYS = \[([\s\S]*?)\];/);
    expect(match).toBeTruthy();

    const exampleKeys = Array.from(match[1].matchAll(/'([^']+)'/g)).map(item => item[1]).sort();
    const primitiveKeys = DESIGN_SYSTEM_PRIMITIVES.map(primitive => primitive.key).sort();

    expect(exampleKeys).toEqual(primitiveKeys);
    expect(source).toContain('DESIGN_SYSTEM_PRIMITIVES');
  });

  it('keeps design-system runtime exports distinct from contract exports', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'utils/design-system.js'), 'utf8');

    expect(source).not.toMatch(/export\s*\{[^}]*DESIGN_SYSTEM_(GROUPS|PRIMITIVES|VARIANTS)/);
  });

  it('formats concrete cassette parameter maps as exact named values', () => {
    const parameters = { A: 1200, B: 400, C: 35 };

    expect(decorateDataValue(parameters, { display: 'parameterMap' })).toBe('A=1200, B=400, C=35');
  });


  it('renders a revision-pinned canonical ref through its immutable revision entity', () => {
    expect(resolveInstanceRelationRefs({
      type: 'sheet_design',
      id: 'design-1',
      revisionId: 'revision-7'
    })).toEqual([{
      typeId: 'entity_revision',
      id: 'revision-7',
      source: { typeId: 'sheet_design', id: 'design-1' },
      entity: null
    }]);
  });


  it('uses real workflow definitions as the only interactive status source', () => {
    for (const entry of DESIGN_SYSTEM_ENTITY_CONTRACTS) {
      if (entry.status === 'interactive') {
        expect(cncWorkflows[entry.typeId], `${entry.key} is interactive without a workflow`).toBeTruthy();
      } else if (!cncWorkflows[entry.typeId]) {
        expect(entry.status, `${entry.key} without workflow must not be interactive`).not.toBe('interactive');
      }
    }
  });


  it('gives the UI lab test user a real access model', () => {
    const user = factories.createMockUser();

    expect(user.data.role).toBeTruthy();
    expect(user.data.permissions.projects).toBeTruthy();
    expect(user.data.memberships?.[0]?.organizationId).toBeTruthy();
    expect(user.data.memberships?.[0]?.permissions).toEqual(user.data.permissions);
  });

  it('exports token projections for PrimeVue, Tailwind, and CSS variables', () => {
    expect(designTokens.layout.pageMaxWidth).toBe('1600px');
    expect(cssVariableTokens['--ck-page-max-width']).toBe(designTokens.layout.pageMaxWidth);
    // The record document's measure is the arrangement wide step
    // (SPEC §22.17): the LAYOUT measure recipe consumes the token.
    expect(designTokens.layout.recordMeasure).toBe(`${CONTAINER_WIDTH_STEPS.wideRem}rem`);
    expect(cssVariableTokens['--ck-record-measure']).toBe(designTokens.layout.recordMeasure);
    expect(tailwindThemeExtension.maxWidth.app).toBe('var(--ck-page-max-width)');
    expect(tailwindThemeExtension.height['support-chat']).toBe('var(--ck-support-chat-height)');
    expect(tailwindThemeExtension.width.swatch).toBe('var(--ck-swatch-size)');
    // Pack editor surfaces and plugin surface modules compose with the
    // host's utility classes — the Tailwind content scan must cover both
    // trees or their classes compile to nothing (the split editor's
    // panes and the moved SketchEditor once rendered unstyled/hidden).
    const tailwindConfig = fs.readFileSync(path.join(REPO_ROOT, 'tailwind.config.js'), 'utf8');
    expect(tailwindConfig).toContain("'./packages/*/src/editors/**/*.{vue,js}'");
    expect(tailwindConfig).toContain("'./workers/facade/surfaces/**/*.{js,mjs}'");
    expect(primeComponentTokens).toEqual({
      fieldset: {
        root: { padding: '0 0.75rem 0.75rem' },
        legend: { padding: '0.25rem 0.5rem', gap: '0.375rem' }
      },
      panel: { root: { background: 'transparent', borderColor: 'transparent' } },
      panelmenu: { panel: { background: 'transparent' } },
      listbox: { root: { borderColor: 'transparent' } },
      splitter: { gutter: { background: 'transparent' } },
      card: { root: { shadow: 'none' } },
      tag: { root: { fontSize: '0.9375rem' } },
      datatable: {
        root: { background: 'transparent' },
        header: {
          background: 'transparent', borderColor: 'transparent', borderWidth: '0 0 0 0',
          padding: '0 0 0.75rem 0', sm: { padding: '0 0 0.5rem 0' }
        },
        headerCell: {
          background: 'transparent', hoverBackground: 'transparent',
          selectedBackground: 'transparent', borderColor: 'transparent'
        },
        bodyCell: { background: 'transparent', borderColor: 'transparent', sm: { padding: '0.5rem 0.75rem' } },
        body: { background: 'transparent' },
        row: { background: 'var(--p-content-background)' },
        footer: { background: 'transparent', borderColor: 'transparent' },
        footerCell: { background: 'transparent', borderColor: 'transparent' },
        paginatorTop: { borderColor: 'transparent', borderWidth: '0 0 0 0' },
        paginatorBottom: { borderColor: 'transparent', borderWidth: '0 0 0 0' }
      },
      treetable: {
        root: { background: 'transparent' },
        header: {
          background: 'transparent', borderColor: 'transparent', borderWidth: '0 0 0 0',
          padding: '0 0 0.75rem 0', sm: { padding: '0 0 0.5rem 0' }
        },
        headerCell: {
          background: 'transparent', hoverBackground: 'transparent',
          selectedBackground: 'transparent', borderColor: 'transparent'
        },
        bodyCell: { background: 'transparent', borderColor: 'transparent' },
        body: { background: 'transparent' },
        row: { background: 'var(--p-content-background)' },
        footer: { background: 'transparent', borderColor: 'transparent' },
        footerCell: { background: 'transparent', borderColor: 'transparent' },
        paginatorTop: { borderColor: 'transparent', borderWidth: '0 0 0 0' },
        paginatorBottom: { borderColor: 'transparent', borderWidth: '0 0 0 0' }
      },
      dataview: {
        root: { background: 'transparent' },
        header: { background: 'transparent', borderColor: 'transparent', borderWidth: '0 0 0 0', padding: '0 0 0.75rem 0' },
        content: { background: 'transparent' },
        footer: { background: 'transparent' },
        paginatorTop: { borderColor: 'transparent', borderWidth: '0 0 0 0' },
        paginatorBottom: { borderColor: 'transparent', borderWidth: '0 0 0 0' }
      },
      paginator: { root: { background: 'transparent' } },
      tabs: { tablist: { background: 'transparent' }, tabpanel: { background: 'transparent' } },
      tree: {
        root: { background: 'transparent', padding: '0', indent: '0.75rem' },
        node: { padding: '0.125rem 0.25rem' },
        nodeToggleButton: { size: '1.5rem' }
      }
    });
    expect(Object.keys(primeSemanticTokens)).toEqual(['primary', 'accent', 'formField', 'colorScheme']);
    expect(Object.keys(primeSemanticTokens.colorScheme)).toEqual(['light', 'dark']);
    expect(primeSemanticTokens.colorScheme.light.surface[100]).toBe('{zinc.100}');
    expect(primeSemanticTokens.colorScheme.dark.surface[950]).toBe('{zinc.950}');
    // Primary is a neutral contrast ink riding the zinc surface scale; the
    // Perigram logo red is the accent, reserved for text selection, the
    // decision signal, and brand ink. Focus rings and selection highlights
    // keep Aura's primary-driven defaults, so they stay neutral.
    expect(designTokens.palette.primary[500]).toBe('#71717a');
    expect(designTokens.palette.accent[500]).toBe('#ff0040');
    expect(primeSemanticTokens.colorScheme.light.primary.color).toBe('{surface.900}');
    expect(primeSemanticTokens.colorScheme.dark.primary.color).toBe('{surface.50}');
    expect(primeSemanticTokens.focusRing).toBeUndefined();
    expect(primeSemanticTokens.colorScheme.light.highlight).toBeUndefined();
    expect(primeSemanticTokens.colorScheme.dark.highlight).toBeUndefined();
    expect(cssVariableTokens['--ck-primary-700']).toBe(designTokens.palette.primary[700]);
    expect(cssVariableTokens['--ck-accent-700']).toBe(designTokens.palette.accent[700]);
    expect(cssVariableTokens['--ck-chrome-background']).toBe('var(--p-surface-100)');
    expect(cssVariableTokens['--ck-page-background']).toBe('var(--p-surface-100)');
    expect(darkCssVariableTokens['--ck-chrome-background']).toBe('var(--p-surface-950)');
    expect(darkCssVariableTokens['--ck-page-background']).toBe('var(--p-surface-950)');
    expect(cssVariableTokens['--ck-chrome-border']).toBe('var(--p-content-border-color)');
    expect(cssVariableTokens['--ck-process-canvas-background']).toBe('var(--p-surface-50)');
    expect(darkCssVariableTokens['--ck-process-canvas-background']).toBe('var(--p-surface-950)');
    expect(tailwindThemeExtension.colors['process-canvas']).toBe('var(--ck-process-canvas-background)');
    expect(designTokens).not.toHaveProperty('radius');
    expect(designTokens).not.toHaveProperty('shadow');
    expect(tailwindThemeExtension.borderRadius.ui).toBe('var(--p-border-radius-md)');
    expect(tailwindThemeExtension.borderRadius.panel).toBe('var(--p-border-radius-lg)');
    expect(tailwindThemeExtension.boxShadow.card).toBe('var(--p-card-shadow)');
    expect(tailwindThemeExtension.boxShadow.overlay).toBe('var(--p-overlay-popover-shadow)');
    expect(designTokens).not.toHaveProperty('motion');
    expect(designTokens).not.toHaveProperty('dock');
    expect(tailwindThemeExtension).not.toHaveProperty('transitionDuration');
    expect(tailwindThemeExtension).not.toHaveProperty('transitionTimingFunction');
  });

  it('keeps runtime visual tokens and Tailwind semantic aliases in sync', () => {
    const runtimeCss = fs.readFileSync(path.join(REPO_ROOT, 'assets/css/main.css'), 'utf8');
    const nuxtConfig = fs.readFileSync(path.join(REPO_ROOT, 'nuxt.config.js'), 'utf8');

    expect(designTokens.typography.ui).toContain('IBM Plex Sans');
    expect(designTokens.typography.mono).toContain('IBM Plex Mono');
    expect(designTokens.typography.serif).toContain('IBM Plex Serif');
    expect(cssVariableTokens['--ck-font-serif']).toBe(designTokens.typography.serif);
    expect(tailwindThemeExtension.fontFamily.serif).toBe('var(--ck-font-serif)');
    // The type-and-ink ladder (SPEC §4, owner direction 2026-10-27): the
    // small tier — labels, tags, small controls, technical data — renders
    // at 15px; body values render in full ink one step darker than
    // Aura's surface.700 default; muted stays surface.500 and serves
    // labels, supporting text, and placeholders alone.
    expect(designTokens.typography.roles.label.fontSize).toBe('0.9375rem');
    expect(designTokens.typography.roles.technical.fontSize).toBe('0.9375rem');
    expect(primeSemanticTokens.colorScheme.light.text).toEqual({ color: '{surface.800}', hoverColor: '{surface.900}' });
    expect(primeSemanticTokens.formField).toEqual({ sm: { fontSize: '0.9375rem' } });
    expect(cssVariableTokens['--ck-primary-ink']).toBe('#27272a');
    // Fact rows: small muted label beside the larger ink value; bounded
    // hosts (panes, popups) ride the compact rhythm, dialogs the page
    // rhythm.
    expect(LAYOUT.labelCell).toBe('shrink-0 text-label text-muted');
    expect(HOST_PROFILES.popup.density).toBe(0.75);
    expect(HOST_PROFILES.dialog.density).toBe(1);
    expect(HOST_PROFILES.pane.density).toBe(0.75);
    // Default chips (SPEC §22.8) ride Aura's geometry with the bordered
    // surface recipe; the prose face carries the inline-code layout for
    // page text blocks and their read composition.
    expect(FILE_CHIP_CLASS).toBe('bg-subtle min-w-0 max-w-full border border-content-border text-supporting');
    expect(INSTANCE_CHIP_CLASS).toBe('bg-transparent min-w-0 max-w-full border border-content-border text-supporting');
    expect(FILE_PROSE_CHIP_CLASS).toBe('border border-content-border bg-subtle ck-chip inline-flex min-w-0 max-w-full items-center align-baseline font-sans font-normal text-[0.875em] leading-none');
    expect(INSTANCE_PROSE_CHIP_CLASS).toBe('border border-content-border bg-transparent ck-chip inline-flex min-w-0 max-w-full items-center align-baseline font-sans font-normal text-[0.875em] leading-none');
    expect(Object.keys(designTokens.typography.roles)).toEqual([
      'page-title',
      'record-title',
      'section-heading',
      'body',
      'label',
      'supporting',
      'metric',
      'technical',
      'prose',
      'editor'
    ]);
    for (const role of Object.values(designTokens.typography.roles)) {
      expect(role).toEqual(expect.objectContaining({
        fontFamily: expect.any(String),
        fontSize: expect.any(String),
        lineHeight: expect.any(String),
        fontWeight: expect.any(String)
      }));
    }
    expect(designTokens.typography.roles['page-title'].fontSize).toContain('clamp(');
    expect(Object.entries(designTokens.typography.roles).filter(([name, role]) => name !== 'page-title' && role.fontSize.includes('clamp('))).toEqual([]);
    expect(tailwindThemeExtension).not.toHaveProperty('fontSize');
    expect(nuxtConfig).toContain("import { cssVariableTokens, darkCssVariableTokens, primeFormFluidPT, primeTabsStripPT } from './assets/tokens/index.js'");
    expect(nuxtConfig).toContain('cssDeclarations(cssVariableTokens)');
    expect(nuxtConfig).toContain('cssDeclarations(darkCssVariableTokens)');
    expect(nuxtConfig).toContain('pt: { ...primeFormFluidPT, ...primeTabsStripPT }');
    expect(nuxtConfig.match(/\n\s*app:\s*\{/g)).toHaveLength(1);
    expect(runtimeCss).not.toContain('.dark-mode');
    expect(runtimeCss).not.toMatch(/--p-[\w-]+\s*:/);
    expect(runtimeCss).not.toMatch(/[^{}]*\.p-[\w-]+[^{}]*\{/);
    expect(runtimeCss).not.toContain('!important');
    expect(fs.readdirSync(path.join(REPO_ROOT, 'assets/css')).filter(file => file.endsWith('.css')).sort())
      .toEqual(['fonts.css', 'main.css', 'variants.css']);
    expect(runtimeCss).not.toContain('chrome-signal');
    expect(cssVariableTokens['--ck-chrome-background']).toBe('var(--p-surface-100)');
    expect(cssVariableTokens['--ck-page-background']).toBe('var(--p-surface-100)');
    expect(darkCssVariableTokens['--ck-chrome-background']).toBe('var(--p-surface-950)');
    expect(darkCssVariableTokens['--ck-page-background']).toBe('var(--p-surface-950)');
    expect(cssVariableTokens['--ck-chrome-border']).toBe('var(--p-content-border-color)');
    expect(cssVariableTokens['--ck-process-canvas-background']).toBe('var(--p-surface-50)');
    expect(Object.keys(cssVariableTokens).filter(token => /(?:radius|shadow)/.test(token))).toEqual([]);
    expect(Object.keys(darkCssVariableTokens).filter(token => /(?:radius|shadow)/.test(token))).toEqual([]);
    expect(Object.keys(cssVariableTokens).filter(token => /(?:motion|ease|dock)/.test(token))).toEqual([]);
    expect(runtimeCss).not.toMatch(/--ck-(?:radius|shadow)/);
    expect(tailwindThemeExtension.colors.primary[200]).toBe('var(--p-primary-200)');
    expect(tailwindThemeExtension.colors.primary.ink).toBe('var(--ck-primary-ink)');
    expect(tailwindThemeExtension.colors.status.danger).toBe('var(--ck-status-danger)');
    expect(tailwindThemeExtension.colors.status.info).toBe('var(--ck-status-info)');
    expect(tailwindThemeExtension.colors.entity.command).toBe('var(--ck-entity-tone-command)');
    expect(tailwindThemeExtension.colors.signal.entity).toBe('var(--ck-signal-entity)');
    expect(tailwindThemeExtension).not.toHaveProperty('letterSpacing');

    const appLayout = fs.readFileSync(path.join(REPO_ROOT, 'layouts/app.vue'), 'utf8');
    const uiLabLayout = fs.readFileSync(path.join(REPO_ROOT, 'layouts/ui-lab-layout.vue'), 'utf8');
    expect(appLayout).not.toContain('chrome-signal-rule');
    expect(uiLabLayout).not.toContain('chrome-signal-rule');
  });

  it('assigns typography roles on their owning surfaces', () => {
    const fontsCss = fs.readFileSync(path.join(REPO_ROOT, 'assets/css/fonts.css'), 'utf8');
    const factRows = fs.readFileSync(path.join(REPO_ROOT, 'components/shared/FactRows.vue'), 'utf8');
    const actionToolbar = fs.readFileSync(path.join(REPO_ROOT, 'components/shared/ActionToolbar.vue'), 'utf8');
    const filePayloadViewer = fs.readFileSync(path.join(REPO_ROOT, 'components/shared/FilePayloadViewer.vue'), 'utf8');
    const textDocumentEditor = fs.readFileSync(path.join(REPO_ROOT, 'workers/documents/surfaces/text-editor.mjs'), 'utf8');
    const supportMessageContent = fs.readFileSync(path.join(REPO_ROOT, 'components/shared/SupportMessageContent.vue'), 'utf8');

    expect(fontsCss).toContain(':where(input, button, select, textarea)');
    expect(fontsCss).not.toMatch(/:where\((?:p|blockquote|h[1-6]|code|pre)/);
    expect(fontsCss).not.toContain('.ck-prose');
    // Fact value typography is semantic: measured values (number,
    // quantity, instant) and code-shaped identifiers wear the technical
    // mono face with tabular numerals; ordinary text wears the body face.
    expect(factRows).toContain("row.role === 'technical' ? 'text-technical tabular-nums' : 'text-body'");
    expect(actionToolbar).toContain("props.level <= 1 ? 'text-page-title' : 'text-section-heading'");
    // Document surfaces read in the app's prose voice (serif), not the
    // technical mono role: file payload previews, the single-surface live
    // markdown editor, and agent chat answers — an agent answer is a
    // markdown room document (human chat text stays in the UI voice; the
    // technical mono role stays with data surfaces like the csv table
    // and FactRows).
    expect(filePayloadViewer).toContain('text-prose');
    expect(filePayloadViewer).not.toContain('text-technical');
    expect(textDocumentEditor).toContain('text-prose');
    expect(supportMessageContent).toContain('text-prose');
  });

  it('rides the spacing ladder in the generative tree', () => {
    // SPEC §22.9: steps 1/2/3/4/6/8 only; half-steps belong to the
    // rhythm interpolator (SPACING_SCALES), keyed by density.
    const offLadder = /(?:^|[\s"'`/])((?:gap|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr)-(?:0\.5|1\.5|2\.5|3\.5|5|7))(?=[\s"'`/]|$)/;
    const layoutOffenders = Object.entries(LAYOUT)
      .filter(([, recipe]) => offLadder.test(` ${recipe} `))
      .map(([key]) => `LAYOUT.${key}`);
    expect(layoutOffenders).toEqual([]);

    // The interpolator owns the half-steps alone: its full steps ride
    // the ladder like every static recipe.
    const offLadderFullStep = /(?:^|[\s"'`/])((?:gap|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr)-(?:5|7))(?=[\s"'`/]|$)/;
    const scaleOffenders = Object.entries(SPACING_SCALES)
      .filter(([, set]) => Object.values(set).some(recipe => typeof recipe === 'string' && offLadderFullStep.test(` ${recipe} `)))
      .map(([scale]) => `SPACING_SCALES.${scale}`);
    expect(scaleOffenders).toEqual([]);

    const offenders = usedVueFiles()
      .filter(file => file.startsWith('components/ui-mapping/'))
      .filter(file => offLadder.test(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('bans case transforms on app surfaces', () => {
    // Section labels render in natural case (SPEC §22.8); a transform
    // utility is the stamp the law retires. Plugin editor surfaces and
    // package editors count as app surfaces.
    const caseTransform = /\b(?:uppercase|lowercase|capitalize)\b/;
    const editorSurfaces = [
      ...walkFiles(path.join(REPO_ROOT, 'workers'), (file) => /[/\\]surfaces[/\\].*\.(mjs|js)$/.test(file)),
      ...walkFiles(path.join(REPO_ROOT, 'packages'), (file) => /[/\\]src[/\\]editors[/\\].*\.(vue|js|mjs)$/.test(file))
    ].map((file) => path.relative(REPO_ROOT, file));
    const offenders = [...usedVueFiles(), ...editorSurfaces]
      .filter((file) => caseTransform.test(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8')));

    expect(offenders).toEqual([]);
  });

  it('keeps app chrome and process signals on semantic color aliases', () => {
    const rawPaletteUtility = /\b(?:bg|text|border|ring)-(?:slate|zinc|gray|neutral|stone|blue|sky|teal|cyan|indigo|violet|fuchsia|purple|emerald|green|lime|red|orange|amber|yellow|pink|rose)-\d{1,3}\b/;
    const offenders = usedVueFiles().filter((file) => rawPaletteUtility.test(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8')));

    expect(offenders).toEqual([]);
  });

  it('rejects feature-level visual drift outside explicit layout and data styling', () => {
    const rawTypography = /\b(?:text-(?:xs|sm|base|lg|xl|[2-9]xl|\[(?:\d+(?:\.\d+)?)(?:px|rem|em)\])|font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black|mono|serif)|tracking-(?:tighter|tight|normal|wide|wider|widest|\[[^\]]+\])|leading-(?:none|tight|snug|normal|relaxed|loose|\[[^\]]+\]))\b/;
    const staticFontSize = /\bfont-size=["']\d/;
    const dynamicFontSizeFiles = new Set([
      'components/shared/DrawingCanvas.vue'
    ]);
    const rawSurfaceBorder = /\bborder-surface-\d+\b/;
    const nonsemanticShadow = /\bshadow-(?:sm|md|lg|xl|2xl)\b/;
    const nonsemanticRadius = /!?\brounded-(?:sm|md|lg|xl|2xl|3xl)\b/;
    const files = usedVueFiles();

    expect(files.filter(file => rawTypography.test(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8')))).toEqual([]);
    expect(files.filter(file => staticFontSize.test(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8')))).toEqual([]);
    expect(new Set(files.filter(file => /:font-size=/.test(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8'))))).toEqual(dynamicFontSizeFiles);
    for (const file of dynamicFontSizeFiles) {
      expect(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8')).toContain('Data-driven exception:');
    }
    expect(files.filter(file => rawSurfaceBorder.test(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8')))).toEqual([]);
    expect(files.filter(file => nonsemanticShadow.test(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8')))).toEqual([]);
    expect(files.filter(file => nonsemanticRadius.test(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8')))).toEqual([]);
    expect(files.filter((file) => {
      const source = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
      const scopedBody = source.match(/<style\s+scoped[^>]*>([\s\S]*?)<\/style>/)?.[1]?.trim();
      return scopedBody && !SCOPED_STYLE_EXCEPTIONS[file];
    })).toEqual([]);

    for (const [file, category] of Object.entries(SCOPED_STYLE_EXCEPTIONS)) {
      const source = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
      expect(source, `${file} must retain its ${category} scoped exception`).toMatch(/<style\s+scoped/);
      const allowedProperties = SCOPED_EXCEPTION_PROPERTIES[category];
      expect(allowedProperties, `${file} has unknown scoped exception category`).toBeTruthy();
      // Custom property declarations pass layout measures between
      // selectors; the visual vocabulary governs real properties.
      expect(scopedStyleDeclarations(source).filter(property => !property.startsWith('--') && !allowedProperties.has(property)), file).toEqual([]);
    }
    expect(new Set(Object.values(SCOPED_STYLE_EXCEPTIONS))).toEqual(new Set(['layout']));
    expect(SCOPED_EXCEPTION_PROPERTIES.layout.has('padding')).toBe(false);
    expect(new Set(Object.values(INLINE_STYLE_EXCEPTIONS).map(([category]) => category))
      .difference(new Set(['data-driven', 'layout'])).size).toBe(0);

    for (const [file, [category, expectedStyles]] of Object.entries(INLINE_STYLE_EXCEPTIONS)) {
      expect(files, `${file} must retain its ${category} inline exception`).toContain(file);
      const source = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
      expect(inlineStyleAttributes(source), `${file} changed its ${category} inline exception surface`).toEqual(expectedStyles);
    }

    expect(analyzeVueVisuals(
      'workers/facade/surfaces/cassette-designer.mjs',
      '<template><div :style="{ borderRadius: \'1rem\' }" /></template>'
    )).toContain('replace:inline-visual (1)');
    const renderVisual = '<script>\nexport default {\n  render() { return h(\'div\', { style: { borderRadius: \'1rem\' } }) }\n}\n</script>';
    expect(renderStyleBindings(renderVisual)).toHaveLength(1);
    expect(analyzeVueVisuals('components/RenderSurface.vue', renderVisual)).toContain('replace:render-visual (1)');
    const scriptClasses = '<script setup>\nconst classes = [\'text-xs\', selected ? `rounded shadow-sm` : \'\']\n</script>';
    expect(scriptStringLiterals(scriptClasses)).toEqual(['text-xs', 'rounded shadow-sm', '']);
    expect(analyzeVueVisuals('components/ScriptClasses.vue', scriptClasses)).toEqual([
      'centralize:typography (1)',
      'replace:chrome (2)'
    ]);

    const runtimeCss = fs.readFileSync(path.join(REPO_ROOT, 'assets/css/main.css'), 'utf8');
    expect(runtimeCss).not.toMatch(/:where\(button, a, input[^}]+outline:\s*none/s);
  });

  it('uses existing semantic variables for SVG designer label contrast', () => {
    const drawingCanvas = fs.readFileSync(path.join(REPO_ROOT, 'components/shared/DrawingCanvas.vue'), 'utf8');

    expect(drawingCanvas).not.toContain('--ck-content-background');
    expect(drawingCanvas).toContain('fill-[var(--p-content-background)]');
  });

  it('keeps raw Card and Dialog ownership inside shared wrappers', () => {
    const allowed = new Set([
      'components/shared/InstanceCard.vue',
      'components/shared/StandardDialog.vue',
      'components/shared/DesignerDialog.vue',
      'components/shared/ChatSupportDialog.vue',
      'components/ui-mapping/SurfaceBody.vue',
      'components/ui-mapping/GeneratedMappingScreen.vue',
      'components/ui-mapping/CardGrid.vue',
      'components/ui-mapping/BoardCollection.vue',
      'components/ui-mapping/StatGrid.vue',
    ]);

    const offenders = usedVueFiles().filter((file) => {
      if (allowed.has(file)) return false;
      const source = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
      return /primevue\/card|primevue\/dialog|<Card\b|<Dialog\b/.test(source);
    });

    expect(offenders).toEqual([]);
  });

  it('keeps useBlocks composables inside shared primitives', () => {
    const offenders = usedVueFiles().filter((file) => {
      if (file.startsWith('components/shared/')) return false;
      const source = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
      return /composables\/useBlocks|useIdentity\(|useStatus\(|useSpecs\(/.test(source);
    });

    expect(offenders).toEqual([]);
  });

  it('keeps framework manifest UI fields tied to canonical DTO paths', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'framework.manifest.json'), 'utf8'));

    expect(manifest.validations).toEqual({ ok: true, issues: [] });
    // The legacy residual field-group map died with the fact channel: no
    // design-system component carries legacy fact rows anymore.
  });

  it('declares constructor surfaces and field groups in the domain contract', () => {
    expect(validateDesignSystemDisplayContracts()).toEqual([]);

    // Declared types (framework, tech-drawing, CNC pack) carry their
    // display vocabulary on the declaration (name, glyph, field labels);
    // fact grouping derives at compile (sections over the row). Legacy
    // field-group keys remain only for undeclared types.
    const bundleDeclared = new Set([
      'penTemplate', 'layerStandard',
      'user', 'organization', 'entityRevision'
    ]);
    for (const key of bundleDeclared) {
      const entry = DESIGN_SYSTEM_ENTITY_CONTRACTS.find(contract => contract.key === key);
      const type = normalizeType(declarationFor(entry.typeId.replace(/_/g, '-')));
      expect(type.name, `${key} declares its name`).toBeTruthy();
      expect(type.render, `${key} carries no render facet`).toBeUndefined();
      // The bundle projection derives the sections and the display
      // policy (renderPolicyFor): total assignment — every section field
      // is a real row field, every row field lands in exactly one.
      const policy = renderPolicyFor(type);
      const rowFields = Object.keys(type.fields);
      expect(policy.sections.flatMap(section => section.fields)).toHaveLength(rowFields.length);
      expect(policy.sections.every(section => section.fields.every(name => type.fields[name]))).toBe(true);
      for (const name of rowFields) {
        expect(policy.sections.filter(section => section.fields.includes(name)), `${key}.${name} lands in exactly one section`).toHaveLength(1);
      }
    }

    for (const entry of DESIGN_SYSTEM_ENTITY_CONTRACTS) {
      expect(DESIGN_SYSTEM_SURFACE_CONTRACTS[entry.key]?.surfaces).toEqual(expect.objectContaining({
        inline: expect.any(Object),
        compact: expect.any(Object),
        card: expect.any(Object),
        detail: expect.any(Object)
      }));
    }

  });

  it('keeps entity card fields on the generated derivation, out of component-local path arrays', () => {
    const offenders = walkFiles(
      path.join(REPO_ROOT, 'components/entities'),
      (file) => file.endsWith('.vue') && !file.endsWith('.old.vue') && !file.endsWith('.v23.vue')
    ).filter((file) => /path:\s*['"][^'"]+['"]/.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(REPO_ROOT, file));

    expect(offenders).toEqual([]);
  });

  it('keeps entity full-card subtitles from duplicating body facts', () => {
    const offenders = walkFiles(
      path.join(REPO_ROOT, 'components/entities'),
      (file) => file.endsWith('.vue')
    )
      .map((file) => path.relative(REPO_ROOT, file))
      .filter((file) => {
        const source = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
        return /<template\s+#subtitle(?![^>]*v-if="variant (?:=== 'compact'|!== 'card')[^"]*")/.test(source);
      });

    expect(offenders).toEqual([]);
  });

  it('keeps admin navigation tied to existing admin routes', () => {
    const layout = fs.readFileSync(path.join(REPO_ROOT, 'layouts/app.vue'), 'utf8');
    const navigation = fs.readFileSync(path.join(REPO_ROOT, 'stores/navigation.js'), 'utf8');

    for (const route of [
      '/admin/domain-builder',
      '/admin/data-model-review',
      '/admin/diagnostics',
      '/admin/organizations',
      '/admin/marketing-animations',
      '/admin/settings'
    ]) {
      expect(layout).not.toContain(route);
      expect(navigation).not.toContain(route);
    }
  });

  it('rejects color utility classes that resolve to no theme color', () => {
    // A class like `text-muted-color` (PrimeVue docs naming) compiles to no
    // CSS unless the Tailwind extension defines that exact key — dead
    // classes silently fall back to inherited color and read as "all text
    // is one color" in dark mode. Every used color utility must resolve.
    const colorKeys = new Set(Object.keys(tailwindThemeExtension.colors));
    for (const [name, value] of Object.entries(tailwindThemeExtension.colors)) {
      if (value && typeof value === 'object') {
        for (const subKey of Object.keys(value)) colorKeys.add(`${name}-${subKey}`);
      }
    }
    const typographyUtilities = new Set(Object.keys(designTokens.typography.roles)
      .map(role => `text-${role}`));
    const builtin = new Set(['transparent', 'current', 'inherit', 'none']);
    // Border width/side/style utilities, box-sizing, transition-property
    // words that share names with utilities (for example `border-color`
    // inside a transition string), and the stock Tailwind palette names are
    // not dead-class candidates: stock names compile (palette drift is the
    // audit matrix's concern); this test rejects classes that resolve to
    // no CSS at all.
    const nonColorKeys = /^(left|right|center|start|end|xs|sm|base|lg|xl|2xl|3xl|none|auto|truncate|underline|overline|line-through|ellipsis|clip|balance|pretty|nowrap|pre-wrap|pre-line|break-words|uppercase|lowercase|capitalize|thin|extralight|light|normal|medium|semibold|bold|extrabold|italic|not-italic|dashed|dotted|double|solid|hidden|inline|block|flex|box|color|white|black|red|yellow|green|blue|indigo|purple|pink|orange|amber|lime|emerald|teal|cyan|sky|violet|fuchsia|rose|slate|gray|zinc|neutral|stone|[blrtxy](-?[0-9]+)?|[tlbr]{2}(-?[0-9]+)?|[0-9]+)$/;
    const resolves = (utility, key) => colorKeys.has(key)
      || colorKeys.has(`${utility}-${key}`)
      || builtin.has(key)
      || nonColorKeys.test(key);

    const offenders = [];
    for (const file of usedVueFiles()) {
      // Arbitrary values carry their own value, including CSS variable names
      // that read like color utilities (`[clip-path:inset(0_round_var(--p-border-radius-md))]`
      // is not a `border-radius` color). Strip bracket groups before the scan.
      const source = fs.readFileSync(file, 'utf8').replace(/\[[^\]]*\]/g, '');
      for (const match of source.matchAll(/[\s"'`](text|bg|border|ring|outline|decoration|divide)-([a-z0-9][a-z0-9-]*)(?=[\s"'`/]|$)/g)) {
        const utility = match[1];
        const key = match[2];
        if (typographyUtilities.has(`${utility}-${key}`)) continue;
        // Arbitrary values like text-[var(--x)] carry their own value; the
        // regex cannot match them because of the bracket, but values bound
        // through :class strings are excluded by the boundary above.
        if (!resolves(utility, key)) offenders.push(`${path.relative(REPO_ROOT, file)}: ${utility}-${key}`);
      }
    }
    expect(offenders).toEqual([]);
  });




  it('keeps entity cards on shared InstanceCard title chrome', () => {
    const offenders = walkFiles(
      path.join(REPO_ROOT, 'components/entities'),
      (file) => file.endsWith('Card.vue') && !file.endsWith('.old.vue') && !file.endsWith('.v23.vue')
    ).filter((file) => fs.readFileSync(file, 'utf8').includes('<template #title>'))
      .map((file) => path.relative(REPO_ROOT, file));

    expect(offenders).toEqual([]);
  });

  it('leaves entity card and popover chrome to Aura', () => {
    const entityCard = fs.readFileSync(path.join(REPO_ROOT, 'components/shared/InstanceCard.vue'), 'utf8');
    const runtimeCss = fs.readFileSync(path.join(REPO_ROOT, 'assets/css/main.css'), 'utf8');

    expect(entityCard).not.toMatch(/border-content-border|shadow-|box-shadow|hover:border|\.p-card-|!p-/);
    expect(runtimeCss).not.toMatch(/--ck-(?:radius|shadow)/);
    expect(runtimeCss).not.toMatch(/\.instance-inline-(?:chip|compact)[^{]*\{[^}]*(?:background|border(?:-radius)?|box-shadow|padding)\s*:/s);
  });



  it('keeps sheet layout editing on semantic layer and bounded snap contracts', () => {
    const editor = fs.readFileSync(path.join(REPO_ROOT, 'workers/facade/surfaces/sheet-design-editor.mjs'), 'utf8');
    const relationBlock = fs.readFileSync(path.join(REPO_ROOT, 'components/shared/InstanceRelationsBlock.vue'), 'utf8');

    expect(editor).toContain('applyLayerPens');
    expect(editor).toContain("resolvedStyle('contour.material_sheet')");
    expect(editor).toContain('freeSheetPlacement');
    expect(editor).toContain('majorGridSize');
    expect(editor).toContain('selectedSnapPoint');
    expect(relationBlock).toContain(':variant="itemVariant"');
  });

  it('keeps inline design editing inside its active workspace', () => {
    const cassetteDesigner = fs.readFileSync(path.join(REPO_ROOT, 'workers/facade/surfaces/cassette-designer.mjs'), 'utf8');

    expect(cassetteDesigner).toContain('saveTemplate({ saveAs: true })');
    expect(cassetteDesigner).toContain('handleDesignerEscape');
  });

  it('keeps generated collection cards as horizontal carousel items', () => {
    const relationsBlock = fs.readFileSync(path.join(REPO_ROOT, 'components/shared/InstanceRelationsBlock.vue'), 'utf8');
    const surfaceContent = fs.readFileSync(path.join(REPO_ROOT, 'components/shared/InstanceSurfaceContent.vue'), 'utf8');
    const inlineRef = fs.readFileSync(path.join(REPO_ROOT, 'components/shared/InstanceInlineRef.vue'), 'utf8');
    const instanceCard = fs.readFileSync(path.join(REPO_ROOT, 'components/shared/InstanceCard.vue'), 'utf8');
    const entityPreview = fs.readFileSync(path.join(REPO_ROOT, 'components/shared/InstancePreview.vue'), 'utf8');

    const messageAttachments = fs.readFileSync(path.join(REPO_ROOT, 'components/shared/MessageAttachments.vue'), 'utf8');
    expect(messageAttachments).toContain("ownMessage ? 'items-end' : 'items-start'");
    expect(messageAttachments).toContain("ownMessage ? 'justify-end' : 'justify-start'");

    expect(relationsBlock).toContain('overflow-x-auto');
    expect(relationsBlock).toContain('instance-relations-gallery--compact');
    expect(relationsBlock).toContain('isCompactGallery.value ? 2 : 4');
    expect(relationsBlock).toContain('instance-relations-overflow-tile');
    expect(relationsBlock).toContain('openOverflow');
    expect(relationsBlock).toContain('overflowItems');
    expect(relationsBlock).toContain('itemVariant');
    expect(relationsBlock).toContain("field.display === 'entityRefList'");
    expect(surfaceContent).toContain('instanceFactRows');
    expect(surfaceContent).toContain('relationVariant');
    expect(inlineRef).toContain("variant === 'compact'");
    expect(inlineRef).toContain("'w-full' : null");
    expect(inlineRef).toContain('useEntityPopup');
    expect(inlineRef).toContain('StateTag');
    expect(inlineRef).toContain('compactStatusState');
    // The stacked chat card carries its state tag inside the one-line
    // header; the standalone status row stays with the row layout.
    expect(inlineRef).toContain("compactLayout !== 'stacked'");
    expect(inlineRef).toContain('instance-inline-compact-status-row');
    expect(inlineRef).not.toContain('instance-inline-compact-fallback');
    expect(instanceCard).toContain('primevue/chip');
    expect(instanceCard).toContain('INSTANCE_CHIP_CLASS');
    expect(instanceCard).toContain('titleFor');
    expect(entityPreview).toContain('hideDimensionLayer');
    expect(entityPreview).toContain(':hide-dimension-layer="hideDimensionLayer"');
    expect(entityPreview).toContain('InstancePreviewMedia');
    expect(fs.readFileSync(path.join(REPO_ROOT, 'components/shared/GeometryPreview.vue'), 'utf8')).toContain('isProductionPreviewLayer');
    expect(fs.readFileSync(path.join(REPO_ROOT, 'components/shared/GeometryPreview.vue'), 'utf8')).toContain('isDimensionLayerName');
    expect(entityPreview).toContain('RemoteInstancePreview');
  });



  it('keeps entity detail components on shared record chrome', () => {
    const offenders = walkFiles(
      path.join(REPO_ROOT, 'components/entities'),
      (file) => file.endsWith('Detail.vue') && !file.endsWith('.old.vue') && !file.endsWith('.v23.vue')
    ).filter((file) => {
      const source = fs.readFileSync(file, 'utf8');
      return /<TraceChain\s+:entity|<InstanceState\b/.test(source);
    }).map((file) => path.relative(REPO_ROOT, file));

    expect(offenders).toEqual([]);
  });

  it('keeps status popovers free of placeholder copy and duplicate last-updated sections', () => {
    const entityStatus = fs.readFileSync(path.join(REPO_ROOT, 'components/shared/state/InstanceState.vue'), 'utf8');
    const statusHistory = fs.readFileSync(path.join(REPO_ROOT, 'components/shared/state/StateHistory.vue'), 'utf8');

    expect(entityStatus).not.toContain("common.actions.title");
    expect(entityStatus).not.toContain("common.lastUpdated");
    expect(entityStatus).not.toContain("common.history");
    expect(entityStatus).not.toContain("metadata?.note");
    expect(statusHistory).not.toContain("status.noHistory");
    expect(statusHistory).toContain('displayEvents');
  });

  it('keeps factory demo states aligned with workflow definitions and resolves declared state display from the states facet', () => {
    for (const entry of DESIGN_SYSTEM_ENTITY_CONTRACTS) {
      const workflow = cncWorkflows[entry.typeId];
      if (!workflow) continue;
      const normalizedWorkflow = normalizeWorkflow(workflow);
      const workflowStates = Object.values(normalizedWorkflow.regions || {})
        .flatMap(region => Object.keys(region.states || {}));

      const entity = factories[entry.factoryName]();
      expect(
        workflowStates,
        `${entry.key} factory state ${entity.status.state} must exist in workflow ${entry.typeId}`
      ).toContain(entity.status.state);
    }

    // Declared state display resolves on the states facet (SPEC §7):
    // every declared workflow value must resolve a display policy with a
    // label and severity through the compiled bundle derivation.
    const declarations = [...frameworkTypes, ...techDrawingTypes, ...facadeFileTypes];
    for (const declaration of declarations) {
      const type = normalizeType(declaration);
      const axis = type.states?.main;
      if (!axis) continue;
      const resolved = renderPolicyFor(type).states.main;
      for (const value of axis.values) {
        expect(
          resolved[value],
          `${type.id}.${value} must resolve a states-facet display policy`
        ).toBeTruthy();
        expect(typeof resolved[value].label).toBe('string');
        expect(resolved[value].severity).toBeTruthy();
      }
    }
  });

  it('formats generated fact values without artificial object strings', () => {
    const entity = {
      data: {
        count: 3,
        active: true,
        tags: ['A', 'B'],
        items: [{ id: 'item-1' }, { id: 'item-2' }],
        catalog: { code: 'RAL-9016' },
        geometry: { vertices: [] }
      }
    };

    expect(resolveDataPath(entity, 'data.catalog.code')).toBe('RAL-9016');
    expect(decorateDataValue(entity.data.count, { suffix: ' pcs' })).toBe('3 pcs');
    expect(decorateDataValue(entity.data.active, { trueLabel: 'Yes', falseLabel: 'No' })).toBe('Yes');
    expect(decorateDataValue(entity.data.tags)).toBe('A, B');
    expect(decorateDataValue(entity.data.items)).toBe('2');
    expect(decorateDataValue(entity.data.catalog)).toBe('RAL-9016');
    expect(decorateDataValue(entity.data.geometry)).toBeNull();
    expect(decorateDataValue(entity.data.geometry)).not.toBe('[object Object]');
  });
});
