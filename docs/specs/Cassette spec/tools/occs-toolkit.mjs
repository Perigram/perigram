#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SVG_NS = 'http://www.w3.org/2000/svg';

function usage() {
  return [
    'Usage:',
    '  node tools/occs-toolkit.mjs svg <input.occs.json> <output.svg>',
    '  node tools/occs-toolkit.mjs validate <input.occs.json> [...]',
    '  node tools/occs-toolkit.mjs random [--seed <integer>] [--out-dir <dir>]',
    '  node tools/occs-toolkit.mjs complex [--seed <integer>] [--out-dir <dir>]',
    '',
    'The random command writes:',
    '  random-cassette-template.occs.json',
    '  random-cassette-design.occs.json',
    '  random-cassette.svg',
    '',
    'The complex command writes:',
    '  complex-cassette-template.occs.json',
    '  complex-cassette-design.occs.json',
    '  complex-cassette.svg'
  ].join('\n');
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  const positional = [];

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }

    const key = arg.slice(2);
    const value = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true;
    options[key] = value;
  }

  return { command, positional, options };
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function readJson(filePath) {
  return fs.readFile(filePath, 'utf8').then((text) => JSON.parse(text));
}

function writeJson(filePath, data) {
  return fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function tokenizeExpression(input) {
  const text = String(input).trim();
  const tokens = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      let end = i + 1;
      while (end < text.length && /[0-9.]/.test(text[end])) end += 1;
      const raw = text.slice(i, end);
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error(`Invalid number in expression: ${raw}`);
      tokens.push({ type: 'number', value });
      i = end;
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      let end = i + 1;
      while (end < text.length && /[A-Za-z0-9_]/.test(text[end])) end += 1;
      tokens.push({ type: 'identifier', value: text.slice(i, end) });
      i = end;
      continue;
    }

    if ('+-*/()'.includes(ch)) {
      tokens.push({ type: ch, value: ch });
      i += 1;
      continue;
    }

    throw new Error(`Unsupported expression token "${ch}" in "${text}"`);
  }

  return tokens;
}

function createExpressionParser(tokens, resolveIdentifier) {
  let pos = 0;

  function peek() {
    return tokens[pos];
  }

  function consume(type) {
    const token = tokens[pos];
    if (!token || token.type !== type) {
      throw new Error(`Expected ${type}, got ${token?.type || 'end of expression'}`);
    }
    pos += 1;
    return token;
  }

  function factor() {
    const token = peek();
    if (!token) throw new Error('Unexpected end of expression');

    if (token.type === 'number') {
      pos += 1;
      return token.value;
    }

    if (token.type === 'identifier') {
      pos += 1;
      return resolveIdentifier(token.value);
    }

    if (token.type === '-') {
      consume('-');
      return -factor();
    }

    if (token.type === '(') {
      consume('(');
      const value = expression();
      consume(')');
      return value;
    }

    throw new Error(`Unexpected expression token: ${token.type}`);
  }

  function term() {
    let value = factor();
    while (peek()?.type === '*' || peek()?.type === '/') {
      const op = consume(peek().type).type;
      const right = factor();
      value = op === '*' ? value * right : value / right;
    }
    return value;
  }

  function expression() {
    let value = term();
    while (peek()?.type === '+' || peek()?.type === '-') {
      const op = consume(peek().type).type;
      const right = term();
      value = op === '+' ? value + right : value - right;
    }
    return value;
  }

  const value = expression();
  if (pos !== tokens.length) throw new Error(`Unexpected token: ${tokens[pos].type}`);
  return value;
}

function resolveParameters(parameters = {}) {
  const resolved = {};
  const resolving = new Set();

  function resolveKey(key) {
    if (Object.hasOwn(resolved, key)) return resolved[key];
    if (!Object.hasOwn(parameters, key)) throw new Error(`Unknown parameter: ${key}`);
    if (resolving.has(key)) throw new Error(`Parameter cycle detected at ${key}`);

    resolving.add(key);
    const value = evalScalar(parameters[key], resolveKey);
    resolving.delete(key);
    resolved[key] = value;
    return value;
  }

  for (const key of Object.keys(parameters)) resolveKey(key);
  return resolved;
}

function evalScalar(value, resolveIdentifier) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') throw new Error(`Expected scalar, got ${typeof value}`);

  const text = value.trim();
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);

  const tokens = tokenizeExpression(text);
  return createExpressionParser(tokens, resolveIdentifier);
}

function evalDimension(value, params, fallback = 0) {
  if (value === undefined || value === null) return fallback;
  return evalScalar(value, (name) => {
    if (!Object.hasOwn(params, name)) throw new Error(`Unknown parameter: ${name}`);
    return params[name];
  });
}

function evalVec2(value, params) {
  if (!Array.isArray(value) || value.length !== 2) throw new Error('Expected vec2');
  return [evalDimension(value[0], params), evalDimension(value[1], params)];
}

function evalAngle(value, params) {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return value;
  const text = String(value).trim();
  if (text.endsWith('deg')) return evalDimension(text.slice(0, -3), params);
  return evalDimension(text, params);
}

function parseRef(ref) {
  const match = String(ref).match(/^([A-Za-z_][A-Za-z0-9_.:-]*)\.E(\d+)$/);
  if (!match) throw new Error(`Invalid edge reference: ${ref}`);
  return { faceId: match[1], edgeIndex: Number(match[2]) };
}

function rightNormal([x, y]) {
  return [y, -x];
}

function leftNormal([x, y]) {
  return [-y, x];
}

function length([x, y]) {
  return Math.hypot(x, y);
}

function normalize([x, y]) {
  const len = length([x, y]);
  if (len === 0) throw new Error('Cannot normalize zero-length vector');
  return [x / len, y / len];
}

function transformPoint(t, [x, y]) {
  return [
    t.a * x + t.c * y + t.e,
    t.b * x + t.d * y + t.f
  ];
}

function composeTransform(first, second) {
  return {
    a: first.a * second.a + first.c * second.b,
    b: first.b * second.a + first.d * second.b,
    c: first.a * second.c + first.c * second.d,
    d: first.b * second.c + first.d * second.d,
    e: first.a * second.e + first.c * second.f + first.e,
    f: first.b * second.e + first.d * second.f + first.f
  };
}

function identityTransform() {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

function edgeToEdgeTransform(targetShape, targetEdgeIndex, seamStart, parentUnit, parentNormal) {
  const [targetStart, targetEnd] = edgeOf(targetShape.points, targetEdgeIndex);
  const targetVector = [targetEnd[0] - targetStart[0], targetEnd[1] - targetStart[1]];
  const targetUnit = normalize(targetVector);
  const targetInside = leftNormal(targetUnit);

  const a = parentUnit[0] * targetUnit[0] + parentNormal[0] * targetInside[0];
  const b = parentUnit[1] * targetUnit[0] + parentNormal[1] * targetInside[0];
  const c = parentUnit[0] * targetUnit[1] + parentNormal[0] * targetInside[1];
  const d = parentUnit[1] * targetUnit[1] + parentNormal[1] * targetInside[1];

  return {
    a,
    b,
    c,
    d,
    e: seamStart[0] - a * targetStart[0] - c * targetStart[1],
    f: seamStart[1] - b * targetStart[0] - d * targetStart[1]
  };
}

function makePlacementTransform(placement = {}, params = {}) {
  const origin = placement.origin ? evalVec2(placement.origin, params) : [0, 0];
  const angle = evalAngle(placement.rotation, params) * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { a: cos, b: sin, c: -sin, d: cos, e: origin[0], f: origin[1] };
}

function resolveShape(face, params, inheritedLength = null) {
  const shape = face.shape;
  if (!shape) throw new Error(`Face ${face.id} has no shape`);

  if (shape.type === 'trapezoid') {
    const baseStartOffset = evalDimension(shape.baseStartOffset, params, 0);
    const baseEndOffset = evalDimension(shape.baseEndOffset, params, 0);
    const referenceLength = shape.baseLength === 'inherit'
      ? inheritedLength
      : evalDimension(shape.baseLength, params);
    if (!Number.isFinite(referenceLength)) {
      throw new Error(`Face ${face.id} cannot resolve inherited base length`);
    }

    const localLength = referenceLength - baseStartOffset - baseEndOffset;
    const height = shape.height === undefined ? undefined : evalDimension(shape.height, params);
    const p2Height = shape.p2Height === undefined ? height : evalDimension(shape.p2Height, params);
    const p3Height = shape.p3Height === undefined ? height : evalDimension(shape.p3Height, params);
    if (!Number.isFinite(p2Height) || !Number.isFinite(p3Height)) {
      throw new Error(`Face ${face.id} needs height or p2Height/p3Height`);
    }

    const topStartOffset = evalDimension(shape.topStartOffset, params, 0);
    const topEndOffset = evalDimension(shape.topEndOffset, params, 0);

    return {
      type: 'trapezoid',
      baseStartOffset,
      baseEndOffset,
      points: [
        [0, 0],
        [localLength, 0],
        [localLength - topEndOffset, p2Height],
        [topStartOffset, p3Height]
      ]
    };
  }

  if (shape.type === 'polygon') {
    return {
      type: 'polygon',
      points: shape.vertices.map((point) => evalVec2(point, params)),
      edges: shape.edges || null
    };
  }

  throw new Error(`Unsupported face shape: ${shape.type}`);
}

function edgeOf(points, index) {
  if (!Number.isInteger(index) || index < 0 || index >= points.length) {
    throw new Error(`Edge index out of range: E${index}`);
  }
  return [points[index], points[(index + 1) % points.length]];
}

function resolveSheet(workpiece, params) {
  const faceDefs = new Map((workpiece.faces || []).map((face) => [face.id, face]));
  const placed = new Map();
  const incoming = new Set();
  for (const fold of workpiece.folds || []) incoming.add(parseRef(fold.to).faceId);

  const rootFace = (workpiece.faces || []).find((face) => face.role === 'main')
    || (workpiece.faces || []).find((face) => !incoming.has(face.id))
    || (workpiece.faces || [])[0];

  if (!rootFace) return { faces: [], folds: [] };

  placed.set(rootFace.id, {
    definition: rootFace,
    shape: resolveShape(rootFace, params),
    transform: identityTransform()
  });

  const pending = [...(workpiece.folds || [])];
  let progressed = true;

  while (pending.length && progressed) {
    progressed = false;
    for (let i = pending.length - 1; i >= 0; i -= 1) {
      const fold = pending[i];
      const from = parseRef(fold.from);
      const to = parseRef(fold.to);
      const parent = placed.get(from.faceId);
      if (!parent) continue;
      if (placed.has(to.faceId)) {
        pending.splice(i, 1);
        progressed = true;
        continue;
      }

      const targetFace = faceDefs.get(to.faceId);
      if (!targetFace) throw new Error(`Fold ${fold.id} references missing face ${to.faceId}`);

      const [edgeStartLocal, edgeEndLocal] = edgeOf(parent.shape.points, from.edgeIndex);
      const edgeStart = transformPoint(parent.transform, edgeStartLocal);
      const edgeEnd = transformPoint(parent.transform, edgeEndLocal);
      const edgeVector = [edgeEnd[0] - edgeStart[0], edgeEnd[1] - edgeStart[1]];
      const edgeLength = length(edgeVector);
      const unit = normalize(edgeVector);
      const normal = rightNormal(unit);
      const targetShape = resolveShape(targetFace, params, edgeLength);
      const [targetEdgeStart, targetEdgeEnd] = edgeOf(targetShape.points, to.edgeIndex);
      const targetEdgeLength = length([
        targetEdgeEnd[0] - targetEdgeStart[0],
        targetEdgeEnd[1] - targetEdgeStart[1]
      ]);
      const trimStartDistance = to.edgeIndex === 0 ? targetShape.baseStartOffset : 0;
      const trimEndDistance = to.edgeIndex === 0 ? targetShape.baseEndOffset : 0;
      const seamLength = edgeLength - trimStartDistance - trimEndDistance;
      if (Math.abs(targetEdgeLength - seamLength) > 0.001) {
        throw new Error(`Fold ${fold.id} target edge length ${formatNumber(targetEdgeLength)} does not match source seam length ${formatNumber(seamLength)}`);
      }
      const seamStart = [
        edgeStart[0] + unit[0] * trimStartDistance,
        edgeStart[1] + unit[1] * trimStartDistance
      ];

      placed.set(to.faceId, {
        definition: targetFace,
        shape: targetShape,
        transform: edgeToEdgeTransform(targetShape, to.edgeIndex, seamStart, unit, normal)
      });

      pending.splice(i, 1);
      progressed = true;
    }
  }

  if (pending.length) {
    throw new Error(`Could not place all folds in workpiece ${workpiece.id}`);
  }

  const faces = [...placed.entries()].map(([id, placedFace]) => ({
    id,
    role: placedFace.definition.role,
    points: placedFace.shape.points.map((point) => transformPoint(placedFace.transform, point)),
    shape: placedFace.shape,
    transform: placedFace.transform
  }));

  const folds = (workpiece.folds || []).map((fold) => {
    const to = parseRef(fold.to);
    const target = placed.get(to.faceId);
    if (!target) throw new Error(`Fold ${fold.id} references unplaced target face ${to.faceId}`);
    const [startLocal, endLocal] = edgeOf(target.shape.points, to.edgeIndex);
    return {
      id: fold.id,
      layer: fold.layer || 'fold.route',
      points: [
        transformPoint(target.transform, startLocal),
        transformPoint(target.transform, endLocal)
      ]
    };
  });

  return { faces, folds, placedFaces: placed };
}

function addUnique(errors, seen, id, path, label) {
  if (!id) {
    errors.push(`${path}: missing ${label} id`);
    return;
  }
  if (seen.has(id)) errors.push(`${path}: duplicate ${label} id "${id}"`);
  seen.add(id);
}

function validateAngle(value, params, path, errors) {
  try {
    const angle = validateAngleRange(value, params, path, errors);
    if (angle === 0) {
      errors.push(`${path}: fold angle must not be 0`);
    }
  } catch (error) {
    errors.push(`${path}: ${error.message}`);
  }
}

function validateAngleRange(value, params, path, errors) {
  const angle = evalAngle(value, params);
  if (!Number.isFinite(angle)) {
    errors.push(`${path}: angle must resolve to a finite number`);
  } else if (angle < -180 || angle > 180) {
    errors.push(`${path}: angle ${formatNumber(angle)} is outside -180..180`);
  }
  return angle;
}

function validateExpr(value, params, path, errors, fallback = 0) {
  if (value === undefined || value === null) return;
  try {
    evalDimension(value, params, fallback);
  } catch (error) {
    errors.push(`${path}: ${error.message}`);
  }
}

function validateVec(value, params, path, errors) {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value)) {
    errors.push(`${path}: expected vector array`);
    return;
  }
  value.forEach((item, index) => validateExpr(item, params, `${path}[${index}]`, errors));
}

function validatePlacement(placement, params, path, errors) {
  if (!placement) return;
  validateVec(placement.origin, params, `${path}.origin`, errors);
  if (Array.isArray(placement.rotation)) {
    placement.rotation.forEach((item, index) => {
      try {
        validateAngleRange(item, params, `${path}.rotation[${index}]`, errors);
      } catch (error) {
        errors.push(`${path}.rotation[${index}]: ${error.message}`);
      }
    });
  } else if (placement.rotation !== undefined) {
    try {
      validateAngleRange(placement.rotation, params, `${path}.rotation`, errors);
    } catch (error) {
      errors.push(`${path}.rotation: ${error.message}`);
    }
  }
  validateExpr(placement.startOffset, params, `${path}.startOffset`, errors);
  validateExpr(placement.endOffset, params, `${path}.endOffset`, errors);
  validateExpr(placement.normalOffset, params, `${path}.normalOffset`, errors);
}

function validateGeometry(geometry, params, path, errors) {
  if (!geometry?.type) {
    errors.push(`${path}: missing geometry type`);
    return;
  }

  if (geometry.type === 'polygon') {
    if (!Array.isArray(geometry.vertices) || geometry.vertices.length < 3) {
      errors.push(`${path}.vertices: polygon needs at least 3 vertices`);
      return;
    }
    geometry.vertices.forEach((point, index) => validateVec(point, params, `${path}.vertices[${index}]`, errors));
    return;
  }

  if (geometry.type === 'circle') {
    validateExpr(geometry.diameter, params, `${path}.diameter`, errors);
    validateExpr(geometry.radius, params, `${path}.radius`, errors);
    validateVec(geometry.center, params, `${path}.center`, errors);
    if (geometry.diameter === undefined && geometry.radius === undefined) {
      errors.push(`${path}: circle needs diameter or radius`);
    }
    return;
  }

  if (geometry.type === 'path') {
    validateVec(geometry.start, params, `${path}.start`, errors);
    for (const [index, segment] of (geometry.segments || []).entries()) {
      validateVec(segment.to, params, `${path}.segments[${index}].to`, errors);
      validateVec(segment.c1, params, `${path}.segments[${index}].c1`, errors);
      validateVec(segment.c2, params, `${path}.segments[${index}].c2`, errors);
      validateVec(segment.control, params, `${path}.segments[${index}].control`, errors);
      validateExpr(segment.radius, params, `${path}.segments[${index}].radius`, errors);
    }
    return;
  }

  if (geometry.type === 'text') {
    validateExpr(geometry.height, params, `${path}.height`, errors, 12);
    return;
  }

  if (geometry.type === 'dimension') {
    validateVec(geometry.from, params, `${path}.from`, errors);
    validateVec(geometry.to, params, `${path}.to`, errors);
    validateExpr(geometry.offset, params, `${path}.offset`, errors);
    return;
  }
}

function validateReferenceObject(ref, occurrenceIds, definitionIds, path, errors) {
  if (!ref || typeof ref !== 'object') {
    errors.push(`${path}: expected reference object`);
    return;
  }

  if (ref.occurrence && !occurrenceIds.has(ref.occurrence)) {
    errors.push(`${path}.occurrence: unknown occurrence "${ref.occurrence}"`);
  }
  if (ref.ref && !definitionIds.has(ref.ref)) {
    errors.push(`${path}.ref: unknown definition "${ref.ref}"`);
  }
}

function validateDocument(document, layerRegistry = {}) {
  const errors = [];
  const required = ['occs', 'documentType', 'id', 'units', 'definitions', 'cassette'];
  for (const key of required) {
    if (document[key] === undefined || document[key] === null) errors.push(`<root>: missing required field "${key}"`);
  }
  if (document.documentType && !['template', 'design'].includes(document.documentType)) {
    errors.push('documentType: must be "template" or "design"');
  }

  let params = {};
  try {
    params = resolveParameters(document.parameters || {});
  } catch (error) {
    errors.push(`parameters: ${error.message}`);
  }

  const layerIds = new Set([
    ...Object.keys(document.layers || {}),
    ...((layerRegistry.layers || []).map((layer) => layer.id).filter(Boolean))
  ]);
  const workpieces = document.definitions?.workpieces || [];
  const libraryParts = document.definitions?.libraryParts || [];
  const definitionIds = new Set();

  for (const [index, workpiece] of workpieces.entries()) {
    addUnique(errors, definitionIds, workpiece.id, `definitions.workpieces[${index}]`, 'workpiece');
  }
  for (const [index, part] of libraryParts.entries()) {
    addUnique(errors, definitionIds, part.id, `definitions.libraryParts[${index}]`, 'library part');
  }

  const occurrenceIds = new Set();
  for (const [index, occurrence] of (document.cassette?.occurrences || []).entries()) {
    addUnique(errors, occurrenceIds, occurrence.id, `cassette.occurrences[${index}]`, 'occurrence');
    if (occurrence.ref && !definitionIds.has(occurrence.ref)) {
      errors.push(`cassette.occurrences[${index}].ref: unknown definition "${occurrence.ref}"`);
    }
    validatePlacement(occurrence.placement, params, `cassette.occurrences[${index}].placement`, errors);
  }

  for (const [workpieceIndex, workpiece] of workpieces.entries()) {
    if (workpiece.type !== 'sheet') continue;
    const workpiecePath = `definitions.workpieces[${workpieceIndex}]`;
    const faceIds = new Set();
    for (const [faceIndex, face] of (workpiece.faces || []).entries()) {
      addUnique(errors, faceIds, face.id, `${workpiecePath}.faces[${faceIndex}]`, 'face');
    }

    for (const [foldIndex, fold] of (workpiece.folds || []).entries()) {
      const foldPath = `${workpiecePath}.folds[${foldIndex}]`;
      try {
        const from = parseRef(fold.from);
        const to = parseRef(fold.to);
        if (!faceIds.has(from.faceId)) errors.push(`${foldPath}.from: unknown face "${from.faceId}"`);
        if (!faceIds.has(to.faceId)) errors.push(`${foldPath}.to: unknown face "${to.faceId}"`);
      } catch (error) {
        errors.push(`${foldPath}: ${error.message}`);
      }
      validateAngle(fold.angle, params, `${foldPath}.angle`, errors);
    }

    try {
      resolveSheet(workpiece, params);
    } catch (error) {
      errors.push(`${workpiecePath}: ${error.message}`);
    }

    for (const [entityIndex, entity] of (workpiece.entities || []).entries()) {
      const entityPath = `${workpiecePath}.entities[${entityIndex}]`;
      if (!entity.id) errors.push(`${entityPath}: missing entity id`);
      if (!entity.layer) errors.push(`${entityPath}.layer: missing layer`);
      if (entity.layer && !layerIds.has(entity.layer)) {
        errors.push(`${entityPath}.layer: unknown layer "${entity.layer}"`);
      }
      if (entity.target && !faceIds.has(entity.target) && entity.target !== workpiece.id) {
        errors.push(`${entityPath}.target: unknown target "${entity.target}"`);
      }
      validatePlacement(entity.placement, params, `${entityPath}.placement`, errors);
      validateGeometry(entity.geometry, params, `${entityPath}.geometry`, errors);
      validateExpr(entity.toolOffset?.value, params, `${entityPath}.toolOffset.value`, errors);
    }
  }

  for (const [index, joint] of (document.cassette?.joints || []).entries()) {
    const jointPath = `cassette.joints[${index}]`;
    validateReferenceObject(joint.source, occurrenceIds, definitionIds, `${jointPath}.source`, errors);
    validateReferenceObject(joint.target, occurrenceIds, definitionIds, `${jointPath}.target`, errors);
    validatePlacement(joint.placement, params, `${jointPath}.placement`, errors);
  }

  return errors;
}

function layerClass(layer) {
  return `occs-${String(layer).replace(/[^A-Za-z0-9_-]+/g, '-')}`;
}

function layerStyle(layer) {
  if (layer.startsWith('cut.')) return 'fill:none;stroke:#dc2626;stroke-width:1.8';
  if (layer.startsWith('fold.')) return 'fill:none;stroke:#2563eb;stroke-width:1.2;stroke-dasharray:8 4';
  if (layer.startsWith('code.')) return 'fill:none;stroke:#059669;stroke-width:1.2';
  if (layer.startsWith('dimension.')) return 'fill:none;stroke:#7c3aed;stroke-width:1';
  if (layer === 'contour.profile') return 'fill:#fef3c7;stroke:#a16207;stroke-width:1.2';
  return 'fill:none;stroke:#334155;stroke-width:1';
}

function svgPoint(point) {
  return [point[0], -point[1]];
}

function pathFromPoints(points) {
  const svgPoints = points.map(svgPoint);
  return svgPoints
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${formatNumber(x)} ${formatNumber(y)}`)
    .join(' ') + ' Z';
}

function pathFromLocalPolygon(shape, transform, params) {
  const points = shape.points.map((point) => transformPoint(transform, point));
  if (!shape.edges) return pathFromPoints(points);

  const first = svgPoint(points[0]);
  const commands = [`M ${formatNumber(first[0])} ${formatNumber(first[1])}`];
  for (let i = 0; i < shape.points.length; i += 1) {
    const edge = shape.edges[i] || { type: 'line' };
    const next = svgPoint(points[(i + 1) % points.length]);
    if (edge.type === 'cubicBezier') {
      const c1 = svgPoint(transformPoint(transform, evalVec2(edge.c1, params)));
      const c2 = svgPoint(transformPoint(transform, evalVec2(edge.c2, params)));
      commands.push(`C ${formatNumber(c1[0])} ${formatNumber(c1[1])} ${formatNumber(c2[0])} ${formatNumber(c2[1])} ${formatNumber(next[0])} ${formatNumber(next[1])}`);
    } else if (edge.type === 'quadraticBezier') {
      const control = svgPoint(transformPoint(transform, evalVec2(edge.control, params)));
      commands.push(`Q ${formatNumber(control[0])} ${formatNumber(control[1])} ${formatNumber(next[0])} ${formatNumber(next[1])}`);
    } else if (edge.type === 'arc') {
      const radius = evalDimension(edge.radius, params, 0);
      const sweep = edge.sweep === 'cw' ? 1 : 0;
      const largeArc = edge.largeArc ? 1 : 0;
      commands.push(`A ${formatNumber(radius)} ${formatNumber(radius)} 0 ${largeArc} ${sweep} ${formatNumber(next[0])} ${formatNumber(next[1])}`);
    } else {
      commands.push(`L ${formatNumber(next[0])} ${formatNumber(next[1])}`);
    }
  }
  commands.push('Z');
  return commands.join(' ');
}

function entityAttributes(entity, params) {
  const attrs = [
    `data-occs-id="${escapeXml(entity.id)}"`,
    `data-layer="${escapeXml(entity.layer)}"`,
    `data-target="${escapeXml(entity.target)}"`,
    `class="${escapeXml(layerClass(entity.layer))}"`
  ];
  if (entity.toolOffset?.mode) {
    attrs.push(`data-tool-offset-mode="${escapeXml(entity.toolOffset.mode)}"`);
    if (entity.toolOffset.value !== undefined) {
      const resolved = evalDimension(entity.toolOffset.value, params);
      attrs.push(`data-tool-offset-value="${escapeXml(formatNumber(resolved))}"`);
    }
  }
  return attrs.join(' ');
}

function renderEntity(entity, facePlacement, params, bounds) {
  const layer = entity.layer || 'unknown';
  const geometry = entity.geometry;
  const placement = makePlacementTransform(entity.placement || {}, params);
  const transform = composeTransform(facePlacement.transform, placement);
  const style = layerStyle(layer);
  const attrs = entityAttributes(entity, params);
  const elements = [];

  if (geometry.type === 'circle') {
    const centerLocal = geometry.center ? evalVec2(geometry.center, params) : [0, 0];
    const center = svgPoint(transformPoint(transform, centerLocal));
    const radius = geometry.radius !== undefined
      ? evalDimension(geometry.radius, params)
      : evalDimension(geometry.diameter, params) / 2;
    bounds.push(center);
    elements.push(`<circle ${attrs} cx="${formatNumber(center[0])}" cy="${formatNumber(center[1])}" r="${formatNumber(radius)}" style="${style}" />`);
    return elements;
  }

  if (geometry.type === 'polygon') {
    const shape = {
      points: geometry.vertices.map((point) => evalVec2(point, params)),
      edges: geometry.edges || null
    };
    const points = shape.points.map((point) => svgPoint(transformPoint(transform, point)));
    bounds.push(...points);
    const d = pathFromLocalPolygon(shape, transform, params);
    elements.push(`<path ${attrs} d="${escapeXml(d)}" style="${style}" />`);
    return elements;
  }

  if (geometry.type === 'path') {
    const start = svgPoint(transformPoint(transform, evalVec2(geometry.start, params)));
    const commands = [`M ${formatNumber(start[0])} ${formatNumber(start[1])}`];
    bounds.push(start);
    for (const segment of geometry.segments || []) {
      const to = svgPoint(transformPoint(transform, evalVec2(segment.to, params)));
      bounds.push(to);
      if (segment.type === 'cubicBezier') {
        const c1 = svgPoint(transformPoint(transform, evalVec2(segment.c1, params)));
        const c2 = svgPoint(transformPoint(transform, evalVec2(segment.c2, params)));
        bounds.push(c1, c2);
        commands.push(`C ${formatNumber(c1[0])} ${formatNumber(c1[1])} ${formatNumber(c2[0])} ${formatNumber(c2[1])} ${formatNumber(to[0])} ${formatNumber(to[1])}`);
      } else if (segment.type === 'quadraticBezier') {
        const control = svgPoint(transformPoint(transform, evalVec2(segment.control, params)));
        bounds.push(control);
        commands.push(`Q ${formatNumber(control[0])} ${formatNumber(control[1])} ${formatNumber(to[0])} ${formatNumber(to[1])}`);
      } else {
        commands.push(`L ${formatNumber(to[0])} ${formatNumber(to[1])}`);
      }
    }
    if (geometry.closed) commands.push('Z');
    elements.push(`<path ${attrs} d="${escapeXml(commands.join(' '))}" style="${style}" />`);
    return elements;
  }

  if (geometry.type === 'text') {
    const point = svgPoint(transformPoint(transform, [0, 0]));
    const height = evalDimension(geometry.height, params, 12);
    bounds.push(point);
    elements.push(`<text ${attrs} x="${formatNumber(point[0])}" y="${formatNumber(point[1])}" font-size="${formatNumber(height)}" fill="#059669">${escapeXml(geometry.text)}</text>`);
    return elements;
  }

  if (geometry.type === 'dimension') {
    const from = svgPoint(transformPoint(transform, evalVec2(geometry.from, params)));
    const to = svgPoint(transformPoint(transform, evalVec2(geometry.to, params)));
    bounds.push(from, to);
    elements.push(`<path ${attrs} d="M ${formatNumber(from[0])} ${formatNumber(from[1])} L ${formatNumber(to[0])} ${formatNumber(to[1])}" style="${style}" />`);
    return elements;
  }

  return [`<!-- Unsupported entity geometry: ${escapeXml(geometry.type)} -->`];
}

function collectBounds(points) {
  if (!points.length) return { minX: 0, minY: 0, width: 100, height: 100 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  const padding = Math.max(width, height) * 0.08 + 20;
  return {
    minX: minX - padding,
    minY: minY - padding,
    width: width + padding * 2,
    height: height + padding * 2
  };
}

export function materializeTemplate(template) {
  const params = resolveParameters(template.parameters || {});
  return {
    ...template,
    documentType: 'design',
    id: `${template.id}-design`,
    parameters: params,
    derivedFrom: {
      templateId: template.id,
      templateVersion: template.occs,
      parameters: params
    }
  };
}

export function occsToSvg(document) {
  const design = document.documentType === 'template' ? materializeTemplate(document) : document;
  const params = resolveParameters(design.parameters || {});
  const layerGroups = new Map();
  const bounds = [];
  const workpiecesById = new Map((design.definitions?.workpieces || []).map((workpiece) => [workpiece.id, workpiece]));
  const facePlacementsByOccurrence = new Map();

  function pushLayer(layer, element) {
    if (!layerGroups.has(layer)) layerGroups.set(layer, []);
    layerGroups.get(layer).push(element);
  }

  for (const workpiece of design.definitions?.workpieces || []) {
    if (workpiece.type !== 'sheet') continue;

    const occurrence = (design.cassette?.occurrences || []).find((item) => item.ref === workpiece.id);
    const occurrenceId = occurrence?.id || workpiece.id;
    const sheet = resolveSheet(workpiece, params);
    for (const [faceId, placement] of sheet.placedFaces.entries()) {
      facePlacementsByOccurrence.set(`${occurrenceId}:${faceId}`, placement);
    }

    for (const face of sheet.faces) {
      const d = face.shape.edges
        ? pathFromLocalPolygon(face.shape, face.transform, params)
        : pathFromPoints(face.points);
      bounds.push(...face.points.map(svgPoint));
      const fill = face.role === 'main' ? '#e0f2fe' : '#f8fafc';
      pushLayer(
        'contour.flat_pattern.face_and_returns',
        `<path data-occs-face="${escapeXml(face.id)}" d="${escapeXml(d)}" style="fill:${fill};stroke:#0f172a;stroke-width:1.4" />`
      );
    }

    for (const fold of sheet.folds) {
      const [start, end] = fold.points.map(svgPoint);
      bounds.push(start, end);
      pushLayer(
        fold.layer,
        `<path data-occs-fold="${escapeXml(fold.id)}" class="${escapeXml(layerClass(fold.layer))}" d="M ${formatNumber(start[0])} ${formatNumber(start[1])} L ${formatNumber(end[0])} ${formatNumber(end[1])}" style="${layerStyle(fold.layer)}" />`
      );
    }

    for (const entity of workpiece.entities || []) {
      const facePlacement = sheet.placedFaces.get(entity.target);
      if (!facePlacement) continue;
      for (const element of renderEntity(entity, facePlacement, params, bounds)) {
        pushLayer(entity.layer, element);
      }
    }
  }

  for (const occurrence of design.cassette?.occurrences || []) {
    const workpiece = workpiecesById.get(occurrence.ref);
    if (workpiece?.type !== 'profile') continue;

    const relativeTo = occurrence.placement?.relativeTo || {};
    const facePlacement = facePlacementsByOccurrence.get(`${relativeTo.occurrence}:${relativeTo.face}`);
    if (!facePlacement) continue;

    const lengthValue = evalDimension(workpiece.profile?.length, params, 0);
    const widthValue = evalDimension(workpiece.profile?.nominalWidth, params, 20);
    const placement = composeTransform(facePlacement.transform, makePlacementTransform(occurrence.placement, params));
    const profilePoints = [
      [-lengthValue / 2, -widthValue / 2],
      [lengthValue / 2, -widthValue / 2],
      [lengthValue / 2, widthValue / 2],
      [-lengthValue / 2, widthValue / 2]
    ].map((point) => transformPoint(placement, point));

    bounds.push(...profilePoints.map(svgPoint));
    pushLayer(
      'contour.profile',
      `<path data-occs-occurrence="${escapeXml(occurrence.id)}" data-workpiece-ref="${escapeXml(occurrence.ref)}" d="${escapeXml(pathFromPoints(profilePoints))}" style="${layerStyle('contour.profile')}" />`
    );
  }

  const box = collectBounds(bounds);
  const layers = [...layerGroups.entries()].map(([layer, elements]) => [
    `  <g id="${escapeXml(layerClass(layer))}" data-layer="${escapeXml(layer)}">`,
    ...elements.map((element) => `    ${element}`),
    '  </g>'
  ].join('\n'));

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="${SVG_NS}" viewBox="${formatNumber(box.minX)} ${formatNumber(box.minY)} ${formatNumber(box.width)} ${formatNumber(box.height)}" data-occs-id="${escapeXml(design.id)}" data-occs-document-type="${escapeXml(design.documentType)}">`,
    '  <title>OCCS cassette flat pattern</title>',
    '  <desc>Generated from OCCS geometry by tools/occs-toolkit.mjs</desc>',
    ...layers,
    '</svg>',
    ''
  ].join('\n');
}

function createRandom(seed) {
  let state = Number(seed) >>> 0;
  if (!state) state = 0x12345678;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function maybe(rng, probability = 0.5) {
  return rng() < probability;
}

export function generateRandomCassette(seed = Date.now()) {
  const rng = createRandom(seed);
  const A = randomInt(rng, 700, 1600);
  const B = randomInt(rng, 350, 950);
  const R = randomInt(rng, 25, 70);
  const T = maybe(rng) ? 3 : 4;
  const BR = randomInt(rng, 1, 4);
  const HOLE_D = maybe(rng) ? 5 : 6;
  const TOOL_OFFSET = 1.5;

  let sides = [
    ['top', 'main.E2'],
    ['right', 'main.E1'],
    ['bottom', 'main.E0'],
    ['left', 'main.E3']
  ].filter(() => maybe(rng, 0.78));

  if (sides.length < 2) {
    sides = [['top', 'main.E2'], ['bottom', 'main.E0']];
  }

  const faces = [{
    id: 'main',
    role: 'main',
    shape: { type: 'trapezoid', baseLength: 'A', height: 'B' }
  }];

  const folds = [];
  const entities = [];

  for (const [side, edgeRef] of sides) {
    const faceId = `${side}_return`;
    faces.push({
      id: faceId,
      role: 'return_flange',
      shape: {
        type: 'trapezoid',
        baseLength: 'inherit',
        height: 'R',
        topStartOffset: String(randomInt(rng, 0, 12)),
        topEndOffset: String(randomInt(rng, 0, 12))
      }
    });
    folds.push({
      id: `fold_${side}`,
      from: edgeRef,
      to: `${faceId}.E0`,
      angle: '90deg',
      radius: 'BR',
      method: 'routed',
      layer: 'fold.route'
    });

    if (maybe(rng, 0.7)) {
      const baseMidpoint = side === 'left' || side === 'right' ? 'B / 2' : 'A / 2';
      entities.push({
        id: `hole_${side}_mid`,
        layer: 'cut.hole',
        target: faceId,
        placement: {
          origin: [baseMidpoint, 'R / 2'],
          rotation: '0deg',
          anchor: 'center'
        },
        toolOffset: {
          mode: 'inside',
          value: 'TOOL_OFFSET',
          source: 'template'
        },
        geometry: { type: 'circle', diameter: 'HOLE_D' }
      });
    }
  }

  entities.push({
    id: 'paint_direction',
    layer: 'code.paint_direction',
    target: 'main',
    placement: {
      origin: ['A / 2', 'B / 2'],
      rotation: '0deg',
      anchor: 'center'
    },
    geometry: {
      type: 'path',
      closed: false,
      start: ['-80', '0'],
      segments: [
        { type: 'line', to: ['80', '0'] },
        { type: 'line', to: ['55', '12'] },
        { type: 'line', to: ['80', '0'] },
        { type: 'line', to: ['55', '-12'] }
      ]
    }
  });

  entities.push({
    id: 'cassette_mark',
    layer: 'code.cassette_mark',
    target: 'main',
    placement: {
      origin: ['20', '20'],
      rotation: '0deg',
      anchor: 'bottom_left'
    },
    geometry: {
      type: 'text',
      text: `RND-${seed}`,
      height: '16'
    }
  });

  return {
    occs: '0.4-draft',
    documentType: 'template',
    id: `random-cassette-${seed}`,
    units: 'mm',
    parameters: {
      A,
      B,
      R,
      T,
      BR,
      HOLE_D,
      TOOL_OFFSET
    },
    definitions: {
      workpieces: [{
        id: 'tray_def',
        type: 'sheet',
        role: 'cassette_tray',
        material: `ACM_${T}`,
        thickness: 'T',
        faces,
        folds,
        entities
      }],
      libraryParts: []
    },
    cassette: {
      occurrences: [{
        id: 'tray',
        ref: 'tray_def',
        placement: {
          relativeTo: 'world',
          origin: ['0', '0', '0'],
          rotation: ['0deg', '0deg', '0deg']
        }
      }],
      joints: []
    }
  };
}

export function generateComplexCassette(seed = 20260605) {
  const rng = createRandom(seed);
  const A = randomInt(rng, 1050, 1800);
  const B = randomInt(rng, 650, 1100);
  const R_TOP = randomInt(rng, 45, 85);
  const R_SIDE = randomInt(rng, 35, 75);
  const R_BOTTOM = randomInt(rng, 50, 95);
  const T = maybe(rng) ? 4 : 3;
  const BR = randomInt(rng, 2, 5);
  const HOLE_D = maybe(rng) ? 5 : 6;
  const SLOT_W = randomInt(rng, 52, 88);
  const SLOT_H = randomInt(rng, 14, 26);
  const TOOL_OFFSET = 1.5;
  const RIB_L = Math.round(A * 0.72);
  const RIB_W = randomInt(rng, 36, 54);
  const INNER_W = Math.round(A * 0.22);
  const INNER_H = Math.round(B * 0.18);

  const faces = [
    {
      id: 'main',
      role: 'main',
      shape: {
        type: 'trapezoid',
        baseLength: 'A',
        height: 'B',
        topStartOffset: String(randomInt(rng, 8, 32)),
        topEndOffset: String(randomInt(rng, 8, 32)),
        p2Height: 'B + 18',
        p3Height: 'B - 12'
      }
    },
    {
      id: 'top_return',
      role: 'mounting_flange',
      shape: {
        type: 'trapezoid',
        baseLength: 'inherit',
        height: 'R_TOP',
        topStartOffset: String(randomInt(rng, 4, 18)),
        topEndOffset: String(randomInt(rng, 4, 18))
      }
    },
    {
      id: 'right_return',
      role: 'return_flange',
      shape: {
        type: 'trapezoid',
        baseLength: 'inherit',
        height: 'R_SIDE',
        topStartOffset: String(randomInt(rng, 3, 14)),
        topEndOffset: String(randomInt(rng, 3, 14))
      }
    },
    {
      id: 'bottom_return',
      role: 'hook_flange',
      shape: {
        type: 'trapezoid',
        baseLength: 'inherit',
        height: 'R_BOTTOM',
        topStartOffset: String(randomInt(rng, 4, 20)),
        topEndOffset: String(randomInt(rng, 4, 20))
      }
    },
    {
      id: 'left_return',
      role: 'return_flange',
      shape: {
        type: 'trapezoid',
        baseLength: 'inherit',
        height: 'R_SIDE',
        topStartOffset: String(randomInt(rng, 3, 14)),
        topEndOffset: String(randomInt(rng, 3, 14))
      }
    }
  ];

  const folds = [
    { id: 'fold_top', from: 'main.E2', to: 'top_return.E0', angle: '90deg', radius: 'BR', method: 'routed', layer: 'fold.route' },
    { id: 'fold_right', from: 'main.E1', to: 'right_return.E0', angle: '90deg', radius: 'BR', method: 'routed', layer: 'fold.route' },
    { id: 'fold_bottom', from: 'main.E0', to: 'bottom_return.E0', angle: '90deg', radius: 'BR', method: 'routed', layer: 'fold.route' },
    { id: 'fold_left', from: 'main.E3', to: 'left_return.E0', angle: '90deg', radius: 'BR', method: 'routed', layer: 'fold.route' }
  ];

  const slotPolygon = [
    ['-SLOT_W / 2', '-SLOT_H / 2'],
    ['SLOT_W / 2', '-SLOT_H / 2'],
    ['SLOT_W / 2', 'SLOT_H / 2'],
    ['-SLOT_W / 2', 'SLOT_H / 2']
  ];

  const innerCutout = [
    ['-INNER_W / 2', '-INNER_H / 2'],
    ['INNER_W / 2', '-INNER_H / 2'],
    ['INNER_W / 2', 'INNER_H / 2'],
    ['-INNER_W / 2', 'INNER_H / 2']
  ];

  const toolOffset = { mode: 'inside', value: 'TOOL_OFFSET', source: 'template' };
  const entities = [
    {
      id: 'main_service_cutout',
      layer: 'cut.inner',
      target: 'main',
      placement: { origin: ['A * 0.58', 'B * 0.48'], rotation: '0deg', anchor: 'center' },
      toolOffset,
      geometry: { type: 'polygon', vertices: innerCutout }
    },
    {
      id: 'slot_top_left',
      layer: 'cut.inner',
      target: 'top_return',
      placement: { origin: ['A * 0.22', 'R_TOP / 2'], rotation: '0deg', anchor: 'center' },
      toolOffset,
      geometry: { type: 'polygon', vertices: slotPolygon }
    },
    {
      id: 'slot_top_right',
      layer: 'cut.inner',
      target: 'top_return',
      placement: { origin: ['A * 0.78', 'R_TOP / 2'], rotation: '0deg', anchor: 'center' },
      toolOffset,
      geometry: { type: 'polygon', vertices: slotPolygon }
    },
    {
      id: 'slot_bottom_left',
      layer: 'cut.inner',
      target: 'bottom_return',
      placement: { origin: ['A * 0.22', 'R_BOTTOM / 2'], rotation: '0deg', anchor: 'center' },
      toolOffset,
      geometry: { type: 'polygon', vertices: slotPolygon }
    },
    {
      id: 'slot_bottom_right',
      layer: 'cut.inner',
      target: 'bottom_return',
      placement: { origin: ['A * 0.78', 'R_BOTTOM / 2'], rotation: '0deg', anchor: 'center' },
      toolOffset,
      geometry: { type: 'polygon', vertices: slotPolygon }
    },
    {
      id: 'hole_left_upper',
      layer: 'cut.hole',
      target: 'left_return',
      placement: { origin: ['B * 0.28', 'R_SIDE / 2'], rotation: '0deg', anchor: 'center' },
      toolOffset,
      geometry: { type: 'circle', diameter: 'HOLE_D' }
    },
    {
      id: 'hole_left_lower',
      layer: 'cut.hole',
      target: 'left_return',
      placement: { origin: ['B * 0.72', 'R_SIDE / 2'], rotation: '0deg', anchor: 'center' },
      toolOffset,
      geometry: { type: 'circle', diameter: 'HOLE_D' }
    },
    {
      id: 'hole_right_upper',
      layer: 'cut.hole',
      target: 'right_return',
      placement: { origin: ['B * 0.28', 'R_SIDE / 2'], rotation: '0deg', anchor: 'center' },
      toolOffset,
      geometry: { type: 'circle', diameter: 'HOLE_D' }
    },
    {
      id: 'hole_right_lower',
      layer: 'cut.hole',
      target: 'right_return',
      placement: { origin: ['B * 0.72', 'R_SIDE / 2'], rotation: '0deg', anchor: 'center' },
      toolOffset,
      geometry: { type: 'circle', diameter: 'HOLE_D' }
    },
    {
      id: 'quality_engrave_curve',
      layer: 'fold.engrave',
      target: 'main',
      placement: { origin: ['0', '0'], rotation: '0deg', anchor: 'origin' },
      geometry: {
        type: 'path',
        closed: false,
        start: ['A * 0.18', 'B * 0.35'],
        segments: [{
          type: 'cubicBezier',
          c1: ['A * 0.33', 'B * 0.62'],
          c2: ['A * 0.67', 'B * 0.62'],
          to: ['A * 0.82', 'B * 0.35']
        }]
      }
    },
    {
      id: 'paint_direction',
      layer: 'code.paint_direction',
      target: 'main',
      placement: { origin: ['A / 2', 'B * 0.72'], rotation: '0deg', anchor: 'center' },
      geometry: {
        type: 'path',
        closed: false,
        start: ['-110', '0'],
        segments: [
          { type: 'line', to: ['110', '0'] },
          { type: 'line', to: ['82', '14'] },
          { type: 'line', to: ['110', '0'] },
          { type: 'line', to: ['82', '-14'] }
        ]
      }
    },
    {
      id: 'cassette_mark',
      layer: 'code.cassette_mark',
      target: 'main',
      placement: { origin: ['24', '28'], rotation: '0deg', anchor: 'bottom_left' },
      geometry: { type: 'text', text: `CX-${seed}`, height: '18' }
    },
    {
      id: 'dimension_width',
      layer: 'dimension.cassette',
      target: 'main',
      geometry: {
        type: 'dimension',
        dimensionType: 'linear',
        from: ['0', '0'],
        to: ['A', '0'],
        offset: '-55',
        text: 'A'
      }
    }
  ];

  return {
    occs: '0.4-draft',
    documentType: 'template',
    id: `complex-cassette-${seed}`,
    units: 'mm',
    parameters: {
      A,
      B,
      R_TOP,
      R_SIDE,
      R_BOTTOM,
      T,
      BR,
      HOLE_D,
      SLOT_W,
      SLOT_H,
      INNER_W,
      INNER_H,
      TOOL_OFFSET,
      RIB_L,
      RIB_W
    },
    definitions: {
      workpieces: [
        {
          id: 'tray_def',
          type: 'sheet',
          role: 'cassette_tray',
          material: `ACM_${T}`,
          thickness: 'T',
          faces,
          folds,
          entities
        },
        {
          id: 'rib_def',
          type: 'profile',
          role: 'stiffener',
          material: 'aluminium',
          profile: {
            profileType: 'hat_channel',
            length: 'RIB_L',
            nominalWidth: 'RIB_W',
            crossSectionRef: 'HAT_CHANNEL_RANDOM'
          },
          manufacturing: { process: 'brake_formed' },
          entities: []
        }
      ],
      libraryParts: [{
        id: 'rivet_d5',
        type: 'hardware',
        role: 'rivet',
        parameters: { diameter: 'HOLE_D' }
      }]
    },
    cassette: {
      occurrences: [
        {
          id: 'tray',
          ref: 'tray_def',
          placement: {
            relativeTo: 'world',
            origin: ['0', '0', '0'],
            rotation: ['0deg', '0deg', '0deg']
          }
        },
        {
          id: 'rib_01',
          ref: 'rib_def',
          placement: {
            relativeTo: { occurrence: 'tray', face: 'main', side: 'back' },
            origin: ['A / 2', 'B * 0.52'],
            rotation: '0deg',
            anchor: 'center'
          }
        }
      ],
      joints: [{
        id: 'joint_rib_01',
        type: 'mechanical',
        method: 'rivet',
        source: { occurrence: 'rib_01' },
        target: { occurrence: 'tray', face: 'main', side: 'back' },
        placement: {
          relativeTo: { occurrence: 'tray', face: 'main', side: 'back' },
          origin: ['A / 2', 'B * 0.52'],
          rotation: '0deg',
          anchor: 'center'
        },
        fastenerPattern: {
          type: 'linear',
          axis: 'u',
          spacing: '160',
          startOffset: '80',
          endOffset: '80',
          fastener: { ref: 'rivet_d5' }
        }
      }]
    }
  };
}

async function runSvg(inputPath, outputPath) {
  const document = await readJson(inputPath);
  const svg = occsToSvg(document);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, svg);
  return { inputPath, outputPath };
}

async function loadLayerRegistry() {
  const registryPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'layers.json');
  try {
    return await readJson(registryPath);
  } catch {
    return { layers: [] };
  }
}

async function runValidate(inputPaths) {
  if (!inputPaths.length) throw new Error(usage());
  const layerRegistry = await loadLayerRegistry();
  const results = [];

  for (const inputPath of inputPaths) {
    const resolvedPath = path.resolve(inputPath);
    const document = await readJson(resolvedPath);
    const errors = validateDocument(document, layerRegistry);
    results.push({ inputPath: resolvedPath, errors });
  }

  return results;
}

async function runRandom(options) {
  const seed = options.seed ? Number(options.seed) : 20260604;
  if (!Number.isInteger(seed)) throw new Error('--seed must be an integer');

  const defaultOutDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'generated');
  const outDir = options['out-dir'] ? path.resolve(options['out-dir']) : defaultOutDir;
  await fs.mkdir(outDir, { recursive: true });

  const template = generateRandomCassette(seed);
  const design = materializeTemplate(template);
  const svg = occsToSvg(design);

  const templatePath = path.join(outDir, 'random-cassette-template.occs.json');
  const designPath = path.join(outDir, 'random-cassette-design.occs.json');
  const svgPath = path.join(outDir, 'random-cassette.svg');

  await writeJson(templatePath, template);
  await writeJson(designPath, design);
  await fs.writeFile(svgPath, svg);

  return { seed, templatePath, designPath, svgPath };
}

async function runComplex(options) {
  const seed = options.seed ? Number(options.seed) : 20260605;
  if (!Number.isInteger(seed)) throw new Error('--seed must be an integer');

  const defaultOutDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'generated');
  const outDir = options['out-dir'] ? path.resolve(options['out-dir']) : defaultOutDir;
  await fs.mkdir(outDir, { recursive: true });

  const template = generateComplexCassette(seed);
  const design = materializeTemplate(template);
  const svg = occsToSvg(design);

  const templatePath = path.join(outDir, 'complex-cassette-template.occs.json');
  const designPath = path.join(outDir, 'complex-cassette-design.occs.json');
  const svgPath = path.join(outDir, 'complex-cassette.svg');

  await writeJson(templatePath, template);
  await writeJson(designPath, design);
  await fs.writeFile(svgPath, svg);

  return { seed, templatePath, designPath, svgPath };
}

async function main() {
  const { command, positional, options } = parseArgs(process.argv.slice(2));

  if (command === 'svg') {
    const [inputPath, outputPath] = positional;
    if (!inputPath || !outputPath) throw new Error(usage());
    const result = await runSvg(path.resolve(inputPath), path.resolve(outputPath));
    console.log(`Wrote ${result.outputPath}`);
    return;
  }

  if (command === 'validate') {
    const results = await runValidate(positional);
    let ok = true;
    for (const result of results) {
      if (result.errors.length) {
        ok = false;
        console.log(`FAIL ${result.inputPath}`);
        for (const error of result.errors) console.log(`  ${error}`);
      } else {
        console.log(`PASS ${result.inputPath}`);
      }
    }
    if (!ok) process.exitCode = 1;
    return;
  }

  if (command === 'random') {
    const result = await runRandom(options);
    console.log(`Seed: ${result.seed}`);
    console.log(`Template: ${result.templatePath}`);
    console.log(`Design: ${result.designPath}`);
    console.log(`SVG: ${result.svgPath}`);
    return;
  }

  if (command === 'complex') {
    const result = await runComplex(options);
    console.log(`Seed: ${result.seed}`);
    console.log(`Template: ${result.templatePath}`);
    console.log(`Design: ${result.designPath}`);
    console.log(`SVG: ${result.svgPath}`);
    return;
  }

  throw new Error(usage());
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
