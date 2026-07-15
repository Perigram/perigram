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

const FEATURES_DIR = './server/features';
const API_DIR = './server/api';
const ENTITY_FEATURES = cncEntities.map(entity => entity.feature || entityTypeToFeature(entity.type));
const CAPABILITY_FEATURES = [
  'config-bot',
  'entity-events',
  'files',
  'billing',
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
  ...walkDir('pages/projects').filter(file => file.endsWith('.vue')),
  ...walkDir('pages/project').filter(file => file.endsWith('.vue')),
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

  if (relFile.startsWith('server/features/') && !relFile.endsWith('.spec.js')) {
    for (const match of content.matchAll(/(?:from\s*|import\s*\(\s*)['"]((?:\.\.\/)+(?:utils|shared|packages)\/[^'"]+)['"]/g)) {
      const resolvedImport = path.normalize(path.join(path.dirname(relFile), match[1]));
      if (/^(?:utils|shared|packages)\//.test(resolvedImport)) {
        console.error(`❌ ${relFile} imports root runtime code through ${match[1]} — use #utils/#shared/#packages so Nitro preserves the workspace root`);
        errors++;
      }
    }
  }

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
  { pattern: /nesting:\s*\{/, message: 'missing queue nesting status region' },
  { pattern: /intent:\s*'requestNesting'/, message: 'missing queue requestNesting intent' },
  { pattern: /intent:\s*'nestingSolveCompleted'/, message: 'missing queue nestingSolveCompleted intent' },
  { pattern: /intent:\s*'nestingSolveFailed'/, message: 'missing queue nestingSolveFailed intent' },
  { pattern: /intent:\s*'selectNestingRevision'/, message: 'missing queue selectNestingRevision intent' }
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
    message: 'legacy status block creation; migrate entity creation to statusService.initialStatus()'
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
    pattern: /\bstatus(?:\.state)?\s*(?:===|!==)\s*['"]([A-Z][A-Z_-]+)['"]/,
    message: 'hardcoded lifecycle state in UI; prefer server-provided actions/status contracts'
  }
]);

if (inventory.length > 0) {
  console.log(`\n--- Migration Inventory (${inventory.length} non-blocking items) ---`);
  inventory.forEach(item => {
    console.log(`• ${item.rule} ${item.file}:${item.line} [${item.symbol}] ${item.message}`);
  });
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
