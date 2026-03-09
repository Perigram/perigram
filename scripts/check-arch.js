/**
 * Architectural Guardrail Script
 * Verifies that all server features adhere to the v24 Golden Path.
 */
import fs from 'fs';
import path from 'path';

const FEATURES_DIR = './server/features';
const IGNORE = ['_template', 'NEOLIT.md', 'index.js'];

console.log('🚀 Starting Architectural Verification...');

const features = fs.readdirSync(FEATURES_DIR).filter(f => !IGNORE.includes(f) && fs.statSync(path.join(FEATURES_DIR, f)).isDirectory());

let errors = 0;

features.forEach(feature => {
  const dir = path.join(FEATURES_DIR, feature);
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
