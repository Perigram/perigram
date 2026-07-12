const DEFAULT_LAYER = 'geometry';

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

export function svgPathToPolyline(path = '') {
  const tokens = pathTokens(path);
  const points = [];
  let cursor = [0, 0];
  let command = null;
  let closed = false;
  let index = 0;

  const readNumber = () => {
    const value = Number(tokens[index]);
    index += 1;
    return value;
  };

  while (index < tokens.length) {
    const token = tokens[index];
    if (/^[MLHVZmlhvz]$/.test(token)) {
      command = token;
      index += 1;
    }

    if (command === 'Z' || command === 'z') {
      closed = true;
      command = null;
      continue;
    }

    if (command === 'M' || command === 'L' || command === 'm' || command === 'l') {
      if (index + 1 >= tokens.length) break;
      const x = readNumber();
      const y = readNumber();
      cursor = command === 'm' || command === 'l'
        ? [cursor[0] + x, cursor[1] + y]
        : [x, y];
      points.push(cursor);
      command = command === 'M' ? 'L' : (command === 'm' ? 'l' : command);
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

  return { points, closed: closed || (points.length > 2 && samePoint(points[0], points[points.length - 1])) };
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
    const code = layerName(layer.standardCode || layer.name || DEFAULT_LAYER);
    for (const path of layer.paths || []) {
      if (typeof path === 'string') {
        const polyline = svgPathToPolyline(path);
        pushPolyline(entities, code, polyline.points, { closed: polyline.closed || closeableLayer(code) });
        continue;
      }
      if (path?.kind === 'text') {
        pushText(entities, code, path.text, [path.x, path.y], path);
        continue;
      }
      if (path?.d) {
        const polyline = svgPathToPolyline(path.d);
        pushPolyline(entities, code, polyline.points, { closed: polyline.closed || closeableLayer(code) });
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

export function generateLayeredDxf({ layers = [], layerData = [], polygonParts = [] } = {}) {
  const entities = collectDxfEntities({ layers, layerData, polygonParts });
  if (!entities.length) return '';
  const layerNames = Array.from(new Set(entities.map(entity => layerName(entity.layer))));
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
  add(0, 'ENDSEC');

  add(0, 'SECTION');
  add(2, 'TABLES');
  add(0, 'TABLE');
  add(2, 'LTYPE');
  add(70, 1);
  add(0, 'LTYPE');
  add(2, 'Continuous');
  add(70, 0);
  add(3, 'Solid line');
  add(72, 65);
  add(73, 0);
  add(40, 0.0);
  add(0, 'ENDTAB');

  add(0, 'TABLE');
  add(2, 'LAYER');
  add(70, layerNames.length);
  for (const [index, name] of layerNames.entries()) {
    add(0, 'LAYER');
    add(5, nextHandle());
    add(100, 'AcDbSymbolTableRecord');
    add(100, 'AcDbLayerTableRecord');
    add(2, name);
    add(70, 0);
    add(62, index === 0 ? 7 : ((index % 7) + 1));
    add(6, 'Continuous');
  }
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
      add(10, entity.point[0]);
      add(20, entity.point[1]);
      add(30, 0);
      add(40, entity.height);
      add(1, entity.text);
    }
  }
  add(0, 'ENDSEC');
  add(0, 'EOF');

  return lines.join('\n');
}
