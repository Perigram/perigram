#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { designTokens, cssVariableTokens, tailwindThemeExtension } from '../assets/tokens/index.js';
import {
  cncAttachmentKinds,
  cncDesignSystemInstanceContracts,
  cncInstanceFieldGroups,
  cncInstanceSurfaceContracts,
  cncDesignSystemGroups,
  cncDesignSystemPrimitives,
  cncDesignSystemVariants,
  cncDomain,
  cncEntities,
  cncCommands,
  cncTasks,
  cncSummaries,
  cncWorkflows
} from '../packages/domain-cnc/src/index.js';
import {
  createFrameworkManifest,
  queryDocs,
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
  '@cutkit/core',
  '@cutkit/workflows',
  '@cutkit/mongo',
  '@cutkit/nitro',
  '@cutkit/vue',
  '@cutkit/devtools',
  '@cutkit/mcp',
  '@cutkit/domain-cnc'
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
const dataModelFields = loadDataModelFields('server/DATA_MODEL.md');
const componentInventory = createComponentInventory();
const manifest = createManifest();
const docsCorpus = loadDocs([
  'README.md',
  'server/README.md',
  'server/features/README.md',
  'server/core/blocks/README.md',
  'server/core/machines/README.md',
  'components/README.md',
  'components/shared/README.md',
  'composables/README.md',
  'utils/README.md',
  'test-data/README.md',
  'i18n/README.md',
  'packages/README.md',
  'packages/core/README.md',
  'packages/workflows/README.md',
  'packages/domain-cnc/README.md',
  'packages/devtools/README.md',
  'packages/mcp/README.md',
  'docs/FRAMEWORK_EXTRACTION_STATUS.md',
  'docs/DESIGN_SYSTEM.md'
]);

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
  queryDocs: query => queryDocs(docsCorpus, query),
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

  if (command === 'query-docs') {
    const query =  process.argv.slice(3).join(' ') || 'framework';
    print(queryDocs(docsCorpus, query));
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
      docs: await handlers.query_docs({ query: 'workflow' }),
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
      'query-docs',
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
    attachmentKinds: cncAttachmentKinds,
    designSystem: {
      variants: cncDesignSystemVariants,
      groups: cncDesignSystemGroups,
      primitives: cncDesignSystemPrimitives,
      contracts: cncDesignSystemInstanceContracts,
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
  const groups = cncInstanceFieldGroups[key] || {};
  const surfaceGroups = Object.values(cncInstanceSurfaceContracts[key]?.surfaces || {})
    .flatMap(surface => surface.fieldGroups || []);

  return surfaceGroups
    .flatMap(group => groups[group] || [])
    .filter(field => field.role !== 'previewSource' && field.display !== 'entityRef' && field.display !== 'entityRefList')
    .map(field => field.path)
    .filter(Boolean)
    .filter((path, index, paths) => paths.indexOf(path) === index)
    .sort();
}

function loadDataModelFields(path) {
  if (!existsSync(path)) return [];
  const collectionToEntity = new Map(cncEntities.map(entity => [entity.collection, entity.type]));
  const fields = [];
  let collection = null;

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const heading = line.match(/^###\s+(.+)$/);
    if (heading) {
      collection = heading[1].trim();
      continue;
    }

    const field = line.match(/^\|\s+`([^`]+)`\s+\|/);
    if (!field || !collection) continue;

    const typeId = collectionToEntity.get(collection) || singularizeCollection(collection);
    fields.push({ typeId, collection, name: field[1] });
    if (typeId === 'cassette') {
      fields.push({ typeId: 'cassette_template', collection, name: field[1] });
    }
  }

  return fields;
}

function singularizeCollection(collection) {
  return collection
    .replace(/ies$/, 'y')
    .replace(/s$/, '');
}

function loadDocs(paths) {
  return paths
    .filter(path => existsSync(path))
    .map(path => ({
      path,
      title: path,
      content: readFileSync(path, 'utf8')
    }));
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
