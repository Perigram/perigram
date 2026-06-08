/**
 * Compatibility wrapper for the canonical server seed script.
 */

import { execFileSync } from 'child_process';

execFileSync('node', ['server/scripts/seed-layer-standards.js'], { stdio: 'inherit' });
