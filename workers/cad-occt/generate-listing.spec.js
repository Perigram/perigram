// The catalog generator's own contract: the .d.ts scanner reads real
// declaration syntax, the curated operations verify against the
// declarations they name (a drifting mapping refuses loudly), and the
// committed listing is exactly what the generator emits from the
// installed brepjs package.
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseListing } from '../../packages/plugin-sdk/src/listing.js';
import { nodeDefinitionFromService } from '../../packages/plugin-sdk/src/node-contract.js';
import { parseDeclarationFile, readBrepjsDeclarations, buildListing, generateListing, verifyAgainstDeclarations, OPERATIONS } from './generate-listing.mjs';
import listing from './listing.json';

const pluginRoot = dirname(fileURLToPath(import.meta.url));
const brepjsRoot = resolve(pluginRoot, 'node_modules/brepjs');

const FIXTURE = `
export interface BoxOptions {
    /** Center at this point. */
    at?: Vec3;
    readonly centered?: boolean;
}
export declare function box(width: number, depth: number, height: number, options?: BoxOptions): ValidSolid;
export declare function translate<T extends AnyShape<Dimension>>(shape: Shapeable<T>, v: Vec3): T;
export declare function fillet<T extends ValidSolid>(shape: Shapeable<T>, radius: FilletRadius): Result<T>;
export declare function importSTEP(blob: Blob): Promise<Result<UnknownDimShape>>;
`;

describe('brepjs declaration scanner', () => {
  it('extracts signatures with type parameters, optionals, and interface members', () => {
    const parsed = parseDeclarationFile(FIXTURE);
    const translate = parsed.functions.get('translate');
    expect(translate).toHaveLength(1);
    expect(translate[0].parameters).toEqual([
      { name: 'shape', optional: false, type: 'Shapeable<T>' },
      { name: 'v', optional: false, type: 'Vec3' }
    ]);
    expect(translate[0].returns).toBe('T');
    const options = parsed.interfaces.get('BoxOptions');
    expect(options).toEqual([
      { name: 'at', optional: true, type: 'Vec3' },
      { name: 'centered', optional: true, type: 'boolean' }
    ]);
  });

  it('resolves the options interface from the declaring file over the merged map', () => {
    const directory = mkdtempSync(join(tmpdir(), 'brepjs-decls-'));
    mkdirSync(join(directory, 'dist', 'a'), { recursive: true });
    mkdirSync(join(directory, 'dist', 'b'), { recursive: true });
    // The merged-map fallback sees a-rotate first; the function's own file
    // (b-rotate) must win.
    writeFileSync(join(directory, 'dist', 'a-rotate.d.ts'),
      'export interface RotateOptions { at?: Vec3Input; }\nexport declare function rotate(angle: number, options?: RotateOptions): void;\n');
    writeFileSync(join(directory, 'dist', 'b-rotate.d.ts'),
      'export interface RotateOptions { at?: Vec3; axis?: Vec3; }\nexport declare function spin(angle: number, options?: RotateOptions): void;\n');
    const declarations = readBrepjsDeclarations(directory);
    expect(declarations.interfaces.get('RotateOptions').map(member => member.name)).toEqual(['at']);
    expect(declarations.byFile.get(join(directory, 'dist', 'b-rotate.d.ts')).interfaces.get('RotateOptions').map(member => member.name)).toEqual(['at', 'axis']);
  });
});

describe('curated operation verification', () => {
  it('accepts the curated table against the real brepjs declarations', () => {
    if (!existsSync(brepjsRoot)) return;
    const result = generateListing(brepjsRoot, { output: null });
    expect(result.operations).toBe(OPERATIONS.length);
  });

  it('refuses a curated mapping whose brepjs type family disagrees', () => {
    const directory = mkdtempSync(join(tmpdir(), 'brepjs-decls-'));
    mkdirSync(join(directory, 'dist'), { recursive: true });
    writeFileSync(join(directory, 'dist', 'shape.d.ts'), FIXTURE);
    const declarations = readBrepjsDeclarations(directory);
    const box = OPERATIONS.find(operation => operation.id === 'make-box');
    const drifting = [{
      ...box,
      source: { ...box.source, file: 'shape.d.ts' },
      fields: { ...box.fields, width: { field: { base: 'json', kind: 'geometry.point3' }, dts: { name: 'width', type: 'number' } } }
    }];
    const problems = verifyAgainstDeclarations(drifting, declarations, directory);
    expect(problems).toEqual([
      'make-box.width: brepjs types it number; the curated geometry.point3 mapping requires Vec3'
    ]);
  });

  it('emits a listing that validates and derives one node definition per service', () => {
    const emitted = buildListing();
    expect(() => parseListing(emitted, 'workers/cad-occt')).not.toThrow();
    for (const service of emitted.declarations.services) {
      expect(() => nodeDefinitionFromService(service, { provider: 'plugin.cad-occt', runtimeId: 'cad-occt' }), service.id).not.toThrow();
    }
    expect(emitted.requires).toEqual(['geometry-base', 'documents']);
    expect(emitted.declarations.types).toEqual([]);
  });
});

describe.skipIf(!existsSync(brepjsRoot))('committed listing parity', () => {
  it('is exactly what the generator emits from the installed brepjs', () => {
    const { listing: regenerated } = generateListing(brepjsRoot, { output: null });
    expect(listing).toEqual(regenerated);
    expect(readFileSync(join(pluginRoot, 'listing.json'), 'utf8')).toBe(JSON.stringify(regenerated, null, 2) + '\n');
  });
});
