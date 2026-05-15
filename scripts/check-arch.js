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

console.log('🚀 Starting Architectural Verification...');

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

  // 2. Check Service for registration
  if (files.includes('service.js')) {
    const content = fs.readFileSync(path.join(dir, 'service.js'), 'utf8');
    if (!content.includes('registerService')) {
      console.error(`❌ Service does not call registerService()`);
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
const walkDir = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkDir(full));
    else if (entry.name.endsWith('.js')) files.push(full);
  }
  return files;
};

const apiFiles = walkDir(API_DIR);
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

console.log('\n--- Verification Summary ---');
if (errors === 0) {
  console.log('✅ All features comply with v24 Golden Path.');
  process.exit(0);
} else {
  console.error(`❌ Found ${errors} architectural violations.`);
  process.exit(1);
}
