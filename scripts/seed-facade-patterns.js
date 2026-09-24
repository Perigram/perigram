/**
 * Compatibility wrapper for the canonical server seed script.
 */

import { execFileSync } from 'child_process';

execFileSync('node', ['server/scripts/seed-facade-patterns.js', ...process.argv.slice(2)], { stdio: 'inherit' });
