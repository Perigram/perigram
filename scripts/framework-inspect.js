#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { designTokens, cssVariableTokens, tailwindThemeExtension } from '../assets/tokens/index.js';
import { frameworkCommandDefinitions } from '../server/core/commands/definitions.js';
import { frameworkTaskDefinitions } from '../server/core/tasks/definitions.js';
import { frameworkAttachmentKinds } from '../shared/attachment-kinds.js';
import {
  DESIGN_SYSTEM_ENTITY_CONTRACTS,
  DESIGN_SYSTEM_FIELD_GROUPS,
  DESIGN_SYSTEM_GROUPS,
  DESIGN_SYSTEM_PRIMITIVES,
  DESIGN_SYSTEM_SURFACE_CONTRACTS,
  DESIGN_SYSTEM_VARIANTS
} from '../utils/design-system-contract.js';
import { createTypeRegistry, frameworkTypes, projectDomainFromView } from '../packages/cts/src/index.js';
import { composeSystemDeclarations } from '../server/packs/declarations.js';
import { extractDataModels } from '../server/utils/extract-data-models.js';

// The registry view is the domain catalog (one source): entities and
// workflows project from the mounted declarations.
const viewRegistry = createTypeRegistry({ id: 'framework-manifest-view' });
for (const declaration of [...frameworkTypes, ...composeSystemDeclarations()]) viewRegistry.defineType(declaration);
const projected = projectDomainFromView(viewRegistry, null);
const cncEntities = projected.entities.map(entity => ({ ...entity, surfaceKey: entity.type }));
const cncWorkflows = projected.workflows || {};
const cncDomain = { ui: { endpoints: cncEntities.map(entity => ({ type: entity.type, path: `/api/instances/${entity.collection}` })) } };
const cncCommands = { ...frameworkCommandDefinitions };
const cncTasks = frameworkTaskDefinitions;
const cncSummaries = [];
import {
  createFrameworkManifest,
  summarizeDefinitions,
  summarizeRoutes,
  summarizeWorkflows,
  validateDefinitionSet
} from '../packages/devtools/src/index.js';
import { createReadOnlyToolHandlers } from '../packages/mcp/src/index.js';
import { validateTransition } from '../packages/workflows/src/index.js';

const command =  process.argv[2] || 'help';
const MANIFEST_PATH = 'framework.manifest.json';
const PACKAGE_NAMES = [
  '@perigram/core',
  '@perigram/workflows',
  '@perigram/mongo',
  '@perigram/nitro',
  '@perigram/vue',
  '@perigram/devtools',
  '@perigram/mcp',
  '@perigram/facade'
];
const UI_COMPONENT_PATHS = {
  project: 'components/entities/Project/ProjectCard.vue',
  queue: 'components/entities/Queue/QueueCard.vue',
  nestingRun: 'components/entities/NestingRun/NestingRunCard.vue',
  sheetDesign: 'components/entities/SheetDesign/SheetDesignCard.vue',
  cassette: 'components/entities/Cassette/CassetteCard.vue',
  cassetteDesign: 'components/entities/CassetteDesign/CassetteDesignCard.vue',
  cassetteTemplate: 'components/entities/CassetteTemplate/CassetteTemplateCard.vue',
  cassetteInstance: 'components/entities/CassetteInstance/CassetteInstanceCard.vue',
  requisition: 'components/entities/Requisition/RequisitionCard.vue',
  material: 'components/entities/Material/MaterialCard.vue',
  materialPile: 'components/entities/MaterialPile/PileCard.vue',
  batchPile: 'components/entities/BatchPile/BatchPileCard.vue',
  sheet: 'components/entities/Sheet/SheetCard.vue',
  remnant: 'components/entities/Remnant/RemnantCard.vue',
  catalog: 'components/entities/Catalog/CatalogCard.vue',
  color: 'components/entities/Color/ColorCard.vue',
  warehouse: 'components/entities/Warehouse/WarehouseCard.vue',
  toolProfile: 'components/entities/ToolProfile/ToolProfileCard.vue',
  penTemplate: 'components/entities/PenTemplate/PenTemplateCard.vue',
  layerStandard: 'components/entities/LayerStandard/LayerStandardCard.vue',
  user: 'components/entities/User/UserCard.vue',
  organization: 'components/entities/Organization/OrganizationCard.vue',
  artifact: 'components/entities/Artifact/ArtifactCard.vue'
};
const COMPATIBILITY_ALIASES = {
  cassette_template: ['data.definition', 'data.parameters', 'data.type']
};

const workflows = Object.entries(cncWorkflows).map(([type, workflow]) => ({ type, workflow }));
const routes = summarizeRoutes(cncDomain.ui.endpoints);
const collectionToEntity = new Map(cncEntities.map(entity => [entity.collection, entity.type]));
const fieldOrderScore = (name) => {
  if (name === 'identity') return 1;
  if (name === 'origin') return 2;
  if (name === 'status') return 3;
  if (name === 'lineage') return 4;
  if (name === 'attachments') return 5;
  if (name.startsWith('data')) return 10;
  return 20;
};
const dataModelFields = (await extractDataModels()).flatMap(model => {
  const typeId = collectionToEntity.get(model.collection) || singularizeCollection(model.collection);
  const fields = [...model.fields].sort((a, b) =>
    fieldOrderScore(a.name) - fieldOrderScore(b.name) || a.name.localeCompare(b.name));
  return fields.flatMap(field => {
    const entries = [{ typeId, collection: model.collection, name: field.name }];
    if (typeId === 'cassette') entries.push({ typeId: 'cassette_template', collection: model.collection, name: field.name });
    return entries;
  });
});
const componentInventory = createComponentInventory();
const manifest = createManifest();

const handlers = createReadOnlyToolHandlers({
  listEntities: () => cncEntities,
  getEntity: type => cncEntities.find(entity => entity.type === type || entity.surfaceKey === type) || null,
  getWorkflow: type => cncWorkflows[type] || null,
  getFrameworkManifest: () => manifest,
  listRoutes: () => routes,
  listUiComponents: () => manifest.designSystem.components,
  listUiPrimitives: () => manifest.designSystem.primitives,
  listDesignTokens: () => manifest.designSystem.tokens,
  listRelationships: () => manifest.relationships,
  listSummaries: () => manifest.summaries,
  listCommands: () => manifest.commands,
  validateUiContracts: () => manifest.validations,
  validateArchitecture: () => {
    const result = spawnSync( process.execPath, ['scripts/check-arch.js'], { encoding: 'utf8' });
    return {
      ok: result.status === 0,
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr
    };
  },
  validateTransition
});

async function main() {
  if (command === 'list-entities') {
    print(summarizeDefinitions(cncEntities));
    return;
  }

  if (command === 'list-workflows') {
    print(summarizeWorkflows(workflows));
    return;
  }

  if (command === 'list-routes') {
    print(routes);
    return;
  }

  if (command === 'list-ui-components') {
    print(manifest.designSystem.components);
    return;
  }

  if (command === 'list-ui-primitives') {
    print(manifest.designSystem.primitives);
    return;
  }

  if (command === 'list-design-tokens') {
    print(manifest.designSystem.tokens);
    return;
  }

  if (command === 'list-relationships') {
    print(manifest.relationships);
    return;
  }

  if (command === 'list-summaries') {
    print(manifest.summaries);
    return;
  }

  if (command === 'list-commands') {
    print(manifest.commands);
    return;
  }

  if (command === 'manifest') {
    print(manifest);
    return;
  }

  if (command === 'write-manifest') {
    writeFileSync(MANIFEST_PATH, `${stableStringify(manifest)}\n`);
    print({ ok: true, path: MANIFEST_PATH });
    return;
  }

  if (command === 'check-manifest') {
    const expected = `${stableStringify(manifest)}\n`;
    const actual = existsSync(MANIFEST_PATH) ? readFileSync(MANIFEST_PATH, 'utf8') : null;
    const ok = actual === expected;
    print({ ok, path: MANIFEST_PATH, validations: manifest.validations });
     process.exitCode = ok && manifest.validations.ok ? 0 : 1;
    return;
  }

  if (command === 'validate') {
    const definitionResult = validateDefinitionSet(cncEntities);
    const architectureResult = await handlers.validate_architecture();
    const uiResult = await handlers.validate_ui_contracts();
    print({
      ok: definitionResult.ok && architectureResult.ok && uiResult.ok,
      definitions: definitionResult,
      architecture: { ok: architectureResult.ok, status: architectureResult.status },
      ui: uiResult
    });
     process.exitCode = definitionResult.ok && architectureResult.ok && uiResult.ok ? 0 : 1;
    return;
  }

  if (command === 'mcp-smoke') {
    print({
      entities: await handlers.list_entities(),
      queueWorkflow: await handlers.get_workflow({ type: 'queue' }),
      queueSchema: await handlers.get_entity_schema({ type: 'queue' }),
      manifest: await handlers.get_framework_manifest(),
      routes: await handlers.list_routes(),
      uiComponents: await handlers.list_ui_components(),
      uiPrimitives: await handlers.list_ui_primitives(),
      relationships: await handlers.list_relationships(),
      transition: await handlers.simulate_transition({
        type: 'queue',
        currentState: 'DRAFT',
        targetState: 'NESTING',
        role: 'ADMIN'
      })
    });
    return;
  }

  print({
    commands: [
      'list-entities',
      'list-workflows',
      'list-routes',
      'list-ui-components',
      'list-ui-primitives',
      'list-design-tokens',
      'list-relationships',
      'list-summaries',
      'list-commands',
      'manifest',
      'write-manifest',
      'check-manifest',
      'validate',
      'mcp-smoke'
    ]
  });
}

function createManifest() {
  return createFrameworkManifest({
    packages: PACKAGE_NAMES.map(name => ({ name })),
    entities: cncEntities,
    frontendEntities: cncDomain.ui.endpoints,
    workflows: cncWorkflows,
    summaries: cncSummaries,
    commands: cncCommands,
    tasks: cncTasks,
    attachmentKinds: frameworkAttachmentKinds,
    designSystem: {
      variants: DESIGN_SYSTEM_VARIANTS,
      groups: DESIGN_SYSTEM_GROUPS,
      primitives: DESIGN_SYSTEM_PRIMITIVES,
      contracts: DESIGN_SYSTEM_ENTITY_CONTRACTS,
      componentInventory,
      tokens: {
        designTokens,
        cssVariableTokens,
        tailwindThemeExtension
      }
    },
    dataModelFields,
    compatibilityAliases: COMPATIBILITY_ALIASES
  });
}

function createComponentInventory() {
  return Object.fromEntries(Object.entries(UI_COMPONENT_PATHS).map(([key, componentPath]) => [
    key,
    {
      componentPath,
      fieldPaths: contractFieldPaths(key)
    }
  ]));
}

function contractFieldPaths(key) {
  const groups = DESIGN_SYSTEM_FIELD_GROUPS[key] || {};
  const surfaceGroups = Object.values(DESIGN_SYSTEM_SURFACE_CONTRACTS[key]?.surfaces || {})
    .flatMap(surface => surface.fieldGroups || []);

  return surfaceGroups
    .flatMap(group => groups[group] || [])
    .filter(field => field.role !== 'previewSource' && field.display !== 'entityRef' && field.display !== 'entityRefList')
    .map(field => field.path)
    .filter(Boolean)
    .filter((path, index, paths) => paths.indexOf(path) === index)
    .sort();
}

function singularizeCollection(collection) {
  return collection
    .replace(/ies$/, 'y')
    .replace(/s$/, '');
}

function stableStringify(value) {
  return JSON.stringify(sortKeys(value), null, 2);
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortKeys(value[key])]));
}

function print(value) {
   process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

main().catch(error => {
  console.error(error);
   process.exitCode = 1;
});
