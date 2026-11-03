const DEFAULT_LAYER = 'geometry';

// Layer drafting attributes (the OCCS layer standards' pens): hex color,
// pen weight in mm, and the dash pattern ride the drawing layers; the
// layer table carries them so a CAM reader sees the standard's styling.
const LINE_TYPE_PATTERNS = {
  Continuous: { description: 'Solid line', elements: [] },
  DASHED: { description: 'Dashed __ __', elements: [5, -5] },
  DOT: { description: 'Dot . . .', elements: [1, -3] }
};

// DXF lineweights are a fixed 1/100 mm ladder; a pen weight snaps to it.
const LINE_WEIGHT_LADDER = [0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211];

const lineTypeForDashArray = (dasharray = '') => {
  const pattern = String(dasharray || '').trim();
  if (pattern === '5,5') return 'DASHED';
  if (pattern === '1,3') return 'DOT';
  return 'Continuous';
};

const lineWeightFor = (weight) => {
  const value = Number(weight);
  if (!Number.isFinite(value) || value <= 0) return -3;
  const target = Math.round(value * 100);
  return LINE_WEIGHT_LADDER.reduce((best, step) => (
    Math.abs(step - target) < Math.abs(best - target) ? step : best
  ), LINE_WEIGHT_LADDER[0]);
};

const trueColorFor = (color) => {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(color || '').trim());
  return match ? parseInt(match[1], 16) : null;
};


const validPoint = (point) => (
  Array.isArray(point) &&
  point.length >= 2 &&
  Number.isFinite(Number(point[0])) &&
  Number.isFinite(Number(point[1]))
);

const normalizePoint = (point) => [Number(point[0]), Number(point[1])];

const samePoint = (left, right) => (
  Math.abs(Number(left?.[0]) - Number(right?.[0])) <= 0.001 &&
  Math.abs(Number(left?.[1]) - Number(right?.[1])) <= 0.001
);

const layerName = (value) => String(value || DEFAULT_LAYER).slice(0, 255);

const normalizeCoordinates = (coordinates = []) => (Array.isArray(coordinates) ? coordinates : [])
  .filter(validPoint)
  .map(normalizePoint);

const closeableLayer = (layer = '') => {
  const code = layerName(layer);
  return code.startsWith('cut.') ||
    code.startsWith('contour.') ||
    code === DEFAULT_LAYER;
};

const pathTokens = (path = '') => String(path).match(/[MLHVZmlhvz]|-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/g) || [];

export function svgPathToPolylines(path = '') {
  const tokens = pathTokens(path);
  const loops = [];
  let points = [];
  let cursor = [0, 0];
  let command = null;
  let closed = false;
  let index = 0;

  const readNumber = () => {
    const value = Number(tokens[index]);
    index += 1;
    return value;
  };
  const flush = () => {
    if (!points.length) return;
    loops.push({
      points,
      closed: closed || (points.length > 2 && samePoint(points[0], points[points.length - 1]))
    });
    points = [];
    closed = false;
  };

  while (index < tokens.length) {
    const token = tokens[index];
    if (/^[MLHVZmlhvz]$/.test(token)) {
      command = token;
      index += 1;
    }

    if (command === 'Z' || command === 'z') {
      closed = true;
      flush();
      command = null;
      continue;
    }

    if (command === 'M' || command === 'm') {
      if (index + 1 >= tokens.length) break;
      flush();
      const x = readNumber();
      const y = readNumber();
      cursor = command === 'm'
        ? [cursor[0] + x, cursor[1] + y]
        : [x, y];
      points.push(cursor);
      command = command === 'M' ? 'L' : 'l';
      continue;
    }

    if (command === 'L' || command === 'l') {
      if (index + 1 >= tokens.length) break;
      const x = readNumber();
      const y = readNumber();
      cursor = command === 'l'
        ? [cursor[0] + x, cursor[1] + y]
        : [x, y];
      points.push(cursor);
      continue;
    }

    if (command === 'H' || command === 'h') {
      if (index >= tokens.length) break;
      const x = readNumber();
      cursor = command === 'h' ? [cursor[0] + x, cursor[1]] : [x, cursor[1]];
      points.push(cursor);
      continue;
    }

    if (command === 'V' || command === 'v') {
      if (index >= tokens.length) break;
      const y = readNumber();
      cursor = command === 'v' ? [cursor[0], cursor[1] + y] : [cursor[0], y];
      points.push(cursor);
      continue;
    }

    index += 1;
  }
  flush();
  return loops;
}

export function svgPathToPolyline(path = '') {
  const loops = svgPathToPolylines(path);
  if (!loops.length) return { points: [], closed: false };
  if (loops.length === 1) return loops[0];
  return {
    points: loops.flatMap(loop => loop.points),
    closed: loops.some(loop => loop.closed)
  };
}

function pushPolyline(entities, layer, coordinates, { closed = false } = {}) {
  const points = normalizeCoordinates(coordinates);
  if (points.length < 2) return;
  const normalizedClosed = closed || (points.length > 2 && samePoint(points[0], points[points.length - 1]));
  const outputPoints = normalizedClosed && samePoint(points[0], points[points.length - 1])
    ? points.slice(0, -1)
    : points;
  if (outputPoints.length < 2) return;
  entities.push({ type: 'polyline', layer: layerName(layer), points: outputPoints, closed: normalizedClosed });
}

function pushLine(entities, layer, from, to) {
  if (!validPoint(from) || !validPoint(to)) return;
  entities.push({ type: 'line', layer: layerName(layer), from: normalizePoint(from), to: normalizePoint(to) });
}

function pushText(entities, layer, text = '', point = [], options = {}) {
  if (!text || !validPoint(point)) return;
  entities.push({
    type: 'text',
    layer: layerName(layer),
    point: normalizePoint(point),
    text: String(text),
    height: Number(options.height || options.fontSize || 12) || 12
  });
}

function layerDataToEntities(layerData = [], entities = []) {
  for (const item of layerData || []) {
    const layer = layerName(item.layer || item.standardCode || item.name || DEFAULT_LAYER);
    const geometry = item.geometry || {};
    if (geometry.type === 'text') {
      pushText(entities, layer, geometry.text || item.value?.value, geometry.point || geometry.position || geometry.origin, geometry);
      continue;
    }
    if (geometry.type === 'dimension') {
      pushLine(entities, layer, geometry.from, geometry.to);
      const from = validPoint(geometry.from) ? normalizePoint(geometry.from) : null;
      const to = validPoint(geometry.to) ? normalizePoint(geometry.to) : null;
      if (from && to && (geometry.text || item.value?.value)) {
        pushText(entities, layer, geometry.text || item.value?.value, [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2], geometry);
      }
      continue;
    }
    pushPolyline(entities, layer, item.coordinates, { closed: closeableLayer(layer) });
  }
  return entities;
}

function drawingLayersToEntities(layers = [], entities = []) {
  for (const layer of layers || []) {
    // The display name is the DXF layer name; the standard code stays
    // the semantic key for closure semantics.
    const code = layerName(layer.standardCode || layer.name || DEFAULT_LAYER);
    const name = layerName(layer.name || layer.standardCode || DEFAULT_LAYER);
    for (const path of layer.paths || []) {
      if (typeof path === 'string') {
        const polyline = svgPathToPolyline(path);
        pushPolyline(entities, name, polyline.points, { closed: polyline.closed || closeableLayer(code) });
        continue;
      }
      if (path?.kind === 'text') {
        pushText(entities, name, path.text, [path.x, path.y], path);
        continue;
      }
      if (path?.d) {
        const polyline = svgPathToPolyline(path.d);
        pushPolyline(entities, name, polyline.points, { closed: polyline.closed || closeableLayer(code) });
      }
    }
  }
  return entities;
}

function polygonPartsToEntities(polygonParts = [], entities = []) {
  for (const [index, part] of (polygonParts || []).entries()) {
    const layer = part.layer || part.standardCode || (index === 0 ? 'cut.outer' : 'contour.cassette_face');
    pushPolyline(entities, layer, part.coordinates || part, { closed: true });
  }
  return entities;
}

export function collectDxfEntities({ layers = [], layerData = [], polygonParts = [] } = {}) {
  const entities = [];
  drawingLayersToEntities(layers, entities);
  layerDataToEntities(layerData, entities);
  if (!entities.length) polygonPartsToEntities(polygonParts, entities);
  return entities;
}

// The layer table's drafting attributes: each layer takes its pen from
// the drawing layer that produced it (the OCCS standard's color, weight,
// and dash pattern), defaulted to the neutral pen.
function layerDefinitionsOf(layers = [], entities = []) {
  const defs = new Map();
  const define = (name, pen = {}) => {
    const key = layerName(name);
    const current = defs.get(key) || { name: key, lineType: 'Continuous', lineWeight: -3, trueColor: null };
    if (pen.dasharray) current.lineType = lineTypeForDashArray(pen.dasharray);
    if (pen.weight !== undefined) current.lineWeight = lineWeightFor(pen.weight);
    const trueColor = trueColorFor(pen.color);
    if (trueColor !== null) current.trueColor = trueColor;
    defs.set(key, current);
  };
  for (const layer of layers || []) define(layer.name || layer.standardCode, layer);
  for (const entity of entities || []) if (!defs.has(layerName(entity.layer))) define(entity.layer);
  return [...defs.values()];
}

function entitiesBounds(entities = []) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const extend = ([x, y]) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const entity of entities) {
    for (const point of entity.points || []) extend(point);
    if (entity.from) extend(entity.from);
    if (entity.to) extend(entity.to);
    if (entity.point) extend(entity.point);
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

export function generateLayeredDxf({ layers = [], layerData = [], polygonParts = [] } = {}) {
  const entities = collectDxfEntities({ layers, layerData, polygonParts });
  if (!entities.length) return '';
  const layerDefinitions = layerDefinitionsOf(layers, entities);
  const lineTypes = ['Continuous', ...new Set(layerDefinitions.map(definition => definition.lineType))];
  const bounds = entitiesBounds(entities);
  const lines = [];
  let handleCount = 256;

  const add = (code, value) => {
    lines.push(String(code));
    lines.push(String(value));
  };
  const nextHandle = () => (handleCount++).toString(16).toUpperCase();

  add(0, 'SECTION');
  add(2, 'HEADER');
  add(9, '$ACADVER');
  add(1, 'AC1015');
  add(9, '$INSUNITS');
  add(70, 4);
  add(9, '$MEASUREMENT');
  add(70, 1);
  add(9, '$EXTMIN');
  add(10, bounds.minX);
  add(20, bounds.minY);
  add(30, 0);
  add(9, '$EXTMAX');
  add(10, bounds.maxX);
  add(20, bounds.maxY);
  add(30, 0);
  add(0, 'ENDSEC');

  add(0, 'SECTION');
  add(2, 'TABLES');
  add(0, 'TABLE');
  add(2, 'LTYPE');
  add(70, lineTypes.length);
  for (const lineType of lineTypes) {
    const definition = LINE_TYPE_PATTERNS[lineType] || LINE_TYPE_PATTERNS.Continuous;
    add(0, 'LTYPE');
    add(5, nextHandle());
    add(100, 'AcDbSymbolTableRecord');
    add(100, 'AcDbLinetypeTableRecord');
    add(2, lineType);
    add(70, 0);
    add(3, definition.description);
    add(72, 65);
    add(73, definition.elements.length);
    add(40, definition.elements.reduce((total, element) => total + Math.abs(element), 0));
    for (const element of definition.elements) {
      add(49, element);
      add(74, 0);
    }
  }
  add(0, 'ENDTAB');

  add(0, 'TABLE');
  add(2, 'LAYER');
  add(70, layerDefinitions.length);
  for (const definition of layerDefinitions) {
    add(0, 'LAYER');
    add(5, nextHandle());
    add(100, 'AcDbSymbolTableRecord');
    add(100, 'AcDbLayerTableRecord');
    add(2, definition.name);
    add(70, 0);
    add(62, 7);
    add(6, definition.lineType);
    add(370, definition.lineWeight);
    if (definition.trueColor !== null) add(420, definition.trueColor);
  }
  add(0, 'ENDTAB');

  add(0, 'TABLE');
  add(2, 'STYLE');
  add(70, 1);
  add(0, 'STYLE');
  add(5, nextHandle());
  add(100, 'AcDbSymbolTableRecord');
  add(100, 'AcDbTextStyleTableRecord');
  add(2, 'Standard');
  add(70, 0);
  add(40, 0);
  add(41, 1);
  add(50, 0);
  add(71, 0);
  add(42, 2.5);
  add(3, 'txt');
  add(4, '');
  add(0, 'ENDTAB');
  add(0, 'ENDSEC');

  add(0, 'SECTION');
  add(2, 'ENTITIES');
  for (const entity of entities) {
    if (entity.type === 'polyline') {
      add(0, 'LWPOLYLINE');
      add(5, nextHandle());
      add(100, 'AcDbEntity');
      add(8, entity.layer);
      add(100, 'AcDbPolyline');
      add(90, entity.points.length);
      add(70, entity.closed ? 1 : 0);
      for (const point of entity.points) {
        add(10, point[0]);
        add(20, point[1]);
      }
      continue;
    }
    if (entity.type === 'line') {
      add(0, 'LINE');
      add(5, nextHandle());
      add(100, 'AcDbEntity');
      add(8, entity.layer);
      add(10, entity.from[0]);
      add(20, entity.from[1]);
      add(30, 0);
      add(11, entity.to[0]);
      add(21, entity.to[1]);
      add(31, 0);
      continue;
    }
    if (entity.type === 'text') {
      add(0, 'TEXT');
      add(5, nextHandle());
      add(100, 'AcDbEntity');
      add(8, entity.layer);
      add(100, 'AcDbText');
      add(10, entity.point[0]);
      add(20, entity.point[1]);
      add(30, 0);
      add(40, entity.height);
      add(1, entity.text);
      add(7, 'Standard');
    }
  }
  add(0, 'ENDSEC');
  add(0, 'EOF');

  return lines.join('\n');
}
