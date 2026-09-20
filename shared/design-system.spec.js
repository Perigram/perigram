import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  DESIGN_SYSTEM_ENTITY_CONTRACTS,
  DESIGN_SYSTEM_FIELD_GROUPS,
  DESIGN_SYSTEM_SURFACES,
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
import { cncWorkflows } from '../packages/domain-cnc/src/index.js';
import { normalizeWorkflow } from '../packages/workflows/src/index.js';
import { decorateDataValue, resolveDataPath } from '../utils/data-display.js';
import { resolveEntityRelationRefs } from '../utils/entity-relations.js';
import { STATUS_MAPPINGS } from '../utils/status-engine.js';
import { getWorkflowStatusActions } from '../utils/status-actions.js';
import {
  analyzeVueVisuals,
  inventoryId,
  inventoryOwnership,
  INLINE_STYLE_EXCEPTIONS,
  inlineStyleAttributes,
  renderStyleBindings,
  repositoryVueInventory,
  SCOPED_EXCEPTION_PROPERTIES,
  SCOPED_STYLE_EXCEPTIONS,
  scopedStyleDeclarations,
  scriptStringLiterals
} from '../scripts/ui-visual-inventory.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

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

const repositoryVueFiles = () => [
  ...['components', 'layouts', 'pages'].flatMap((dir) => walkFiles(
    path.join(REPO_ROOT, dir),
    (file) => file.endsWith('.vue')
  )),
  path.join(REPO_ROOT, 'error.vue')
]
  .filter((file) => fs.existsSync(file))
  .map((file) => path.relative(REPO_ROOT, file))
  .sort();

describe('Design system manifest', () => {
  it('reconciles every repository Vue file and design-system mechanism with the canonical audit', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'docs/UI_COMPONENT_AUDIT.md'), 'utf8');
    const rows = Array.from(source.matchAll(/^\| `(ui-[^`]+)` \| `([^`]+\.vue)` \|/gm));
    const documentedFiles = rows.map(([, , file]) => file).sort();
    const expectedFiles = repositoryVueFiles();
    const expectedMechanisms = [
      'aura',
      'token-source',
      'primevue-projection',
      'tailwind-projection',
      'css-variable-projection',
      'preset',
      'tailwind-aliases',
      'global-css',
      'runtime-overrides',
      'scoped-css',
      'primitive-registry',
      'runtime-registry',
      'ui-lab',
      'enforcement'
    ];
    const documentedMechanisms = Array.from(source.matchAll(/^\| `(mechanism-[^`]+)` \|/gm))
      .map(([, id]) => id.replace('mechanism-', ''))
      .sort();

    expect(documentedFiles).toEqual(expectedFiles);
    expect(new Set(documentedFiles).size).toBe(documentedFiles.length);
    expect(rows.filter(([, id, file]) => id !== inventoryId(file))).toEqual([]);
    expect(documentedMechanisms).toEqual(expectedMechanisms.sort());
  });

  it('reconciles current visual findings with every canonical inventory row', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'docs/UI_COMPONENT_AUDIT.md'), 'utf8');
    const documented = new Map(Array.from(
      source.matchAll(/^\| `(ui-[^`]+)` \| `([^`]+\.vue)` \| [^|]+ \| ([^|]+) \|$/gm),
      match => [match[2], match[3].trim()]
    ));

    for (const { file, findings } of repositoryVueInventory(REPO_ROOT)) {
      expect(documented.get(file), file).toBe(findings.join('; '));
    }
  });

  it('derives component ownership from the primitive registry', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'docs/UI_COMPONENT_AUDIT.md'), 'utf8');
    const documented = new Map(Array.from(
      source.matchAll(/^\| `ui-[^`]+` \| `([^`]+\.vue)` \| ([^|]+) \|/gm),
      match => [match[1], match[2].trim()]
    ));

    for (const file of repositoryVueFiles()) {
      expect(documented.get(file), file).toBe(inventoryOwnership(file));
    }
  });

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

      for (const doc of entry.docs) {
        expect(fs.existsSync(doc), `${entry.key} doc missing: ${doc}`).toBe(true);
      }
    }
  });

  it('declares shared design-system primitives with existing components and docs', () => {
    expect(DESIGN_SYSTEM_PRIMITIVES.length).toBeGreaterThan(0);

    for (const primitive of DESIGN_SYSTEM_PRIMITIVES) {
      expect(primitive.key).toBeTruthy();
      expect(primitive.kind).toBeTruthy();
      expect(fs.existsSync(path.join(REPO_ROOT, primitive.componentPath)), primitive.componentPath).toBe(true);

      for (const doc of primitive.docs || []) {
        expect(fs.existsSync(path.join(REPO_ROOT, doc)), `${primitive.key} doc missing: ${doc}`).toBe(true);
      }
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

  it('uses canonical artifact attachment and data type shape', () => {
    const artifact = factories.createMockArtifact();

    expect(artifact.data.type).toBe('LAYOUT_DXF');
    expect(artifact.attachments.primary.fileId).toBeTruthy();
    expect(artifact.fileId).toBeUndefined();
  });

  it('uses string cassette template parameters matching the DTO contract', () => {
    const template = factories.createMockCassetteTemplate();
    const cassette = factories.createMockCassette();

    expect(template.data.parameters).toEqual(['A', 'B', 'C']);
    expect(cassette.data.parameters).toEqual(['A', 'B', 'C']);
    expect(cassette.data.type).toBe('PARAMETRIC');
    expect(template).not.toHaveProperty('parameters');
  });

  it('formats cassette design parameter maps as exact named values', () => {
    const design = factories.createMockCassetteDesign();

    expect(decorateDataValue(design.data.parameters, { display: 'parameterMap' })).toBe('A=1200, B=400, C=35');
  });

  it('normalizes relation lists for compact generated card galleries', () => {
    expect(resolveEntityRelationRefs([
      { type: 'material_pile', id: 'pile-1' },
      { type: 'sheet', id: 'sheet-1' },
      { type: 'remnant', id: 'remnant-1' }
    ])).toEqual([
      { entityType: 'material_pile', id: 'pile-1', entity: null },
      { entityType: 'sheet', id: 'sheet-1', entity: null },
      { entityType: 'remnant', id: 'remnant-1', entity: null }
    ]);

    expect(resolveEntityRelationRefs({
      sheetIds: ['sheet-1'],
      remnantIds: ['remnant-1'],
      cassetteInstanceIds: ['instance-1']
    })).toEqual([]);
  });

  it('renders a revision-pinned canonical ref through its immutable revision entity', () => {
    expect(resolveEntityRelationRefs({
      type: 'sheet_design',
      id: 'design-1',
      revisionId: 'revision-7'
    })).toEqual([{
      entityType: 'entity_revision',
      id: 'revision-7',
      source: { entityType: 'sheet_design', id: 'design-1' },
      entity: null
    }]);
  });

  it('keeps material pile and batch pile demo DTOs distinct', () => {
    const material = factories.createMockMaterial();
    const materialPile = factories.createMockPile();
    const batchPile = factories.createMockBatchPile();

    expect(material.data.code).toBe('ACP');
    expect(materialPile.lineage.requisitionId).toBeUndefined();
    expect(batchPile.lineage.requisitionId).toBeTruthy();
    expect(batchPile.data.serial).toBeTruthy();
    expect(batchPile.data.stock.total).toBeGreaterThan(batchPile.data.stock.used);
  });

  it('uses real workflow definitions as the only interactive status source', () => {
    for (const entry of DESIGN_SYSTEM_ENTITY_CONTRACTS) {
      if (entry.status === 'interactive') {
        expect(cncWorkflows[entry.entityType], `${entry.key} is interactive without a workflow`).toBeTruthy();
      } else if (!cncWorkflows[entry.entityType]) {
        expect(entry.status, `${entry.key} without workflow must not be interactive`).not.toBe('interactive');
      }
    }
  });

  it('allows status actions to use a live workflow override', () => {
    const actions = getWorkflowStatusActions({
      entityType: 'queue',
      state: 'DRAFT',
      workflows: {
        queue: {
          initial: 'DRAFT',
          states: { DRAFT: {}, READY_FOR_TEST: {} },
          transitions: [{ from: 'DRAFT', to: 'READY_FOR_TEST' }]
        }
      }
    });

    expect(actions.map(action => action.to)).toEqual(['READY_FOR_TEST']);
  });

  it('passes target lifecycle evidence schema through status actions', () => {
    const actions = getWorkflowStatusActions({
      entityType: 'queue',
      state: 'DRAFT',
      workflows: {
        queue: {
          initial: 'DRAFT',
          states: {
            DRAFT: {},
            SENT: {
              lifecycle: {
                description: { required: true },
                attachments: { proof: { required: true } }
              }
            }
          },
          transitions: [{ from: 'DRAFT', to: 'SENT' }]
        }
      }
    });

    expect(actions[0].lifecycle).toEqual({
      description: { required: true },
      attachments: { proof: { required: true } }
    });
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
    expect(tailwindThemeExtension.maxWidth.app).toBe('var(--ck-page-max-width)');
    expect(tailwindThemeExtension.height['support-chat']).toBe('var(--ck-support-chat-height)');
    expect(tailwindThemeExtension.height['preview-dialog']).toBe('var(--ck-preview-dialog-height)');
    expect(tailwindThemeExtension.width.swatch).toBe('var(--ck-swatch-size)');
    expect(primeComponentTokens).toEqual({
      card: { root: { shadow: 'none' } },
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
        bodyCell: { background: 'transparent' },
        body: { background: 'transparent' },
        row: { background: 'transparent' },
        footer: { background: 'transparent', borderColor: 'transparent' },
        footerCell: { background: 'transparent', borderColor: 'transparent' }
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
        bodyCell: { background: 'transparent' },
        body: { background: 'transparent' },
        row: { background: 'transparent' },
        footer: { background: 'transparent', borderColor: 'transparent' },
        footerCell: { background: 'transparent', borderColor: 'transparent' }
      },
      dataview: {
        root: { background: 'transparent' },
        header: { background: 'transparent', borderColor: 'transparent', borderWidth: '0 0 0 0', padding: '0 0 0.75rem 0' },
        content: { background: 'transparent' },
        footer: { background: 'transparent' }
      },
      paginator: { root: { background: 'transparent' } },
      tabs: { tablist: { background: 'transparent' }, tabpanel: { background: 'transparent' } },
      tree: { root: { background: 'transparent' } }
    });
    expect(Object.keys(primeSemanticTokens)).toEqual(['primary', 'colorScheme']);
    expect(Object.keys(primeSemanticTokens.colorScheme)).toEqual(['light', 'dark']);
    expect(primeSemanticTokens.colorScheme.light.surface[100]).toBe('{zinc.100}');
    expect(primeSemanticTokens.colorScheme.dark.surface[950]).toBe('{zinc.950}');
    expect(designTokens.palette.primary[500]).toBe('#ff4b00');
    expect(cssVariableTokens['--ck-primary-700']).toBe(designTokens.palette.primary[700]);
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
    expect(Object.keys(designTokens.typography.roles)).toEqual([
      'page-title',
      'section-heading',
      'body',
      'label',
      'supporting',
      'metric',
      'technical',
      'prose'
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
    expect(nuxtConfig).toContain("import { cssVariableTokens, darkCssVariableTokens } from './assets/tokens/index.js'");
    expect(nuxtConfig).toContain('cssDeclarations(cssVariableTokens)');
    expect(nuxtConfig).toContain('cssDeclarations(darkCssVariableTokens)');
    expect(nuxtConfig.match(/\n\s*app:\s*\{/g)).toHaveLength(1);
    expect(runtimeCss).not.toContain('.dark-mode');
    expect(runtimeCss).not.toMatch(/--p-[\w-]+\s*:/);
    expect(runtimeCss).not.toMatch(/[^{}]*\.p-[\w-]+[^{}]*\{/);
    expect(runtimeCss).not.toContain('!important');
    expect(fs.readdirSync(path.join(REPO_ROOT, 'assets/css')).filter(file => file.endsWith('.css')).sort())
      .toEqual(['fonts.css', 'main.css', 'variants.css']);
    expect(runtimeCss).toContain('.chrome-signal-rule');
    expect(runtimeCss).toContain('border-top-width: var(--ck-chrome-signal-height)');
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
    expect(appLayout).toContain('chrome-signal-rule');
    expect(uiLabLayout).toContain('chrome-signal-rule');
  });

  it('assigns typography roles on their owning surfaces', () => {
    const fontsCss = fs.readFileSync(path.join(REPO_ROOT, 'assets/css/fonts.css'), 'utf8');
    const dataBlock = fs.readFileSync(path.join(REPO_ROOT, 'components/shared/blocks/DataBlock.vue'), 'utf8');
    const actionToolbar = fs.readFileSync(path.join(REPO_ROOT, 'components/shared/ActionToolbar.vue'), 'utf8');
    const artifactViewer = fs.readFileSync(path.join(REPO_ROOT, 'components/artifacts/ArtifactViewer.vue'), 'utf8');
    const artifactTextEditor = fs.readFileSync(path.join(REPO_ROOT, 'components/artifacts/ArtifactTextEditor.vue'), 'utf8');
    const supportMessageContent = fs.readFileSync(path.join(REPO_ROOT, 'components/shared/SupportMessageContent.vue'), 'utf8');

    expect(fontsCss).toContain(':where(input, button, select, textarea)');
    expect(fontsCss).not.toMatch(/:where\((?:p|blockquote|h[1-6]|code|pre)/);
    expect(fontsCss).not.toContain('.ck-prose');
    expect(dataBlock).toContain('text-technical');
    expect(actionToolbar).toContain("props.level <= 1 ? 'text-page-title' : 'text-section-heading'");
    expect(artifactViewer).toContain('text-technical');
    expect(artifactTextEditor).toContain('text-prose');
    expect(supportMessageContent).not.toContain('text-prose');
  });

  it('keeps shared status and entity accents inside the token system', () => {
    const entityInlineRef = fs.readFileSync(path.join(REPO_ROOT, 'components/shared/EntityInlineRef.vue'), 'utf8');
    const statusBadge = fs.readFileSync(path.join(REPO_ROOT, 'components/shared/blocks/StatusBadge.vue'), 'utf8');

    expect(entityInlineRef).toContain('var(--ck-entity-tone-command)');
    expect(entityInlineRef).not.toMatch(/var\(--p-(?:blue|orange|teal|green|purple)-500\)/);
    expect(statusBadge).toMatch(/bg-status-(?:info|neutral|success|warning|danger)/);
    expect(statusBadge).not.toMatch(/var\(--p-(?:green|blue|amber|red)-500\)/);
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
      'components/ArtifactLayoutEditor.vue',
      'components/SheetDesignEditor.vue',
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
    expect(files.filter(file => file !== 'components/process-designer/ProcessNode.vue' && nonsemanticRadius.test(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8')))).toEqual([]);
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
      expect(scopedStyleDeclarations(source).filter(property => !allowedProperties.has(property)), file).toEqual([]);
    }
    expect(new Set(Object.values(SCOPED_STYLE_EXCEPTIONS))).toEqual(new Set(['layout']));
    expect(SCOPED_EXCEPTION_PROPERTIES.layout.has('padding')).toBe(false);
    expect(new Set(Object.values(INLINE_STYLE_EXCEPTIONS).map(([category]) => category)))
      .toEqual(new Set(['data-driven', 'layout']));

    for (const [file, [category, expectedStyles]] of Object.entries(INLINE_STYLE_EXCEPTIONS)) {
      expect(files, `${file} must retain its ${category} inline exception`).toContain(file);
      const source = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
      expect(inlineStyleAttributes(source), `${file} changed its ${category} inline exception surface`).toEqual(expectedStyles);
    }

    expect(analyzeVueVisuals(
      'components/AssetsLibrary.vue',
      '<template><div :style="{ borderRadius: \'1rem\' }" /></template>'
    )).toContain('replace:inline-visual (1)');
    expect(analyzeVueVisuals(
      'components/QueueEditor.vue',
      '<template><div style="width: var(--ck-table-action-column-width)" /></template>'
    )).toContain('compliant:inline-layout (1)');
    expect(analyzeVueVisuals(
      'components/AssetsLibrary.vue',
      '<template><div :style="{ backgroundColor: penForm.stroke.color }" /></template>'
    )).toContain('narrowly-allowlist:inline-data-driven (1)');
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
    expect(runtimeCss).not.toMatch(/\.entity-card-popup-content[^{}]*\{[^}]*(?:font-size|background|border|padding)\s*:/s);
  });

  it('uses existing semantic variables for SVG designer label contrast', () => {
    const drawingCanvas = fs.readFileSync(path.join(REPO_ROOT, 'components/shared/DrawingCanvas.vue'), 'utf8');

    expect(drawingCanvas).not.toContain('--ck-content-background');
    expect(drawingCanvas).toContain('fill-[var(--p-content-background)]');
  });

  it('keeps raw Card and Dialog ownership inside shared wrappers', () => {
    const allowed = new Set([
      'components/shared/EntityCard.vue',
      'components/shared/StandardDialog.vue',
      'components/shared/DesignerDialog.vue',
      'components/shared/ChatSupportDialog.vue',
      'components/ui-mapping/SurfaceBody.vue',
      'components/ui-mapping/GeneratedMappingScreen.vue',
      'components/ui-mapping/CardGrid.vue',
      'components/ui-mapping/StatGrid.vue',
      'components/ui-mapping/CarouselGrid.vue'
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
    const cassette = manifest.designSystem.components.find(component => component.key === 'cassette');
    const cassetteDesign = manifest.designSystem.components.find(component => component.key === 'cassetteDesign');
    const cassetteTemplate = manifest.designSystem.components.find(component => component.key === 'cassetteTemplate');

    expect(manifest.validations).toEqual({ ok: true, issues: [] });
    expect(cassette.fieldPaths).toEqual([]);
    expect(cassette.fieldPaths).not.toContain('data.type');
    expect(cassetteDesign.fieldPaths).toEqual(['data.parameters']);
    expect(DESIGN_SYSTEM_FIELD_GROUPS.cassetteDesign.summary[0].fallbackPaths).toEqual(['provenance.derivedFrom.parameters']);
    expect(cassetteTemplate.fieldPaths).toEqual([]);
    expect(cassetteTemplate.fieldPaths).not.toContain('type');
    expect(cassetteTemplate.fieldPaths).not.toContain('parameterCount');
  });

  it('declares constructor surfaces and field groups in the domain contract', () => {
    expect(validateDesignSystemDisplayContracts()).toEqual([]);

    for (const entry of DESIGN_SYSTEM_ENTITY_CONTRACTS) {
      expect(DESIGN_SYSTEM_SURFACES[entry.key]?.surfaces).toEqual(expect.objectContaining({
        inline: expect.any(Object),
        compact: expect.any(Object),
        card: expect.any(Object),
        detail: expect.any(Object)
      }));
      expect(DESIGN_SYSTEM_FIELD_GROUPS[entry.key] || {}).toBeTruthy();
    }
  });

  it('keeps standard entity DataBlock fields out of component-local arrays', () => {
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
        return /<template\s+#subtitle(?![^>]*variant !== 'card')/.test(source);
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
      const source = fs.readFileSync(file, 'utf8');
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




  it('keeps entity cards on shared EntityCard title chrome', () => {
    const offenders = walkFiles(
      path.join(REPO_ROOT, 'components/entities'),
      (file) => file.endsWith('Card.vue') && !file.endsWith('.old.vue') && !file.endsWith('.v23.vue')
    ).filter((file) => fs.readFileSync(file, 'utf8').includes('<template #title>'))
      .map((file) => path.relative(REPO_ROOT, file));

    expect(offenders).toEqual([]);
  });

  it('leaves entity card and popover chrome to Aura', () => {
    const entityCard = fs.readFileSync(path.join(REPO_ROOT, 'components/shared/EntityCard.vue'), 'utf8');
    const runtimeCss = fs.readFileSync(path.join(REPO_ROOT, 'assets/css/main.css'), 'utf8');

    expect(entityCard).not.toMatch(/border-content-border|shadow-|box-shadow|hover:border|\.p-card-|!p-/);
    expect(runtimeCss).not.toMatch(/--ck-(?:radius|shadow)/);
    expect(runtimeCss).not.toMatch(/\.entity-inline-(?:chip|compact)[^{]*\{[^}]*(?:background|border(?:-radius)?|box-shadow|padding)\s*:/s);
  });


  it('keeps nesting runs focused on sheet design outputs', () => {
    const nestingRunCard = fs.readFileSync(path.join(REPO_ROOT, 'components/entities/NestingRun/NestingRunCard.vue'), 'utf8');
    const queueEditor = fs.readFileSync(path.join(REPO_ROOT, 'components/QueueEditor.vue'), 'utf8');
    const nestingRunService = fs.readFileSync(path.join(REPO_ROOT, 'server/features/nesting-runs/service.js'), 'utf8');

    expect(nestingRunCard).toContain('EntityRelationsBlock');
    expect(nestingRunCard).toContain("entityType: 'sheetDesign'");
    expect(nestingRunCard).toContain("field.path === 'data.sheetDesignIds'");
    expect(nestingRunCard).toContain('item-variant="compact"');
    expect(nestingRunCard).not.toContain('item-variant="inline"');
    expect(nestingRunCard).not.toContain('SheetDesignCard');
    expect(nestingRunCard).not.toContain('GeometryPreview');
    expect(nestingRunCard).not.toContain('ArtifactCard');
    expect(nestingRunCard).not.toContain('relatedArtifacts');
    expect(nestingRunCard).toContain("feature: 'nesting_runs'");
    expect(nestingRunCard).not.toContain("authStore.can('queues', 'edit')");
    expect(queueEditor).toContain('readableQueueRuns');
    expect(queueEditor).toContain("feature: 'nesting_runs'");
    expect(queueEditor).not.toContain('getRunArtifacts');
    expect(queueEditor).not.toContain('@artifact-click');
    expect(nestingRunService).toContain("run, 'nesting_runs', 'read'");
    expect(nestingRunService).not.toContain("run.lineage, 'queues', 'read'");
    expect(DESIGN_SYSTEM_SURFACES.nestingRun.surfaces.card.fieldGroups).toContain('production');
  });

  it('keeps sheet layout editing on semantic layer and bounded snap contracts', () => {
    const editor = fs.readFileSync(path.join(REPO_ROOT, 'components/SheetDesignEditor.vue'), 'utf8');
    const generatedDetail = fs.readFileSync(path.join(REPO_ROOT, 'components/generated/GeneratedEntityDetail.vue'), 'utf8');
    const relationBlock = fs.readFileSync(path.join(REPO_ROOT, 'components/shared/EntityRelationsBlock.vue'), 'utf8');

    expect(editor).toContain('applyLayerPens');
    expect(editor).toContain("resolvedStyle('contour.material_sheet')");
    expect(editor).toContain('clampSheetPlacement');
    expect(editor).toContain('majorGridSize');
    expect(editor).toContain('selectedSnapPoint');
    expect(generatedDetail).toContain(':show-identity="showIdentity || forceIdentityForEditor"');
    expect(generatedDetail).toContain('entityEditorForcesIdentity(props.entityType)');
    expect(relationBlock).toContain(':variant="itemVariant"');
  });

  it('keeps inline design editing inside its active workspace', () => {
    const cassetteDesigner = fs.readFileSync(path.join(REPO_ROOT, 'components/CassetteDesignerV2.vue'), 'utf8');
    const cassetteManager = fs.readFileSync(path.join(REPO_ROOT, 'components/CassetteManager.vue'), 'utf8');
    const generatedCassetteAction = fs.readFileSync(path.join(REPO_ROOT, 'components/generated/GeneratedCassetteDesignerAction.vue'), 'utf8');
    const queueEditor = fs.readFileSync(path.join(REPO_ROOT, 'components/QueueEditor.vue'), 'utf8');

    expect(cassetteDesigner).toContain('saveTemplate({ saveAs: true })');
    expect(cassetteDesigner).toContain('handleDesignerEscape');
    expect(cassetteManager).toContain(':close-on-escape="false"');
    expect(cassetteManager).not.toContain('showDesignerDialog.value = false;\n};\n\nconst onRename');
    expect(generatedCassetteAction).toContain(':close-on-escape="false"');
    expect(generatedCassetteAction).not.toContain('visible.value = false;\n  emit(\'refresh\')');
    expect(queueEditor).toContain('saveQueue({ notify: false })');
  });

  it('keeps generated home cards as horizontal carousel items', () => {
    const generatedHome = fs.readFileSync(path.join(REPO_ROOT, 'components/generated/GeneratedHomeScreen.vue'), 'utf8');
    const generatedCollection = fs.readFileSync(path.join(REPO_ROOT, 'components/generated/GeneratedEntityCollection.vue'), 'utf8');
    const relationsBlock = fs.readFileSync(path.join(REPO_ROOT, 'components/shared/EntityRelationsBlock.vue'), 'utf8');
    const surfaceContent = fs.readFileSync(path.join(REPO_ROOT, 'components/shared/EntitySurfaceContent.vue'), 'utf8');
    const inlineRef = fs.readFileSync(path.join(REPO_ROOT, 'components/shared/EntityInlineRef.vue'), 'utf8');
    const identityBlock = fs.readFileSync(path.join(REPO_ROOT, 'components/shared/blocks/IdentityBlock.vue'), 'utf8');
    const entityPreview = fs.readFileSync(path.join(REPO_ROOT, 'components/shared/EntityPreview.vue'), 'utf8');
    const cassetteThumbnail = fs.readFileSync(path.join(REPO_ROOT, 'components/CassetteThumbnail.vue'), 'utf8');

    expect(generatedHome).toContain('overflow-x-auto');
    expect(generatedHome).toContain('shrink-0');
    expect(generatedHome).toContain('suppress-child-summaries');
    expect(generatedHome).toContain('relation-variant="compact"');
    expect(generatedHome).toContain('entityEditorActionFor');
    expect(generatedCollection).toContain('suppress-child-summaries');
    expect(generatedCollection).toContain('relation-variant="compact"');
    expect(generatedCollection).toContain('entityEditorActionFor');
    expect(generatedHome).toContain('pi pi-external-link');
    expect(generatedCollection).toContain('pi pi-external-link');
    expect(relationsBlock).toContain('overflow-x-auto');
    expect(relationsBlock).toContain('entity-relations-gallery--compact');
    expect(relationsBlock).toContain('isCompactGallery.value ? 2 : 4');
    expect(relationsBlock).toContain('entity-relations-overflow-tile');
    expect(relationsBlock).toContain('openOverflow');
    expect(relationsBlock).toContain('overflowItems');
    expect(relationsBlock).toContain('itemVariant');
    expect(relationsBlock).toContain("field.display === 'entityRefList'");
    expect(surfaceContent).toContain("props.suppressChildSummaries && (field.role === 'childCount' || field.replacesCountPath)");
    expect(surfaceContent).toContain('relationVariant');
    expect(inlineRef).toContain('entityToneStyle');
    expect(inlineRef).toContain('color-mix');
    expect(inlineRef).toContain("variant === 'compact'");
    expect(inlineRef).toContain('class="inline-flex w-full');
    expect(inlineRef).toContain('variant="inline"');
    expect(inlineRef).toContain('StatusBadge');
    expect(inlineRef).toContain('compactStatusState');
    expect(inlineRef).toContain('entity-inline-compact-status-row');
    expect(inlineRef).toContain('compactPreviewHideDimensionLayer');
    expect(inlineRef).toContain("'sheet_design'");
    expect(inlineRef).toContain('needsNestingRunHydration');
    expect(inlineRef).toContain('hydrateNestingRunOutputs');
    expect(inlineRef).toContain(".list({ runId }, { silent: true })");
    expect(inlineRef).toContain('relationSheetDesigns');
    expect(inlineRef).not.toContain('entity-inline-compact-fallback');
    expect(fs.readFileSync(path.join(REPO_ROOT, 'composables/useEntity.js'), 'utf8')).toContain('options.silent');
    expect(identityBlock).toContain('entity-inline-chip');
    expect(entityPreview).toContain('hideDimensionLayer');
    expect(entityPreview).toContain(':hide-dimension-layer="hideDimensionLayer"');
    expect(entityPreview).toContain('GeometryPreview');
    expect(fs.readFileSync(path.join(REPO_ROOT, 'components/shared/GeometryPreview.vue'), 'utf8')).toContain('isProductionPreviewLayer');
    expect(fs.readFileSync(path.join(REPO_ROOT, 'components/shared/GeometryPreview.vue'), 'utf8')).toContain('isDimensionLayerName');
    expect(cassetteThumbnail).toContain("name !== 'dimension.cassette'");
    expect(generatedHome).not.toContain('min-w-64 max-w-72');
  });

  it('keeps generated Home layout sizing off variant entity-card roots', () => {
    const generatedHome = fs.readFileSync(path.join(REPO_ROOT, 'components/generated/GeneratedHomeScreen.vue'), 'utf8');

    expect(generatedHome).toContain('class="w-[18rem] min-w-[18rem] flex-none"');
    expect(generatedHome).not.toMatch(/<EntityCard\s+class=/);
  });

  it('keeps queue entity controls scoped to the concrete queue', () => {
    const queueCard = fs.readFileSync(path.join(REPO_ROOT, 'components/entities/Queue/QueueCard.vue'), 'utf8');
    const queueEditor = fs.readFileSync(path.join(REPO_ROOT, 'components/QueueEditor.vue'), 'utf8');

    expect(queueCard).toContain('hasPermissionGrant');
    expect(queueCard).not.toContain("authStore.can('queues', 'edit')");
    expect(queueCard).not.toContain("authStore.can('queues', 'delete')");
    expect(queueEditor).toContain('props.processActions');
    expect(queueEditor).toContain("isProcessMode.value ? Boolean(processRunNestingAction.value) : canEditQueue.value");
    expect(queueEditor).not.toContain('canEditQueue.value || Boolean(processRunNestingAction.value)');
  });


  it('keeps entity details on shared EntityPage header chrome', () => {
    const offenders = walkFiles(
      path.join(REPO_ROOT, 'components/entities'),
      (file) => file.endsWith('Detail.vue') && !file.endsWith('.old.vue') && !file.endsWith('.v23.vue')
    ).filter((file) => {
      const source = fs.readFileSync(file, 'utf8');
      return /<TraceChain\s+:entity|<IdentityBlock[^>]+variant=["']header["']|<EntityStatus\b/.test(source);
    }).map((file) => path.relative(REPO_ROOT, file));

    expect(offenders).toEqual([]);
  });

  it('derives status actions from workflow definitions instead of hardcoded fallbacks', async () => {
    const { getWorkflowStatusActions } = await import('../utils/status-actions.js');

    expect(getWorkflowStatusActions({ entityType: 'queue', state: 'DRAFT', t: key => key })).toContainEqual(expect.objectContaining({
      to: 'NESTING'
    }));
    expect(getWorkflowStatusActions({ entityType: 'queue', state: 'DRAFT', t: key => key })).not.toContainEqual(expect.objectContaining({
      to: 'READY'
    }));
    expect(getWorkflowStatusActions({ entityType: 'sheet', state: 'AVAILABLE', t: key => key })).toEqual(expect.arrayContaining([
      expect.objectContaining({ to: 'IN-CUTTING', display: 'inline' }),
      expect.objectContaining({ to: 'SCRAP', display: 'menu' })
    ]));
    expect(getWorkflowStatusActions({ entityType: 'project', state: 'DRAFT', t: key => key })).not.toContainEqual(expect.objectContaining({
      to: 'DRAFT'
    }));
  });

  it('keeps status popovers free of placeholder copy and duplicate last-updated sections', () => {
    const entityStatus = fs.readFileSync(path.join(REPO_ROOT, 'components/shared/status/EntityStatus.vue'), 'utf8');
    const statusHistory = fs.readFileSync(path.join(REPO_ROOT, 'components/shared/status/StatusHistory.vue'), 'utf8');

    expect(entityStatus).not.toContain("common.actions.title");
    expect(entityStatus).not.toContain("common.lastUpdated");
    expect(entityStatus).not.toContain("common.history");
    expect(entityStatus).not.toContain("metadata?.note");
    expect(entityStatus).toContain("v-if=\"hasLocation\"");
    expect(statusHistory).not.toContain("status.noHistory");
    expect(statusHistory).toContain('fallbackEvents');
    expect(statusHistory).toContain('displayEvents');
    expect(statusHistory).toContain('eventDisplay');
    expect(statusHistory).toContain(':display="eventDisplay(event)"');
  });

  it('normalizes typed status lifecycle locations for status surfaces', async () => {
    const { normalizeStatusLocation } = await import('../utils/status-location.js');

    expect(normalizeStatusLocation({
      status: {
        lifecycle: {
          data: {
            location: { type: 'warehouse', warehouseId: 'wh-1', label: 'Main' }
          }
        }
      }
    })).toEqual({ type: 'warehouse', id: 'wh-1', label: 'Main' });

    expect(normalizeStatusLocation({
      status: {
        lifecycle: {
          data: {
            location: { type: 'coordinates', coordinates: { x: 10, y: 20 } }
          }
        }
      }
    })).toEqual({ type: 'coordinates', label: 'x: 10, y: 20' });
  });

  it('keeps factory demo states and badge mappings aligned with workflow definitions', () => {
    for (const entry of DESIGN_SYSTEM_ENTITY_CONTRACTS) {
      const workflow = cncWorkflows[entry.entityType];
      if (!workflow) continue;
      const normalizedWorkflow = normalizeWorkflow(workflow);
      const workflowStates = Object.values(normalizedWorkflow.regions || {})
        .flatMap(region => Object.keys(region.states || {}));

      const entity = factories[entry.factoryName]();
      expect(
        workflowStates,
        `${entry.key} factory state ${entity.status.state} must exist in workflow ${entry.entityType}`
      ).toContain(entity.status.state);
    }

    for (const [entityType, workflow] of Object.entries(cncWorkflows)) {
      const normalizedWorkflow = normalizeWorkflow(workflow);
      const workflowStates = Object.values(normalizedWorkflow.regions || {})
        .flatMap(region => Object.keys(region.states || {}));
      for (const state of workflowStates) {
        expect(
          STATUS_MAPPINGS[state] || STATUS_MAPPINGS[state.toLowerCase()],
          `${entityType}.${state} missing status badge mapping`
        ).toBeTruthy();
      }
    }
  });

  it('formats generated DataBlock values without artificial object strings', () => {
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
