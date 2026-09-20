/**
 * Seed All System Data
 */

import { execSync } from 'child_process';

const scripts = [
  'seed-system-pens.js',
  'seed-layer-standards.js',
  'seed-palette-colors.js',
  'seed-system-tools.js',
  'seed-system-machines.js'
];

console.log('🌱 Seeding all system data...\n');

for (const script of scripts) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running: ${script}`);
  console.log('='.repeat(60) + '\n');
  
  try {
    execSync(`node server/scripts/${script}`, { stdio: 'inherit' });
  } catch (error) {
    console.error(`\n❌ Failed to run ${script}`);
    process.exit(1);
  }
}

console.log('\n' + '='.repeat(60));
console.log('✅ All seeding complete!');
console.log('='.repeat(60));
