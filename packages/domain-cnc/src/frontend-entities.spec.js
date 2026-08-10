import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { cncDomain } from './index.js';

const entityEndpoints = cncDomain.ui.endpoints;

const API_DIR = path.resolve(import.meta.dirname, '../../../server/api');
const realApiDirs = new Set(
  fs.readdirSync(API_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
);

function routeBase(route = '') {
  return String(route).replace(/^\/api\//, '').split('/')[0];
}

describe('frontend entity route contract', () => {
  it('every derived list route resolves to a real API directory', () => {
    const missing = entityEndpoints
      .map(entry => ({ type: entry.type, list: entry.routes?.list }))
      .filter(entry => entry.list)
      .filter(entry => !realApiDirs.has(routeBase(entry.list)))
      .map(entry => `${entry.type} -> ${entry.list}`);
    expect(missing).toEqual([]);
  });

  it('every derived single route resolves to a real API directory', () => {
    const missing = entityEndpoints
      .map(entry => ({ type: entry.type, single: entry.routes?.single, download: entry.routes?.download }))
      .flatMap(entry => [entry.single, entry.download].filter(Boolean).map(route => `${entry.type} -> ${route}`))
      .filter(line => !realApiDirs.has(routeBase(line.split(' -> ')[1])));
    expect(missing).toEqual([]);
  });

  it('uses kebab-case route paths (no underscore API paths)', () => {
    const underscore = entityEndpoints
      .flatMap(entry => Object.values(entry.routes || {}))
      .filter(route => /_/.test(route || ''))
      .map(route => `-> ${route}`);
    expect(underscore).toEqual([]);
  });
});
