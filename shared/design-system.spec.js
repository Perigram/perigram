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
import { getWorkflowStatusActions } from '../utils/status-actions.js';

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
    expect(source).toContain('cutkit:ui-lab-feedback:v1');
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

  it('keeps local workflow preview transitions out of the server status API', () => {
    const entityStatus = fs.readFileSync(path.join(REPO_ROOT, 'components/shared/status/EntityStatus.vue'), 'utf8');
    const workbench = fs.readFileSync(path.join(REPO_ROOT, 'pages/admin/workbench.vue'), 'utf8');
    const store = fs.readFileSync(path.join(REPO_ROOT, 'stores/workbenchFixtures.js'), 'utf8');

    expect(entityStatus).toContain("inject('statusTransitionHandler'");
    expect(entityStatus).toContain('useLocalTransition');
    expect(workbench).toContain("provide('statusTransitionHandler'");
    expect(workbench).toContain('handleWorkbenchStatusTransition');
    expect(store).toContain('transitionEntityStatus');
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
    expect(cassetteTemplate.fieldPaths).toEqual(['data.parameters.length']);
    expect(cassetteTemplate.fieldPaths).not.toContain('type');
    expect(cassetteTemplate.fieldPaths).not.toContain('parameterCount');
  });

  it('keeps data-model review support collections out of manifest gap warnings', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'pages/admin/data-model-review.vue'), 'utf8');

    expect(source).toContain('const SUPPORT_COLLECTIONS = new Set');
    expect(source).toContain('collection_name');
    expect(source).toContain('invitations');
    expect(source).toContain('material_options');
    expect(source).toContain('sessions');
    expect(source).toContain('status_events');
    expect(source).toContain('const contractModels = computed');
    expect(source).toContain('!SUPPORT_COLLECTIONS.has(model.collection)');
  });

  it('exposes the browser-export domain builder as an admin tool', () => {
    const page = fs.readFileSync(path.join(REPO_ROOT, 'pages/admin/domain-builder.vue'), 'utf8');
    const layout = fs.readFileSync(path.join(REPO_ROOT, 'layouts/app.vue'), 'utf8');

    expect(page).toContain('DOMAIN_BUILDER_STORAGE_KEY');
    expect(page).toContain('generateDomainCncSource');
    expect(page).toContain('validateDomainDraft');
    expect(page).toContain('buildWorkflowGraph');
    expect(page).toContain('addTransition');
    expect(page).toContain('selectTransition');
    expect(page).toContain('startTransitionDraft');
    expect(page).toContain("from '@vue-flow/core'");
    expect(page).not.toContain("from '@vue-flow/background'");
    expect(page).toContain('workflowNodes');
    expect(page).toContain('workflowEdges');
    expect(page).not.toContain("tabs = ['entities', 'workflows', 'operations'");
    expect(page).toContain("downloadText('domain-cnc.generated.js'");
    expect(page).toContain("middleware: 'auth'");
    expect(layout).toContain("router.push('/admin/domain-builder')");
  });

  it('exposes command definitions and runs in the admin workbench', () => {
    const workbench = fs.readFileSync(path.join(REPO_ROOT, 'pages/admin/workbench.vue'), 'utf8');
    const service = fs.readFileSync(path.join(REPO_ROOT, 'server/core/commands/service.js'), 'utf8');
    const adapter = fs.readFileSync(path.join(REPO_ROOT, 'server/adapters/cnc-domain.js'), 'utf8');

    expect(workbench).toContain('sectionsCommands');
    expect(workbench).toContain('activeWorkbenchSection');
    expect(workbench).toContain('activeEntityTab');
    expect(workbench).toContain('globalWorkbenchTabs');
    expect(workbench).toContain('entityWorkbenchTabs');
    expect(workbench).toContain("value: 'entities'");
    expect(workbench).toContain("value: 'context'");
    expect(workbench).toContain("value: 'commands'");
    expect(workbench).toContain("const entityWorkbenchTabs = [");
    expect(workbench).toContain('/api/admin/commands');
    expect(workbench).toContain('/api/admin/commands/runs');
    expect(workbench).toContain('/api/admin/tasks');
    expect(workbench).toContain('runSelectedCommand');
    expect(workbench).toContain("command.kind !== 'task'");
    expect(workbench).toContain('selectedCommandTaskDefinitions');
    expect(workbench).toContain('selectedCommandTaskRuns');
    expect(workbench).toContain('commandRelatedTaskIds');
    expect(workbench).toContain('visibleCommands');
    expect(workbench).toContain('commandSearch');
    expect(workbench).toContain('commandsRegistry');
    expect(workbench).toContain('handlerRegistered');
    expect(workbench).not.toContain("admin.operations.registry");
    expect(workbench).not.toContain('input.type === selectedEntity.value?.type');
    expect(workbench).toContain('noCommands');
    expect(workbench).toContain('commandEntityFields');
    expect(workbench).toContain("type: 'entityId'");
    expect(workbench).toContain('lastCommandRun');
    expect(workbench).toContain('TypedSettingsForm');
    expect(workbench).toContain('hookContracts');
    expect(workbench).toContain('parameters: commandParameters.value');
    expect(workbench).not.toContain("from 'primevue/datatable'");
    expect(workbench).not.toContain('TableFrame');
    expect(service).toContain('commandRunsRepository.create');
    expect(service).toContain('handlerRegistered');
    expect(service).not.toContain("features/nesting/operations.js");
    expect(service).not.toContain("features/artifacts/operations.js");
    expect(adapter).not.toContain("features/nesting/operations.js");
    expect(adapter).not.toContain("features/artifacts/operations.js");
    expect(adapter).toContain('cncDomain');
    expect(fs.readFileSync(path.join(REPO_ROOT, 'server/api/admin/commands/index.get.js'), 'utf8')).toContain('listCommands');
    expect(service).toContain("status: 'SUCCEEDED'");
    expect(service).toContain("status: 'FAILED'");
  });

  it('merges data-model review fields into UI lab entity rows', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'pages/test/ui-lab.vue'), 'utf8');

    expect(source).toContain('loadReviewModels');
    expect(source).toContain('reviewModelForRow');
    expect(source).toContain('uiLabReviewModelForRow');
    expect(source).toContain("!field.name.startsWith('lineage.')");
    expect(source).toContain('reviewFieldFeedbackFor');
    expect(source).toContain('reviewExpanded');
    expect(source).toContain('toggleReview');
    expect(source).toContain('expandedReviews = ref(new Set())');
    expect(source).toContain('uiLab.review.title');
    expect(source).toContain('cutkit:ui-lab-feedback:v1');
  });

  it('keeps entity cards on shared EntityCard title chrome', () => {
    const offenders = walkFiles(
      path.join(REPO_ROOT, 'components/entities'),
      (file) => file.endsWith('Card.vue') && !file.endsWith('.old.vue') && !file.endsWith('.v23.vue')
    ).filter((file) => fs.readFileSync(file, 'utf8').includes('<template #title>'))
      .map((file) => path.relative(REPO_ROOT, file));

    expect(offenders).toEqual([]);
  });

  it('keeps nesting runs focused on sheet design outputs', () => {
    const nestingRunCard = fs.readFileSync(path.join(REPO_ROOT, 'components/entities/NestingRun/NestingRunCard.vue'), 'utf8');
    const queueEditor = fs.readFileSync(path.join(REPO_ROOT, 'components/QueueEditor.vue'), 'utf8');

    expect(nestingRunCard).toContain('SheetDesignCard');
    expect(nestingRunCard).not.toContain('ArtifactCard');
    expect(nestingRunCard).not.toContain('relatedArtifacts');
    expect(queueEditor).not.toContain('getRunArtifacts');
    expect(queueEditor).not.toContain('@artifact-click');
  });

  it('keeps manual workbench forms explicit about type and lineage choices', () => {
    const workbench = fs.readFileSync(path.join(REPO_ROOT, 'pages/admin/workbench.vue'), 'utf8');
    const manualEntities = fs.readFileSync(path.join(REPO_ROOT, 'test-data/workbench-manual-entities.js'), 'utf8');
    const typedSettingsForm = fs.readFileSync(path.join(REPO_ROOT, 'components/shared/TypedSettingsForm.vue'), 'utf8');

    expect(workbench).toContain('manualEntityTypeLabel');
    expect(workbench).toContain('manualEntityDefinitions');
    expect(workbench).toContain('DESIGN_SYSTEM_ENTITIES');
    expect(workbench).toContain('canCreateManualEntity');
    expect(workbench).toContain(':disabled="!canCreateManualEntity"');
    expect(manualEntities).not.toContain("if (field.type === 'entityId')");
    expect(manualEntities).not.toContain('draft[field.name] = value');
    expect(typedSettingsForm).toContain("field.type === 'entityId'");
    expect(typedSettingsForm).not.toContain('field.entityType && `entity:${field.entityType}`');
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
