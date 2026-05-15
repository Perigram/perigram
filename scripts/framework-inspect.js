#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { cncEntities, cncFrontendEntities, cncWorkflows } from '../packages/domain-cnc/src/index.js';
import { queryDocs, summarizeDefinitions, summarizeRoutes, summarizeWorkflows, validateDefinitionSet } from '../packages/devtools/src/index.js';
import { createReadOnlyToolHandlers } from '../packages/mcp/src/index.js';
import { validateTransition } from '../packages/workflows/src/index.js';

const command = process.argv[2] || 'help';

const workflows = Object.entries(cncWorkflows).map(([type, workflow]) => ({ type, workflow }));
const routes = summarizeRoutes(cncFrontendEntities);
const docsCorpus = loadDocs([
  'README.md',
  'server/README.md',
  'server/features/README.md',
  'server/core/blocks/README.md',
  'server/core/machines/README.md',
  'composables/README.md',
  'packages/README.md',
  'packages/core/README.md',
  'packages/workflows/README.md',
  'packages/domain-cnc/README.md',
  'packages/devtools/README.md',
  'packages/mcp/README.md',
  'docs/FRAMEWORK_EXTRACTION_STATUS.md'
]);

const handlers = createReadOnlyToolHandlers({
  listEntities: () => cncEntities,
  getEntity: type => cncEntities.find(entity => entity.type === type) || cncFrontendEntities.find(entity => entity.type === type) || null,
  getWorkflow: type => cncWorkflows[type] || null,
  listRoutes: () => routes,
  queryDocs: query => queryDocs(docsCorpus, query),
  validateArchitecture: () => {
    const result = spawnSync(process.execPath, ['scripts/check-arch.js'], { encoding: 'utf8' });
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

  if (command === 'query-docs') {
    const query = process.argv.slice(3).join(' ') || 'framework';
    print(queryDocs(docsCorpus, query));
    return;
  }

  if (command === 'validate') {
    const definitionResult = validateDefinitionSet(cncEntities);
    const architectureResult = await handlers.validate_architecture();
    print({
      ok: definitionResult.ok && architectureResult.ok,
      definitions: definitionResult,
      architecture: { ok: architectureResult.ok, status: architectureResult.status }
    });
    process.exitCode = definitionResult.ok && architectureResult.ok ? 0 : 1;
    return;
  }

  if (command === 'mcp-smoke') {
    print({
      entities: await handlers.list_entities(),
      queueWorkflow: await handlers.get_workflow({ type: 'queue' }),
      queueSchema: await handlers.get_entity_schema({ type: 'queue' }),
      routes: await handlers.list_routes(),
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
    commands: ['list-entities', 'list-workflows', 'list-routes', 'query-docs', 'validate', 'mcp-smoke']
  });
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

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
