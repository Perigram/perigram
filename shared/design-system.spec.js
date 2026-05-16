import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  DESIGN_SYSTEM_ENTITY_CONTRACTS,
  DESIGN_SYSTEM_VARIANTS,
  DESIGN_SYSTEM_PRIMITIVES,
  validateDesignSystemContracts
} from '../utils/design-system-contract.js';
import * as factories from '../test-data/factories.js';
import {
  cssVariableTokens,
  designTokens,
  primeComponentTokens,
  tailwindThemeExtension
} from '../assets/tokens/index.js';
import { cncWorkflows } from '../packages/domain-cnc/src/index.js';
import { decorateDataValue, resolveDataPath } from '../utils/data-display.js';
import { STATUS_MAPPINGS } from '../utils/status-engine.js';

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

const usedVueFiles = () => ['components', 'pages']
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

  it('uses canonical artifact attachment and data type shape', () => {
    const artifact = factories.createMockArtifact();

    expect(artifact.data.type).toBe('LAYOUT_DXF');
    expect(artifact.attachments.primary.fileId).toBeTruthy();
    expect(artifact.fileId).toBeUndefined();
  });

  it('uses string cassette template parameters matching the DTO contract', () => {
    const template = factories.createMockCassetteTemplate();

    expect(template.parameters).toEqual(['A', 'B', 'C']);
    expect(template.data.parameters).toEqual(['A', 'B', 'C']);
  });

  it('exports token projections for PrimeVue, Tailwind, and CSS variables', () => {
    expect(designTokens.layout.pageMaxWidth).toBe('1600px');
    expect(cssVariableTokens['--ck-page-max-width']).toBe(designTokens.layout.pageMaxWidth);
    expect(tailwindThemeExtension.maxWidth.app).toBe('var(--ck-page-max-width)');
    expect(tailwindThemeExtension.height['support-chat']).toBe('var(--ck-support-chat-height)');
    expect(tailwindThemeExtension.height['preview-dialog']).toBe('var(--ck-preview-dialog-height)');
    expect(tailwindThemeExtension.width.swatch).toBe('var(--ck-swatch-size)');
    expect(primeComponentTokens.dataview.root.background).toBe('transparent');
  });

  it('keeps raw Card and Dialog ownership inside shared wrappers', () => {
    const allowed = new Set([
      'components/shared/EntityCard.vue',
      'components/shared/StandardDialog.vue'
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
    const cassetteTemplate = manifest.designSystem.components.find(component => component.key === 'cassetteTemplate');

    expect(manifest.validations).toEqual({ ok: true, issues: [] });
    expect(cassetteTemplate.fieldPaths).toEqual(['data.parameters.length', 'data.type']);
    expect(cassetteTemplate.fieldPaths).not.toContain('type');
    expect(cassetteTemplate.fieldPaths).not.toContain('parameterCount');
  });

  it('keeps entity cards on shared EntityCard title chrome', () => {
    const offenders = walkFiles(
      path.join(REPO_ROOT, 'components/entities'),
      (file) => file.endsWith('Card.vue') && !file.endsWith('.old.vue') && !file.endsWith('.v23.vue')
    ).filter((file) => fs.readFileSync(file, 'utf8').includes('<template #title>'))
      .map((file) => path.relative(REPO_ROOT, file));

    expect(offenders).toEqual([]);
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
      expect.objectContaining({ to: 'IN-CUTTING' }),
      expect.objectContaining({ to: 'SCRAP' })
    ]));
  });

  it('keeps factory demo states and badge mappings aligned with workflow definitions', () => {
    for (const entry of DESIGN_SYSTEM_ENTITY_CONTRACTS) {
      const workflow = cncWorkflows[entry.entityType];
      if (!workflow) continue;

      const entity = factories[entry.factoryName]();
      expect(
        Object.keys(workflow.states),
        `${entry.key} factory state ${entity.status.state} must exist in workflow ${entry.entityType}`
      ).toContain(entity.status.state);
    }

    for (const [entityType, workflow] of Object.entries(cncWorkflows)) {
      for (const state of Object.keys(workflow.states)) {
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
