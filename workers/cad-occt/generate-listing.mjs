// Compile the curated cad-occt node catalog from brepjs's published type
// declarations. Generated file; regenerate with
//   cd workers/cad-occt && npm install && node generate-listing.mjs
// The generator is the law: every curated operation is verified against
// the .d.ts signature it names (function existence, parameter presence,
// type-family agreement) before it enters the listing, and the emitted
// listing validates through the SDK's parseListing plus the shared
// service→definition derivation, so a catalog that cannot register
// refuses loudly.
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseListing } from '../../packages/plugin-sdk/src/listing.js';
import { nodeDefinitionFromService } from '../../packages/plugin-sdk/src/node-contract.js';

const pluginRoot = dirname(fileURLToPath(import.meta.url));

// ── brepjs .d.ts scanner ────────────────────────────────────────────────
// Reads the declaration files brepjs publishes (dist/**/*.d.ts) and
// extracts `export declare function` signatures and `export interface`
// members: balanced-paren parameter lists with optional markers, split on
// top-level commas.

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '');
}

function splitTopLevel(text, separator = ',') {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const character of text) {
    if (character === '(' || character === '{' || character === '[' || character === '<') depth += 1;
    if (character === ')' || character === '}' || character === ']' || character === '>') depth -= 1;
    if (character === separator && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function balancedSpan(source, startIndex, open, close) {
  let depth = 0;
  for (let index = startIndex; index < source.length; index += 1) {
    if (source[index] === open) depth += 1;
    if (source[index] === close) {
      depth -= 1;
      if (depth === 0) return source.slice(startIndex, index + 1);
    }
  }
  return null;
}

function parseParameters(parameterText) {
  return splitTopLevel(parameterText).map(parameter => {
    const match = /^([A-Za-z_$][\w$]*)(\?)?\s*:\s*([\s\S]+)$/.exec(parameter);
    if (!match) return null;
    return { name: match[1], optional: Boolean(match[2]), type: match[3].trim() };
  }).filter(Boolean);
}

export function parseDeclarationFile(source) {
  const code = stripComments(source);
  const functions = new Map();
  const interfaces = new Map();
  for (const match of code.matchAll(/export\s+declare\s+function\s+([A-Za-z_$][\w$]*)\s*(?:<(?:[^<>]|<[^<>]*>)*>)?\s*\(/g)) {
    const name = match[1];
    const open = match.index + match[0].length - 1;
    const parameterSpan = balancedSpan(code, open, '(', ')');
    if (!parameterSpan) continue;
    const after = code.slice(open + parameterSpan.length);
    const returnType = /^\s*:\s*([^;]+);/.exec(after);
    const signatures = functions.get(name) || [];
    signatures.push({ parameters: parseParameters(parameterSpan.slice(1, -1)), returns: returnType ? returnType[1].trim() : '' });
    functions.set(name, signatures);
  }
  for (const match of code.matchAll(/export\s+(?:declare\s+)?interface\s+([A-Za-z_$][\w$]*)\s*(?:extends\s+[{\w]+)?\s*\{/g)) {
    const name = match[1];
    const open = match.index + match[0].length - 1;
    const body = balancedSpan(code, open, '{', '}');
    if (!body) continue;
    const members = [];
    for (const member of splitTopLevel(body.slice(1, -1), ';')) {
    const memberMatch = /^(?:readonly\s+)?([A-Za-z_$][\w$]*)(\?)?\s*:\s*([\s\S]+)$/.exec(member);
      if (memberMatch) members.push({ name: memberMatch[1], optional: Boolean(memberMatch[2]), type: memberMatch[3].trim() });
    }
    interfaces.set(name, members);
  }
  return { functions, interfaces };
}

function declarationFiles(packageRoot) {
  const dist = resolve(packageRoot, 'dist');
  const files = [];
  const walk = directory => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (entry.endsWith('.d.ts')) files.push(path);
    }
  };
  walk(dist);
  return files;
}

export function readBrepjsDeclarations(packageRoot) {
  const functions = new Map();
  const interfaces = new Map();
  const byFile = new Map();
  for (const file of declarationFiles(packageRoot)) {
    const parsed = parseDeclarationFile(readFileSync(file, 'utf8'));
    byFile.set(file, parsed);
    for (const [name, signatures] of parsed.functions) {
      functions.set(name, [...(functions.get(name) || []), ...signatures.map(signature => ({ ...signature, file }))]);
    }
    // brepjs re-declares some option interfaces per subsystem (csg,
    // topology) with different member shapes; the curated table resolves
    // an options interface from the function's own file, so the per-file
    // view stays authoritative and the merged map is a fallback.
    for (const [name, members] of parsed.interfaces) {
      if (!interfaces.has(name)) interfaces.set(name, members);
    }
  }
  return { functions, interfaces, byFile };
}

function fileOf(packageRoot, relativeFile) {
  return resolve(packageRoot, 'dist', relativeFile);
}

function optionsInterfaceOf(declarations, brepjsRoot, source) {
  if (!source.optionsInterface) return null;
  const own = declarations.byFile.get(fileOf(brepjsRoot, source.file));
  return own?.interfaces.get(source.optionsInterface) || declarations.interfaces.get(source.optionsInterface) || null;
}

// ── curated operations ──────────────────────────────────────────────────
// The bounded op set (SPEC §20 owner decision 2026-11-20): primitives,
// transforms, booleans, one fillet, STEP exchange, tessellation. Each
// entry names the brepjs declaration it wraps; `types` maps every
// geometry-typed field onto its semantic kind family, constrained to
// where the mapping is exact: Vec3 positions are geometry.point3, Vec3
// directions are geometry.vector3, shape operands are the engine-native
// geometry.occt.shape, blobs are the documents file payload.
//
// brepjs's `rotate` takes degrees; the port carries geometry.angle
// (radians) and the runtime converts (RAD2DEG).

const POINT = { base: 'json', kind: 'geometry.point3', unit: 'mm' };
const VECTOR = { base: 'json', kind: 'geometry.vector3', unit: 'mm' };
const SHAPE = { base: 'json', kind: 'geometry.occt.shape' };
const FILE = { base: 'json', kind: 'documents.file' };
const ANGLE = { base: 'number', kind: 'geometry.angle' };
const ORIGIN = { x: 0, y: 0, z: 0 };
const Z_AXIS = { x: 0, y: 0, z: 1 };

export const OPERATIONS = [
  {
    id: 'make-box', label: 'Box', group: 'primitives',    description: 'Construct a box solid from width, depth, and height',
    source: { file: 'topology/primitiveFns.d.ts', function: 'box', parameters: ['width', 'depth', 'height', 'options'], optionsInterface: 'BoxOptions' },
    fields: {
      width: { field: { base: 'number', nullable: true, default: 10 }, dts: { name: 'width', type: 'number' } },
      depth: { field: { base: 'number', nullable: true, default: 10 }, dts: { name: 'depth', type: 'number' } },
      height: { field: { base: 'number', nullable: true, default: 10 }, dts: { name: 'height', type: 'number' } },
      at: { field: { ...POINT, nullable: true, default: ORIGIN }, dts: { options: 'at', type: 'Vec3' } },
      centered: { field: { base: 'boolean', nullable: true, default: false }, dts: { options: 'centered', type: 'boolean' } }
    },
    output: { descriptor: SHAPE, dts: 'ValidSolid' }
  },
  {
    id: 'make-cylinder', label: 'Cylinder', group: 'primitives',
    description: 'Construct a cylinder solid from radius and height along an axis',
    source: { file: 'topology/primitiveFns.d.ts', function: 'cylinder', parameters: ['radius', 'height', 'options'], optionsInterface: 'CylinderOptions' },
    fields: {
      radius: { field: { base: 'number', nullable: true, default: 5 }, dts: { name: 'radius', type: 'number' } },
      height: { field: { base: 'number', nullable: true, default: 10 }, dts: { name: 'height', type: 'number' } },
      at: { field: { ...POINT, nullable: true, default: ORIGIN }, dts: { options: 'at', type: 'Vec3' } },
      axis: { field: { ...VECTOR, nullable: true, default: Z_AXIS }, dts: { options: 'axis', type: 'Vec3' } },
      centered: { field: { base: 'boolean', nullable: true, default: false }, dts: { options: 'centered', type: 'boolean' } }
    },
    output: { descriptor: SHAPE, dts: 'ValidSolid' }
  },
  {
    id: 'make-sphere', label: 'Sphere', group: 'primitives',
    description: 'Construct a sphere solid from a radius',
    source: { file: 'topology/primitiveFns.d.ts', function: 'sphere', parameters: ['radius', 'options'], optionsInterface: 'SphereOptions' },
    fields: {
      radius: { field: { base: 'number', nullable: true, default: 5 }, dts: { name: 'radius', type: 'number' } },
      at: { field: { ...POINT, nullable: true, default: ORIGIN }, dts: { options: 'at', type: 'Vec3' } }
    },
    output: { descriptor: SHAPE, dts: 'ValidSolid' }
  },
  {
    id: 'make-cone', label: 'Cone', group: 'primitives',
    description: 'Construct a cone or frustum solid from base and top radii and height',
    source: { file: 'topology/primitiveFns.d.ts', function: 'cone', parameters: ['bottomRadius', 'topRadius', 'height', 'options'], optionsInterface: 'ConeOptions' },
    fields: {
      bottomRadius: { field: { base: 'number', nullable: true, default: 5 }, dts: { name: 'bottomRadius', type: 'number' } },
      topRadius: { field: { base: 'number', nullable: true, default: 0 }, dts: { name: 'topRadius', type: 'number' } },
      height: { field: { base: 'number', nullable: true, default: 10 }, dts: { name: 'height', type: 'number' } },
      at: { field: { ...POINT, nullable: true, default: ORIGIN }, dts: { options: 'at', type: 'Vec3' } },
      axis: { field: { ...VECTOR, nullable: true, default: Z_AXIS }, dts: { options: 'axis', type: 'Vec3' } }
    },
    output: { descriptor: SHAPE, dts: 'ValidSolid' }
  },
  {
    id: 'translate-shape', label: 'Translate solid', group: 'transforms',
    description: 'Move a shape by a displacement vector',
    source: { file: 'topology/api.d.ts', function: 'translate', parameters: ['shape', 'v'] },
    fields: {
      shape: { field: SHAPE, dts: { name: 'shape', type: 'Shapeable' } },
      offset: { field: VECTOR, dts: { name: 'v', type: 'Vec3' } }
    },
    output: { descriptor: SHAPE, dts: 'T' }
  },
  {
    id: 'rotate-shape', label: 'Rotate solid', group: 'transforms',
    description: 'Rotate a shape by an angle in radians around an axis through a point',
    source: { file: 'topology/api.d.ts', function: 'rotate', parameters: ['shape', 'angle', 'options'], optionsInterface: 'RotateOptions' },
    fields: {
      shape: { field: SHAPE, dts: { name: 'shape', type: 'Shapeable' } },
      angle: { field: { ...ANGLE, nullable: true, default: 0 }, dts: { name: 'angle', type: 'number' } },
      axis: { field: { ...VECTOR, nullable: true, default: Z_AXIS }, dts: { options: 'axis', type: 'Vec3' } },
      at: { field: { ...POINT, nullable: true, default: ORIGIN }, dts: { options: 'at', type: 'Vec3' } }
    },
    output: { descriptor: SHAPE, dts: 'T' }
  },
  {
    id: 'fuse-shapes', label: 'Union', group: 'booleans',
    description: 'Boolean union of two shapes',
    source: { file: 'topology/api.d.ts', function: 'fuse', parameters: ['a', 'b'] },
    fields: {
      a: { field: SHAPE, dts: { name: 'a', type: 'Shapeable' } },
      b: { field: SHAPE, dts: { name: 'b', type: 'Shapeable' } }
    },
    output: { descriptor: SHAPE, dts: 'Result' }
  },
  {
    id: 'cut-shapes', label: 'Cut', group: 'booleans',
    description: 'Boolean subtraction of a tool shape from a base shape',
    source: { file: 'topology/api.d.ts', function: 'cut', parameters: ['base', 'tool'] },
    fields: {
      base: { field: SHAPE, dts: { name: 'base', type: 'Shapeable' } },
      tool: { field: SHAPE, dts: { name: 'tool', type: 'Shapeable' } }
    },
    output: { descriptor: SHAPE, dts: 'Result' }
  },
  {
    id: 'intersect-shapes', label: 'Intersect', group: 'booleans',
    description: 'Boolean intersection of two shapes',
    source: { file: 'topology/api.d.ts', function: 'intersect', parameters: ['a', 'b'] },
    fields: {
      a: { field: SHAPE, dts: { name: 'a', type: 'Shapeable' } },
      b: { field: SHAPE, dts: { name: 'b', type: 'Shapeable' } }
    },
    output: { descriptor: SHAPE, dts: 'Result' }
  },
  {
    id: 'fillet-all-edges', label: 'Fillet all edges', group: 'modifiers',
    description: 'Round every edge of a solid with one constant radius',
    source: { file: 'topology/api.d.ts', function: 'fillet', parameters: ['shape', 'radius'] },
    fields: {
      shape: { field: SHAPE, dts: { name: 'shape', type: 'Shapeable' } },
      radius: { field: { base: 'number', nullable: true, default: 1 }, dts: { name: 'radius', type: 'FilletRadius' } }
    },
    output: { descriptor: SHAPE, dts: 'Result' }
  },
  {
    id: 'import-step', label: 'Import STEP', group: 'exchange',
    description: 'Read a STEP file payload into a shape',
    source: { file: 'io/importFns.d.ts', function: 'importSTEP', parameters: ['blob'] },
    fields: {
      file: { field: FILE, dts: { name: 'blob', type: 'Blob' } }
    },
    output: { descriptor: SHAPE, dts: 'Promise' }
  },
  {
    id: 'export-step', label: 'Export STEP', group: 'exchange',
    description: 'Write a shape as a STEP file payload',
    source: { file: 'topology/meshFns.d.ts', function: 'exportSTEP', parameters: ['shape'] },
    fields: {
      shape: { field: SHAPE, dts: { name: 'shape', type: 'AnyShape' } },
      name: { field: { base: 'string', nullable: true, default: 'part.step' }, dts: null }
    },
    output: { descriptor: FILE, dts: 'Result' }
  },
  {
    id: 'tessellate-shape', label: 'Tessellate', group: 'mesh',
    description: 'Approximate a shape as a triangle mesh for rendering; the exact boundary is lost',
    source: { file: 'topology/meshFns.d.ts', function: 'mesh', parameters: ['shape', 'opts'], optionsInterface: 'MeshOptions' },
    fields: {
      shape: { field: SHAPE, dts: { name: 'shape', type: 'AnyShape' } },
      tolerance: { field: { base: 'number', nullable: true }, dts: { options: 'tolerance', type: 'number' } },
      angularTolerance: { field: { ...ANGLE, nullable: true }, dts: { options: 'angularTolerance', type: 'number' } }
    },
    output: { descriptor: { base: 'json', representation: 'perigram.scene-3d' }, dts: 'ShapeMesh' }
  }
];

const TYPE_FAMILIES = {
  'geometry.point3': ['Vec3'],
  'geometry.vector3': ['Vec3'],
  'geometry.occt.shape': ['Shapeable', 'AnyShape', 'ValidSolid'],
  'documents.file': ['Blob'],
  'geometry.angle': ['number', 'FilletRadius'],
  number: ['number', 'FilletRadius'],
  boolean: ['boolean'],
  string: ['string']
};

function fieldKind(entry) {
  return entry.field.kind || null;
}

export function verifyAgainstDeclarations(operations, declarations, brepjsRoot) {
  const problems = [];
  for (const operation of operations) {    const signatures = (declarations.functions.get(operation.source.function) || [])
      .filter(signature => signature.file.endsWith(operation.source.file));
    if (!signatures.length) {
      problems.push(`${operation.id}: brepjs ${operation.source.file} declares no function ${operation.source.function}`);
      continue;
    }
    const signature = signatures.find(candidate => operation.source.parameters.every((name, index) => candidate.parameters[index]?.name === name))
      || signatures[0];
    const named = operation.source.parameters.map((name, index) => signature.parameters[index]?.name === name);
    if (!named.every(Boolean)) {
      problems.push(`${operation.id}: ${operation.source.function} declares ${signature.parameters.map(p => p.name).join(', ')} — curated table names ${operation.source.parameters.join(', ')}`);
    }
    const options = optionsInterfaceOf(declarations, brepjsRoot, operation.source);
    if (operation.source.optionsInterface && !options) {
      problems.push(`${operation.id}: brepjs declares no interface ${operation.source.optionsInterface}`);
    }
    for (const [fieldId, entry] of Object.entries(operation.fields)) {
      if (!entry.dts) continue;
      const declared = entry.dts.name
        ? signature.parameters.find(parameter => parameter.name === entry.dts.name)
        : entry.dts.options
          ? (options || []).find(member => member.name === entry.dts.options)
          : null;
      if (!declared) {
        problems.push(`${operation.id}.${fieldId}: no brepjs parameter or option named ${entry.dts.name || entry.dts.options}`);
        continue;
      }
      const kind = fieldKind(entry);
      const families = kind ? TYPE_FAMILIES[kind] : TYPE_FAMILIES[entry.field.base];
      if (!families?.some(family => declared.type.startsWith(family))) {
        problems.push(`${operation.id}.${fieldId}: brepjs types it ${declared.type}; the curated ${kind || entry.field.base} mapping requires ${families?.join(' | ')}`);
      }
    }
    if (operation.output.dts && !signatures.some(candidate => candidate.returns.includes(operation.output.dts))) {
      problems.push(`${operation.id}: ${operation.source.function} returns ${signature.returns} — curated output expects ${operation.output.dts}`);
    }
  }
  return problems;
}

const GROUP_LABELS = {
  primitives: 'Solids',
  transforms: 'Transforms',
  booleans: 'Booleans',
  modifiers: 'Modifiers',
  exchange: 'Exchange',
  mesh: 'Mesh'
};

export function buildListing(operations = OPERATIONS) {
  const services = operations.map(operation => ({
    id: operation.id,
    label: operation.label,
    description: operation.description,
    signature: {
      input: {
        base: 'record',
        fields: Object.fromEntries(Object.entries(operation.fields).map(([fieldId, entry]) => [fieldId, entry.field]))
      },
      output: operation.output.descriptor
    },
    execution: {
      runtime: 'cad-occt',
      kind: 'pure',
      targets: ['browser', 'server'],
      capabilities: [],
      deterministic: true,
      idempotent: true
    },
    palette: { group: operation.group, label: GROUP_LABELS[operation.group] }
  }));
  return {
    pluginId: 'cad-occt',
    name: 'CAD (OCCT)',
    description: 'Exact B-rep solid modeling over brepjs/occt-wasm: primitives, transforms, booleans, fillet, STEP exchange, and tessellation to mesh',
    version: '1',
    requires: ['geometry-base', 'documents'],
    declarations: {
      types: [],
      runtimes: [
        {
          id: 'cad-occt',
          language: 'javascript',
          version: '1',
          entry: '/runtime/cad-occt.mjs',
          targets: ['browser', 'server']
        }
      ],
      // Vendored runtime dependencies (workers/cad-occt/README.md owns the
      // build): brepjs is Apache-2.0; occt-wasm declares `MIT OR
      // Apache-2.0` and the listing carries Apache-2.0 as its elected
      // spelling (the grammar takes one SPDX token). The SDK derivation
      // module vendors into the package graph by relative import (the
      // documents shared-bundle pattern), so it needs no bare-name
      // declaration.
      dependencies: [
        { name: 'brepjs', version: '20.28.3', module: '/assets/vendor/brepjs.mjs', license: 'Apache-2.0' },
        { name: 'occt-wasm', version: '5.17.2', module: '/assets/vendor/occt-wasm.mjs', license: 'Apache-2.0' }
      ],
      services
    }
  };
}

export function generateListing(brepjsRoot, { output = resolve(pluginRoot, 'listing.json') } = {}) {
  const declarations = readBrepjsDeclarations(brepjsRoot);
  const problems = verifyAgainstDeclarations(OPERATIONS, declarations, brepjsRoot);
  if (problems.length) {
    throw new Error(`Curated cad-occt operations disagree with the brepjs declarations:\n  - ${problems.join('\n  - ')}`);
  }
  const listing = buildListing();
  parseListing(listing, 'workers/cad-occt');
  for (const service of listing.declarations.services) {
    nodeDefinitionFromService(service, { provider: 'plugin.cad-occt', runtimeId: 'cad-occt' });
  }
  if (output) {
    writeFileSync(output, JSON.stringify(listing, null, 2) + '\n');
  }
  const groups = new Set(OPERATIONS.map(operation => operation.group));
  return { listing, operations: OPERATIONS.length, groups: [...groups].sort() };
}

const defaultBrepjsRoot = resolve(pluginRoot, 'node_modules/brepjs');
const brepjsRoot = process.argv[2] ? resolve(process.argv[2]) : defaultBrepjsRoot;
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!existsSync(brepjsRoot)) {
    console.error(`brepjs package not found at ${brepjsRoot} — install it (npm install inside workers/cad-occt) or pass its path as an argument`);
    process.exit(1);
  }
  const result = generateListing(brepjsRoot);
  console.log(`listing: ${result.operations} services from brepjs type declarations across ${result.groups.length} palette sections (${result.groups.join(', ')})`);
}
