/**
 * Architectural Guardrail Script
 * Verifies that all server features adhere to the v24 Golden Path.
 */
import fs from 'fs';
import path from 'path';

const FEATURES_DIR = './server/features';
const API_DIR = './server/api';
const ENTITY_FEATURES = [
  'artifacts',
  'cassette-designs',
  'cassette-instances',
  'cassettes',
  'catalogs',
  'colors',
  'material-piles',
  'nesting-runs',
  'organizations',
  'projects',
  'queues',
  'remnants',
  'requisitions',
  'sheet-designs',
  'sheets',
  'users',
  'warehouses'
];
const CAPABILITY_FEATURES = [
  'files',
  'invitations',
  'layer-standards',
  'material-options',
  'materials',
  'nesting',
  'notification',
  'parametric-cassettes',
  'payment',
  'pen-templates',
  'results',
  'sessions',
  'statuses',
  'support',
  'system-settings',
  'tool-profiles'
];
const IGNORE = ['_template', 'README.md', 'index.js'];
const ENTITY_ROOT_ALIAS_FIELDS = ['id', 'name', 'slug', 'serial', 'reference', 'type', 'geometry', 'parameters'];
const LEGACY_RAW_FIELD_PATTERN = /\braw\.(name|slug|serial|reference|type|geometry|parameters|metadata|organizationId|currentOrganizationId|warehouseId|params)\b/;
const ROOT_TO_JSON_ALIAS_PATTERN = new RegExp(`\\b(${ENTITY_ROOT_ALIAS_FIELDS.join('|')}):\\s*this\\.`);

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

let errors = 0;

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

console.log('\n--- Verification Summary ---');
if (errors === 0) {
  console.log('✅ All features comply with v24 Golden Path.');
  process.exit(0);
} else {
  console.error(`❌ Found ${errors} architectural violations.`);
  process.exit(1);
}
