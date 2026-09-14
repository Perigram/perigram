/**
 * Architectural Guardrail Script
 * Verifies that all server features adhere to the v24 Golden Path.
 */
import fs from 'fs';
import path from 'path';
import { cncEntities } from '../packages/domain-cnc/src/entities.js';
import { cncCommands } from '../packages/domain-cnc/src/commands.js';
import { cncTasks } from '../packages/domain-cnc/src/tasks.js';
import { cncEvents } from '../packages/domain-cnc/src/events.js';
import { cncEffects } from '../packages/domain-cnc/src/effects.js';
import { cncWorkflows } from '../packages/domain-cnc/src/workflows.js';

const FEATURES_DIR = './server/features';
const API_DIR = './server/api';
const ENTITY_FEATURES = cncEntities.map(entity => entity.feature || entityTypeToFeature(entity.type));
const featureToEntityTypeMap = new Map(
  cncEntities.map(entity => [entity.feature || entityTypeToFeature(entity.type), entity.type])
);
function featureToEntityType(feature) {
  return featureToEntityTypeMap.get(feature) || null;
}
const CAPABILITY_FEATURES = [
  'config-bot',
  'connections',
  'entity-events',
  'files',
  'livekit',
  'billing',
  'artifact-conversions',
  'invitations',
  'material-options',
  'nesting',
  'notification',
  'parametric-cassettes',
  'results',
  'sessions',
  'statuses',
  'support',
  'system-settings',
  'workflow-overrides'
];
const IGNORE = ['_template', 'README.md', 'index.js'];
const ENTITY_ROOT_ALIAS_FIELDS = ['id', 'name', 'slug', 'serial', 'reference', 'type', 'geometry', 'parameters'];
const LEGACY_RAW_FIELD_PATTERN = /\braw\.(name|slug|serial|reference|type|geometry|parameters|metadata|organizationId|currentOrganizationId|warehouseId|params)\b/;
const ROOT_TO_JSON_ALIAS_PATTERN = new RegExp(`\\b(${ENTITY_ROOT_ALIAS_FIELDS.join('|')}):\\s*this\\.`);
const NUXT_ROOT_ALIAS_IMPORT_PATTERN = /(?:from\s+['"]~{1,2}\/|import\s*\(\s*['"]~{1,2}\/|require\s*\(\s*['"]~{1,2}\/)/;
const PARENT_RELATIVE_IMPORT_PATTERN = /(?:from\s+['"]\.\.\/|import\s*\(\s*['"]\.\.\/|require\s*\(\s*['"]\.\.\/)/;

console.log('🚀 Starting Architectural Verification...');

const walkDir = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkDir(full));
    else files.push(full);
  }
  return files;
};

const directories = fs.readdirSync(FEATURES_DIR).filter(f => !IGNORE.includes(f) && fs.statSync(path.join(FEATURES_DIR, f)).isDirectory());
const declared = new Set([...ENTITY_FEATURES, ...CAPABILITY_FEATURES]);
const features = ENTITY_FEATURES;
const appRegistry = fs.readFileSync('server/runtime/app-registry.js', 'utf8');

let errors = 0;
const inventory = [];

function addInventory(rule, file, line, symbol, message) {
  inventory.push({ rule, file: path.relative('.', file), line, symbol, message });
}

function collectLineMatches(files, checks) {
  files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      checks.forEach(check => {
        if (check.excludeFile?.(file)) return;
        const match = line.match(check.pattern);
        if (match) {
          addInventory(check.rule, file, index + 1, match[1] || check.symbol || 'n/a', check.message);
        }
      });
    });
  });
}

directories.forEach(feature => {
  if (!declared.has(feature)) {
    console.error(`❌ Feature directory [${feature}] is not classified as an entity or capability`);
    errors++;
  }
});

features.forEach(feature => {
  const dir = path.join(FEATURES_DIR, feature);
  if (!fs.existsSync(dir)) {
    console.error(`❌ Declared entity feature is missing: ${feature}`);
    errors++;
    return;
  }
  const files = fs.readdirSync(dir);

  console.log(`\nChecking feature: [${feature}]`);

  // 1. Check required files
  const required = ['model.js', 'repository.js', 'service.js'];
  required.forEach(file => {
    if (!files.includes(file)) {
      console.error(`❌ Missing required file: ${file}`);
      errors++;
    }
  });

  // 2. Services must not self-register through hidden global registries.
  if (files.includes('service.js')) {
    const content = fs.readFileSync(path.join(dir, 'service.js'), 'utf8');
    if (/register(Service|EntityService)\s*\(/.test(content)) {
      console.error(`❌ Service self-registers — use server/runtime/app-registry.js composition`);
      errors++;
    }
    if (/db\.collection\s*\(/.test(content)) {
      console.error(`❌ Service uses raw db.collection — move data access to repository/adapter`);
      errors++;
    }
  }

  // 3. Check Repository for flexible IDs
  if (files.includes('repository.js')) {
    const content = fs.readFileSync(path.join(dir, 'repository.js'), 'utf8');
    if (!content.includes('toFlexibleId')) {
      console.error(`❌ Repository does not use toFlexibleId()`);
      errors++;
    }
  }

  // 4. Check Model for BaseEntity
  if (files.includes('model.js')) {
    const content = fs.readFileSync(path.join(dir, 'model.js'), 'utf8');
    if (!content.includes('extends BaseEntity')) {
      console.error(`❌ Model does not extend BaseEntity`);
      errors++;
    }
    // 5. Model must import BaseEntity from core/blocks, not utils/blocks
    if (content.includes('utils/blocks')) {
      console.error(`❌ Model imports from deprecated utils/blocks — use server/core/blocks/index.js`);
      errors++;
    }
    if (ROOT_TO_JSON_ALIAS_PATTERN.test(content)) {
      console.error(`❌ Model serializes root DTO aliases — keep fields inside canonical blocks`);
      errors++;
    }
    if (LEGACY_RAW_FIELD_PATTERN.test(content)) {
      console.error(`❌ Model reads legacy root/params fields — constructors must accept canonical blocks only`);
      errors++;
    }
  }

  // 6. Service must import from core/blocks, not utils/blocks
  if (files.includes('service.js')) {
    const content = fs.readFileSync(path.join(dir, 'service.js'), 'utf8');
    if (content.includes('utils/blocks')) {
      console.error(`❌ Service imports from deprecated utils/blocks — use server/core/blocks/index.js`);
      errors++;
    }
  }

  // 7. index.js must not export repository or model
  if (files.includes('index.js')) {
    const content = fs.readFileSync(path.join(dir, 'index.js'), 'utf8');
    if (/export.*repository/i.test(content) || /from.*repository/i.test(content)) {
      console.error(`❌ index.js exports repository — only service may be exported from index.js`);
      errors++;
    }
    if (/export.*model/i.test(content) || /from.*model/i.test(content)) {
      console.error(`❌ index.js exports model — only service may be exported from index.js`);
      errors++;
    }
  }
});

cncEntities.forEach(entity => {
  if (!new RegExp(`\\b${entity.type}\\s*:`).test(appRegistry)) {
    console.error(`❌ Entity [${entity.type}] is not registered in server/runtime/app-registry.js`);
    errors++;
  }
});

// 8. API routes must not import repository or model directly from features
console.log('\nChecking API routes for layer violations...');
const apiFiles = walkDir(API_DIR).filter(file => file.endsWith('.js'));
apiFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const relFile = path.relative('.', file);
  if (/from.*features\/.*\/repository/i.test(content)) {
    console.error(`❌ API route [${relFile}] imports repository directly — use service layer`);
    errors++;
  }
  if (/from.*features\/.*\/model/i.test(content)) {
    console.error(`❌ API route [${relFile}] imports model directly — use service layer`);
    errors++;
  }
});

console.log('\nChecking canonical block DTO contract...');
[
  'server/core/blocks/BaseEntity.js',
  'packages/core/src/index.js'
].forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  if (/\n\s+id:\s*this\.id\b/.test(content)) {
    console.error(`❌ ${file} serializes root id alias — use _id plus identity.uid`);
    errors++;
  }
});

const dtoContractFiles = [
  ...walkDir('components/entities').filter(file => file.endsWith('.vue')),
  ...walkDir('components/shared').filter(file => file.endsWith('.vue')),
  ...walkDir('composables').filter(file => file.endsWith('.js')),
  ...walkDir('pages/test').filter(file => file.endsWith('.vue')),
  ...walkDir('test-data').filter(file => file.endsWith('.js'))
];

const frontendLegacyPatterns = [
  { pattern: /\bentity\.id\b/, message: 'uses entity.id; use _id or identity.uid' },
  { pattern: /\bprops\.[a-zA-Z0-9_]+\.(name|slug|serial|reference)\b/, message: 'reads identity fields from entity root' },
  { pattern: /\braw\.status\?\.state\s*\|\|\s*raw\.status\b/, message: 'accepts legacy root status value' }
];

dtoContractFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  for (const check of frontendLegacyPatterns) {
    if (check.pattern.test(content)) {
      console.error(`❌ ${file} ${check.message}`);
      errors++;
    }
  }
});

console.log('\nChecking golden architecture boundaries...');
const portableRuntimeFiles = [
  ...walkDir('shared').filter(file => /\.(js|ts|mjs|cjs)$/.test(file) && !file.endsWith('.spec.js')),
  ...walkDir('test-data').filter(file => /\.(js|ts|mjs|cjs)$/.test(file) && !file.endsWith('.spec.js')),
  ...walkDir('packages').filter(file => /\.(js|ts|mjs|cjs)$/.test(file) && !file.endsWith('.spec.js'))
];
portableRuntimeFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const relFile = path.relative('.', file);
  if (NUXT_ROOT_ALIAS_IMPORT_PATTERN.test(content)) {
    console.error(`❌ ${relFile} uses Nuxt root alias in a portable runtime module — use package names or relative imports`);
    errors++;
  }
  if ((relFile.startsWith('shared/') || relFile.startsWith('test-data/')) && PARENT_RELATIVE_IMPORT_PATTERN.test(content)) {
    console.error(`❌ ${relFile} uses parent-relative imports in a portable runtime module — use #shared/#packages/#utils imports`);
    errors++;
  }
});

const jsFiles = [
  ...walkDir('server').filter(file => file.endsWith('.js')),
  ...walkDir('components').filter(file => file.endsWith('.vue')),
  ...walkDir('composables').filter(file => file.endsWith('.js')),
  ...walkDir('workers').filter(file => file.endsWith('.py'))
];

jsFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const relFile = path.relative('.', file);

  if (relFile.startsWith('server/core/') && !relFile.endsWith('README.md') && /(@cutkit\/domain-cnc|packages\/domain-cnc)/.test(content)) {
    console.error(`❌ ${relFile} imports CNC domain directly — use server/runtime/cutkit-registry.js`);
    errors++;
  }

  if (relFile !== 'server/core/tasks/repository.js' && /db\.collection\((['"])task_runs\1\)|task_runs\s*=\s*db\[(['"])task_runs\2\]/.test(content)) {
    console.error(`❌ ${relFile} touches task_runs directly — use server/core/tasks/service.js`);
    errors++;
  }

  if (/(serviceAction|service_action|process_runs|service_action_runs|defineProcess|listProcessDefinitions|executeServiceAction|\/api\/processes|\/api\/operations)/.test(content)) {
    console.error(`❌ ${relFile} uses retired operation/process/service-action vocabulary`);
    errors++;
  }

  if (
    (relFile.startsWith('components/shared/') || relFile === 'composables/useEntity.js' || relFile === 'components/ArtifactsTable.vue') &&
    /(@cutkit\/domain-cnc|packages\/domain-cnc)/.test(content)
  ) {
    console.error(`❌ ${relFile} imports CNC domain directly — consume the injected domain UI adapter`);
    errors++;
  }
});

console.log('\nChecking command/task boundary leaks...');
const intentFlowFile = 'packages/domain-cnc/src/workflows.js';
const intentFlowContent = fs.readFileSync(intentFlowFile, 'utf8');
[
  { pattern: /from:\s*'DRAFT',\s*to:\s*'NESTING'[\s\S]*?intent:\s*'requestNesting'/, message: 'missing queue requestNesting intent' },
  { pattern: /from:\s*'NESTING',\s*to:\s*'READY'[\s\S]*?intent:\s*'completeNestingProduction'/, message: 'missing completeNestingProduction intent' },
  { pattern: /from:\s*'NESTING',\s*to:\s*'ERROR'[\s\S]*?intent:\s*'nestingSolveFailed'/, message: 'missing nestingSolveFailed intent on queue' },
  { pattern: /from:\s*'NESTING',\s*to:\s*'COMPLETE'[\s\S]*?intent:\s*'nestingSolveCompleted'/, message: 'missing nestingSolveCompleted intent' },
  { pattern: /from:\s*'NESTING',\s*to:\s*'ERROR'[\s\S]*?intent:\s*'nestingSolveFailed'/, message: 'missing nestingSolveFailed intent on nesting_run' },
  { pattern: /from:\s*'COMPLETE',\s*to:\s*'CHOSEN'[\s\S]*?intent:\s*'acceptNestingRun'/, message: 'missing acceptNestingRun intent' }
].forEach(check => {
  if (!check.pattern.test(intentFlowContent)) {
    console.error(`❌ ${intentFlowFile} ${check.message}`);
    errors++;
  }
});

const commandBoundaryFiles = walkDir('server/features').filter(file => file.endsWith('operations.js'));
commandBoundaryFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const relFile = path.relative('.', file);
  if (/statusService\.transition\(\s*['"]queue['"]/.test(content) || /transitionQueueIfState/.test(content)) {
    console.error(`❌ ${relFile} mutates queue status directly inside a command handler — return an effect instead`);
    errors++;
  }
  if (/statusService\.transition\(\s*['"]nesting_run['"]/.test(content) && relFile.includes('/nesting/')) {
    console.error(`❌ ${relFile} mutates nesting_run status directly inside a task/command handler — return a transition effect instead`);
    errors++;
  }
  if (/\bcreateStatus\s*\(/.test(content) || /import\s+\{[^}]*\bcreateStatus\b/.test(content)) {
    console.error(`❌ ${relFile} creates status blocks inside a command/task operation — use service initialization or transition effects`);
    errors++;
  }
});

console.log('\nChecking domain event contracts...');
const eventPolicies = Object.values(cncEffects || {});
const eventDefinitions = new Map(Object.values(cncEvents || {}).map(event => [event.id, event]));
const checkDeclaredOutputEvents = (ownerType, ownerId, events = []) => {
  for (const eventId of events || []) {
    const event = eventDefinitions.get(eventId);
    const hasPolicy = eventPolicies.some(policy => policy.on === eventId);
    if (!event) {
      console.error(`❌ ${ownerType} [${ownerId}] outputs undeclared event [${eventId}]`);
      errors++;
      continue;
    }
    if (!hasPolicy && event.informational !== true) {
      console.error(`❌ ${ownerType} [${ownerId}] event [${eventId}] is not consumed by an effect policy or marked informational`);
      errors++;
    }
  }
};

Object.values(cncCommands || {}).forEach(command => {
  checkDeclaredOutputEvents('Command', command.id, command.output?.events || []);
});
Object.values(cncTasks || {}).forEach(task => {
  checkDeclaredOutputEvents('Task', task.id, task.output?.events || []);
});

console.log('\nChecking UI status boundaries...');
const uiRuntimeFiles = [
  ...walkDir('components').filter(file => file.endsWith('.vue')),
  ...walkDir('composables').filter(file => file.endsWith('.js')),
  ...walkDir('pages').filter(file => file.endsWith('.vue')),
  ...walkDir('utils').filter(file => file.endsWith('.js'))
];
uiRuntimeFiles.forEach(file => {
  const relFile = path.relative('.', file);
  if (relFile === 'composables/useStatusController.js') return;
  const content = fs.readFileSync(file, 'utf8');
  if (/['"]\/api\/status\/(?:transition|actions)['"]/.test(content)) {
    console.error(`❌ ${relFile} calls status API directly — use useStatusController/EntityStatus`);
    errors++;
  }
  if (
    !relFile.startsWith('components/shared/') &&
    !relFile.startsWith('pages/test/') &&
    /:status-actions\s*=/.test(content)
  ) {
    console.error(`❌ ${relFile} passes local status actions — live entity UI must use server-provided EntityStatus actions`);
    errors++;
  }
});

console.log('\nCollecting migration inventory...');
const featureServiceFiles = walkDir('server/features').filter(file => file.endsWith('/service.js'));
collectLineMatches(featureServiceFiles, [
  {
    rule: 'status.initialization.createStatus',
    pattern: /\b(createStatus)\s*\(/,
    message: 'legacy status block creation; migrate entity creation to statusService.initialStatus()',
    excludeFile: file => {
      const feature = path.basename(path.dirname(file));
      const entityType = featureToEntityType(feature);
      return !entityType || !cncWorkflows[entityType];
    }
  },
  {
    rule: 'status.transition.rawState',
    pattern: /\bstatusService\.(transition)\s*\(/,
    message: 'raw target-state transition in feature service; prefer workflow intent or status API boundary'
  },
  {
    rule: 'service.persistence.rawDb',
    pattern: /\b(db\.collection)\s*\(/,
    message: 'raw DB access in feature service; move persistence behind repository/adapter'
  }
]);

const frontendStatusFiles = [
  ...walkDir('components').filter(file => file.endsWith('.vue')),
  ...walkDir('pages').filter(file => file.endsWith('.vue'))
];
collectLineMatches(frontendStatusFiles, [
  {
    rule: 'ui.lifecycle.literal',
    pattern: /\b(?:entity\.status|status\.state|status\?\.state|(?:props\.)?[a-zA-Z]+\.status\.state)\s*(?:===|!==)\s*['"]([A-Z][A-Z_-]+)['"]/,
    message: 'hardcoded lifecycle state in UI; prefer server-provided actions/status contracts'
  }
]);

// 9. Migration inventory must be empty; every finding is blocking.
if (inventory.length > 0) {
  console.log(`\n--- Architecture Violations (${inventory.length} blocking items) ---`);
  inventory.forEach(item => {
    console.error(`❌ ${item.rule} ${item.file}:${item.line} [${item.symbol}] ${item.message}`);
  });
  errors += inventory.length;
}

// 10. Concrete CNC domain imports in generic/generated modules
console.log('\nChecking concrete CNC domain leaks...');
const genericUiFiles = [
  ...walkDir('composables').filter(file => file.endsWith('.js')),
  ...walkDir('components/generated').filter(file => file.endsWith('.vue')),
  ...walkDir('components/shared').filter(file => file.endsWith('.vue'))
];
genericUiFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const relFile = path.relative('.', file);
  if (relFile === 'composables/useCutkitDomainUi.js') return;
  if (/from\s+['"]@cutkit\/domain-cnc['"]/.test(content)) {
    console.error(`❌ ${relFile} imports @cutkit/domain-cnc directly — consume the injected domain UI adapter`);
    errors++;
  }
});

// 11. Duplicate object keys in domain registry files
console.log('\nChecking duplicate object keys...');
const objectKeyFiles = [
  'packages/domain-cnc/src/summaries.js',
  'packages/domain-cnc/src/relationships.js'
];
objectKeyFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  let braceDepth = 0;
  let arrayDepth = 0;
  const keyPositions = new Map();
  let inTopLevelObject = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^export const \w+\s*=\s*\{/.test(line.trim())) {
      inTopLevelObject = true;
      braceDepth = 0;
      arrayDepth = 0;
      keyPositions.clear();
      continue;
    }
    if (!inTopLevelObject) continue;
    braceDepth += (line.match(/\{/g) || []).length;
    braceDepth -= (line.match(/\}/g) || []).length;
    if (braceDepth <= 0) {
      inTopLevelObject = false;
      continue;
    }
    arrayDepth += (line.match(/\[/g) || []).length;
    arrayDepth -= (line.match(/\]/g) || []).length;
    if (arrayDepth > 0) continue;
    const keyMatch = line.match(/^\s*(\w+)\s*:\s*/);
    if (keyMatch && braceDepth === 1) {
      const key = keyMatch[1];
      if (keyPositions.has(key)) {
        console.error(`❌ ${file}:${i + 1} duplicate object key [${key}] (also at line ${keyPositions.get(key)})`);
        errors++;
      } else {
        keyPositions.set(key, i + 1);
      }
    }
  }
});

// 12. Concrete entity-name branches in @cutkit/processes
console.log('\nChecking concrete entity-name branches in @cutkit/processes...');
const processesDir = 'packages/processes/src';
const processesFiles = walkDir(processesDir).filter(file => file.endsWith('.js') && !file.endsWith('.spec.js'));
processesFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const relFile = path.relative('.', file);
  lines.forEach((line, index) => {
    const entityMatch = line.match(/(?:entityType|targetType|childType)\s*[=:]\s*['"]([a-z_]+)['"]/g);
    if (entityMatch) {
      for (const match of entityMatch) {
        const name = match.match(/['"]([a-z_]+)['"]/)[1];
        if (name !== 'artifact' && name !== 'project' && name !== 'queue' && name !== 'cassette' && name !== 'cassette_design' && name !== 'library' && name !== 'nesting_run' && name !== 'sheet_design' && name !== 'sheet' && name !== 'cassette_instance' && name !== 'facade' && name !== 'facade_pattern' && name !== 'geometry_capture' && name !== 'catalog' && name !== 'color' && name !== 'warehouse' && name !== 'material_pile' && name !== 'batch_pile' && name !== 'organization' && name !== 'remnant') continue;
        console.error(`❌ ${relFile}:${index + 1} hardcoded CNC entity name [${name}] in generic process module`);
        errors++;
      }
    }
  });
});

// 13. Runtime legacy-process bridges
console.log('\nChecking runtime legacy-process bridges...');
const allSourceFiles = [
  ...walkDir('packages/processes/src').filter(file => file.endsWith('.js')),
  ...walkDir('server/features').filter(file => file.endsWith('.js')),
  ...walkDir('components').filter(file => file.endsWith('.vue')),
  ...walkDir('pages').filter(file => file.endsWith('.vue'))
];
const legacyPatterns = [
  { pattern: /\blegacyActionId\b/, name: 'legacyActionId' },
  { pattern: /\blegacyProcessType\b/, name: 'legacyProcessType' },
  { pattern: /\blegacyTypeToTemplateId\b/, name: 'legacyTypeToTemplateId' }
];
legacyPatterns.forEach(({ pattern, name }) => {
  allSourceFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    if (pattern.test(content)) {
      const relFile = path.relative('.', file);
      console.error(`❌ ${relFile} uses legacy bridge [${name}] — migrate to current protocol`);
      errors++;
    }
  });
});

// 14. Cross-feature repository imports
console.log('\nChecking cross-feature repository imports...');
const featureFiles = walkDir('server/features').filter(file => file.endsWith('.js'));
featureFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const relFile = path.relative('.', file);
  const repoMatch = content.match(/from\s+['"]\.\.\/[a-z-]+\/repository['"]/g);
  if (repoMatch) {
    console.error(`❌ ${relFile} imports cross-feature repository — call registered services only`);
    errors++;
  }
});

// 15. Source-assertion tests
// Source-contract tests remain allowed only for genuine static boundaries such
// as forbidden imports or manifest structure. Allowed specs below assert
// structural wiring, forbidden-import boundaries, token projection, or
// manifest completeness; they do not fake component/page behavior by searching
// source text. Behavioral specs (auth, screen hydration) are converted to
// behavioral coverage and are not in this set.
console.log('\nChecking source-assertion test practices...');
const staticBoundarySpecs = new Set([
  'shared/design-system.spec.js',
  'shared/framework-packages.spec.js',
  'shared/process-designer-ui.spec.js',
  'shared/localization.spec.js',
  'components/ui-rework-review.spec.js',
  'components/generated/project-workspace.spec.js',
  'components/generated/project-file-operations.spec.js',
  'components/entities/Artifact/artifact-detail.spec.js',
  'components/artifacts/artifact-viewer.spec.js'
]);
const specFiles = walkDir('.').filter(file => file.endsWith('.spec.js') && !file.includes('node_modules'));
specFiles.forEach(file => {
  const relFile = path.relative('.', file);
  if (relFile.startsWith('server/scripts/') || relFile.startsWith('node_modules/')) return;
  if (staticBoundarySpecs.has(relFile) || relFile.startsWith('components/shared/')) return;
  const content = fs.readFileSync(file, 'utf8');
  if (/\breadFileSync\s*\(/.test(content) && /\.toContain\s*\(/.test(content)) {
    console.error(`❌ ${relFile} uses source-string assertions (readFileSync + toContain) — use behavioral tests`);
    errors++;
  }
});

console.log('\n--- Dynamic import resolution ---');
// A bad relative dynamic import resolves fine under vite-node until the code
// path runs, but Nitro resolves it statically and the whole server bundle
// fails (every route 503). Guard the whole class: every relative import()
// specifier under server/ must resolve to a real file.
for (const file of walkDir('server').filter(item => item.endsWith('.js') && !item.endsWith('.spec.js'))) {
  const relFile = path.relative('.', file);
  const content = fs.readFileSync(file, 'utf8');
  for (const match of content.matchAll(/import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
    const resolved = path.resolve(path.dirname(file), match[1]);
    if (!fs.existsSync(resolved)) {
      console.error(`❌ ${relFile} dynamic import '${match[1]}' does not resolve to a file`);
      errors++;
    }
  }
}

console.log('\n--- Bare workspace-package imports ---');
// Bare `@cutkit/*` specifiers resolve only where workspace symlinks exist
// (a host install); the dev container runs Nitro with its own node_modules
// that has none, so such imports 500 at request time. Cross-root imports
// must use the package.json `imports` subpaths (#packages/..., #shared/...,
// #utils/...).
for (const file of [...walkDir('server'), ...walkDir('shared')]) {
  if (!file.endsWith('.js') || file.endsWith('.spec.js')) continue;
  const relFile = path.relative('.', file);
  const content = fs.readFileSync(file, 'utf8');
  for (const match of content.matchAll(/(?:from\s+['"]|import\s*\(\s*['"])@cutkit\//g)) {
    console.error(`❌ ${relFile} imports bare workspace package near '${match[0].trim()}' — use #packages/... instead`);
    errors++;
  }
}

console.log('\n--- Verification Summary ---');
if (errors === 0) {
  console.log('✅ All features comply with v24 Golden Path.');
  process.exit(0);
} else {
  console.error(`❌ Found ${errors} architectural violations.`);
  process.exit(1);
}

function entityTypeToFeature(type) {
  return `${type.replace(/_/g, '-')}s`;
}
