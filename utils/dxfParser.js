import DxfParser from 'dxf-parser';

// Basic ACI palette for layers styled by index alone (no truecolor).
const ACI_COLORS = {
  1: '#FF0000', 2: '#FFFF00', 3: '#00FF00', 4: '#00FFFF', 5: '#0000FF',
  6: '#FF00FF', 7: '#FFFFFF', 8: '#808080', 9: '#C0C0C0'
};

const hexOfTrueColor = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const hex = Math.max(0, Math.min(0xFFFFFF, Math.trunc(numeric))).toString(16).padStart(6, '0');
  return `#${hex.toUpperCase()}`;
};

// The LAYER table's drafting attributes, read off the raw text: the
// drawing displays as the file declares it (truecolor, linetype,
// lineweight, on/off), independent of any org pen registry. A negative
// color index (group 62) marks the layer off — its entities stay out of
// the preview.
export function parseDxfLayerStyles(dxfText = '') {
  const lines = String(dxfText || '').split(/\r?\n/);
  const entries = [];
  let current = null;
  for (let index = 0; index + 1 < lines.length; index += 2) {
    const code = lines[index].trim();
    const value = lines[index + 1].trim();
    if (code === '0') {
      if (current) entries.push(current);
      current = value === 'LAYER'
        ? { name: '', color: null, trueColor: null, lineType: 'Continuous', lineWeight: null }
        : null;
      continue;
    }
    if (!current) continue;
    if (code === '2' && !current.name) current.name = value;
    else if (code === '62') current.color = Number(value);
    else if (code === '420') current.trueColor = Number(value);
    else if (code === '6') current.lineType = value;
    else if (code === '370') current.lineWeight = Number(value);
  }
  if (current) entries.push(current);
  const byName = new Map();
  for (const entry of entries) {
    if (!entry.name) continue;
    byName.set(entry.name, {
      color: hexOfTrueColor(entry.trueColor) || ACI_COLORS[Math.abs(entry.color || 7)] || null,
      dasharray: entry.lineType === 'DASHED' ? '5,5' : entry.lineType === 'DOT' ? '1,3' : 'none',
      weight: Number.isFinite(entry.lineWeight) && entry.lineWeight > 0 ? entry.lineWeight / 100 : null,
      off: Number.isFinite(entry.color) && entry.color < 0
    });
  }
  return byName;
}


/**
 * Build a layer-to-pen map for use with generateSvgData.
 * Uses org override pen if available, falls back to default pen.
 * @param {Object} mapping - { layerName: standardCode }
 * @param {Array} standards - from layerStandardsStore.standards (with orgPenId merged)
 * @param {Array} pens - from penTemplatesStore.pens
 * @returns {Object} { layerName: penObject }
 */
export function buildLayerPenMap(mapping = {}, standards = [], pens = []) {
    const result = {};
    const codeForStandard = (standard) => standard?.data?.code || standard?.code || null;
    const standardPenId = (standard) => (
        standard?.data?.orgPenId ||
        standard?.orgPenId ||
        standard?.data?.defaultPenId ||
        standard?.defaultPenId ||
        null
    );
    for (const [layerName, targetCode] of Object.entries(mapping)) {
        if (!targetCode) continue;
        const standard = standards.find(s => codeForStandard(s) === targetCode);
        if (!standard) continue;
        const penId = standardPenId(standard);
        if (!penId) continue;
        const pen = pens.find(p => p._id?.toString() === penId.toString());
        if (pen) result[layerName] = pen;
    }
    return result;
}

const TAU = Math.PI * 2;
const INSERT_DEPTH_LIMIT = 8;
const ARC_SAMPLES = 64;
const SPLINE_SAMPLES = 128;
const ELLIPSE_SAMPLES = 96;

// An INSERT placement: block-local points are scaled, rotated, then
// translated into the owner's space. Uniform parent scales compose
// exactly; a non-uniform parent over a rotated child approximates.
const IDENTITY_TRANSFORM = Object.freeze({ tx: 0, ty: 0, sx: 1, sy: 1, rot: 0 });

const isIdentity = (transform) => (
  transform === IDENTITY_TRANSFORM
  || (transform.tx === 0 && transform.ty === 0 && transform.sx === 1 && transform.sy === 1 && transform.rot === 0)
);

const composeTransform = (parent, insert) => {
  const sx = (Number(insert.xScale) || 1) * parent.sx;
  const sy = (Number(insert.yScale) || 1) * parent.sy;
  const rot = parent.rot + (Number(insert.rotation) || 0) * Math.PI / 180;
  const cos = Math.cos(parent.rot);
  const sin = Math.sin(parent.rot);
  const localX = (Number(insert.position?.x) || 0) * parent.sx;
  const localY = (Number(insert.position?.y) || 0) * parent.sy;
  return {
    tx: parent.tx + cos * localX - sin * localY,
    ty: parent.ty + sin * localX + cos * localY,
    sx,
    sy,
    rot
  };
};

const transformPoint = (point, transform) => {
  const x = (Number(point?.x) || 0) * transform.sx;
  const y = (Number(point?.y) || 0) * transform.sy;
  const cos = Math.cos(transform.rot);
  const sin = Math.sin(transform.rot);
  return {
    x: transform.tx + cos * x - sin * y,
    y: transform.ty + sin * x + cos * y
  };
};

// A sampled polyline: `M`/`L` commands in the SVG frame (DXF y-up flips
// to the canvas y-down), closed when the source entity closes.
const samplePath = (points = [], close = false) => {
  const valid = points.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (valid.length < 2) return null;
  const commands = valid.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${-point.y}`);
  if (close && valid.length >= 3) commands.push('Z');
  return commands.join(' ');
};

const arcSamplePoints = ({ x, y }, radius, startAngle, endAngle) => {
  const sweep = endAngle - startAngle;
  const steps = Math.max(2, Math.ceil(Math.abs(sweep) / TAU * ARC_SAMPLES));
  return Array.from({ length: steps + 1 }, (_, index) => {
    const angle = startAngle + sweep * index / steps;
    return { x: x + radius * Math.cos(angle), y: y + radius * Math.sin(angle) };
  });
};

// LWPOLYLINE/POLYLINE bulge: tan(quarter of the included angle); the
// sign names the sweep direction. The bulged segment samples onto the
// arc its chord and angle describe.
const bulgeSamplePoints = (from, to, bulge) => {
  const included = 4 * Math.atan(bulge);
  const chord = Math.hypot(to.x - from.x, to.y - from.y);
  if (!chord) return [from];
  const half = included / 2;
  const apothem = Math.abs(chord / (2 * Math.tan(half)));
  if (!Number.isFinite(apothem) || apothem > 1e7) return [from, to];
  const dirX = (to.x - from.x) / chord;
  const dirY = (to.y - from.y) / chord;
  const side = bulge > 0 ? 1 : -1;
  const center = {
    x: (from.x + to.x) / 2 - dirY * apothem * side,
    y: (from.y + to.y) / 2 + dirX * apothem * side
  };
  const radius = Math.hypot(from.x - center.x, from.y - center.y);
  const startAngle = Math.atan2(from.y - center.y, from.x - center.x);
  const endAngle = Math.atan2(to.y - center.y, to.x - center.x);
  let sweep = endAngle - startAngle;
  if (side > 0 && sweep <= 0) sweep += TAU;
  if (side < 0 && sweep >= 0) sweep -= TAU;
  const steps = Math.max(2, Math.ceil(Math.abs(sweep) / TAU * ARC_SAMPLES));
  return Array.from({ length: steps }, (_, index) => {
    const angle = startAngle + sweep * index / steps;
    return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
  }).concat(to);
};

const polylineSamplePoints = (vertices = [], closed = false) => {
  const points = [];
  const count = vertices.length;
  const segments = closed ? count : count - 1;
  for (let index = 0; index < segments; index++) {
    const from = vertices[index];
    const to = vertices[(index + 1) % count];
    const bulge = Number(from?.bulge) || 0;
    points.push(...(bulge ? bulgeSamplePoints(from, to, bulge) : [from]));
  }
  if (!closed && count) points.push(vertices[count - 1]);
  return points;
};

// de Boor evaluation over the control polygon: a spline previews as its
// actual curve, sampled through the knot domain. Fit points pass
// through as drawn.
const splineSamplePoints = (entity) => {
  const fitPoints = Array.isArray(entity.fitPoints) ? entity.fitPoints : [];
  if (fitPoints.length >= 2) return fitPoints;
  const controls = (Array.isArray(entity.controlPoints) ? entity.controlPoints : [])
    .filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y));
  if (controls.length < 2) return [];
  const degree = Math.min(Math.max(Number(entity.degreeOfSplineCurve) || 3, 1), controls.length - 1);
  let knots = Array.isArray(entity.knotValues) ? entity.knotValues.map(Number) : [];
  const expected = controls.length + degree + 1;
  if (knots.length < expected || knots.some(value => !Number.isFinite(value))) {
    knots = Array.from({ length: expected }, (_, index) =>
      Math.min(Math.max(index - degree, 0), controls.length - degree));
  }
  const domainStart = knots[degree];
  const domainEnd = knots[controls.length];
  if (!(domainEnd > domainStart)) return controls;
  const sampleCount = Math.min(SPLINE_SAMPLES, Math.max(16, controls.length * 8));
  return Array.from({ length: sampleCount + 1 }, (_, index) => {
    const t = domainStart + (domainEnd - domainStart) * index / sampleCount;
    let span = degree;
    const last = controls.length - 1;
    while (span < last && knots[span + 1] <= t) span++;
    const d = [];
    for (let j = 0; j <= degree; j++) {
      const control = controls[span - degree + j];
      d.push({ x: control.x, y: control.y });
    }
    for (let r = 1; r <= degree; r++) {
      for (let j = degree; j >= r; j--) {
        const knotLeft = knots[span + 1 + j - r];
        const knotRight = knots[span - degree + j];
        const alpha = knotRight === knotLeft ? 0 : (t - knotRight) / (knotLeft - knotRight);
        d[j] = {
          x: d[j - 1].x + (d[j].x - d[j - 1].x) * alpha,
          y: d[j - 1].y + (d[j].y - d[j - 1].y) * alpha
        };
      }
    }
    return d[degree];
  });
};

const ellipseSamplePoints = (entity) => {
  const center = { x: Number(entity.center?.x) || 0, y: Number(entity.center?.y) || 0 };
  const majorX = Number(entity.majorAxisEndPoint?.x) || 0;
  const majorY = Number(entity.majorAxisEndPoint?.y) || 0;
  const ratio = Number(entity.axisRatio);
  if (!Number.isFinite(ratio) || ratio <= 0) return [];
  const minorX = -majorY * ratio;
  const minorY = majorX * ratio;
  let start = Number(entity.startAngle) || 0;
  let end = Number(entity.endAngle);
  if (!Number.isFinite(end)) end = start + TAU;
  let sweep = end - start;
  if (sweep <= 0) sweep += TAU;
  const steps = Math.max(8, Math.min(ELLIPSE_SAMPLES, Math.ceil(sweep / TAU * ELLIPSE_SAMPLES)));
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = start + sweep * index / steps;
    return {
      x: center.x + majorX * Math.cos(t) + minorX * Math.sin(t),
      y: center.y + majorY * Math.cos(t) + minorY * Math.sin(t)
    };
  });
};

const MTEXT_CODE = /\\[A-Za-z][^;]*;|\\P|[{}]/g;

const textEntry = (entity, transform) => {
  const anchor = transformPoint(entity.startPoint || entity.position, transform);
  const height = (Number(entity.textHeight) || Number(entity.height) || 2.5)
    * Math.abs(transform.sy);
  const text = String(entity.text || '').replace(MTEXT_CODE, '').trim();
  if (!text || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return null;
  const entry = {
    kind: 'text',
    x: anchor.x,
    y: -anchor.y,
    text,
    fontSize: Math.max(1, height)
  };
  const rotation = (Number(entity.rotation) || 0) * Math.PI / 180 + transform.rot;
  if (rotation) entry.transform = `rotate(${-rotation * 180 / Math.PI} ${entry.x} ${entry.y})`;
  return entry;
};

// One drawing entry per entity: geometry flattens to a sampled `d`
// string (an exact arc string at the identity transform), text to a
// text primitive; `points` feeds the bounds. Null entries drop out.
const entityEntry = (entity, transform) => {
  const at = (point) => transformPoint(point, transform);
  switch (entity.type) {
    case 'LINE': {
      const start = at(entity.startPoint || entity.vertices?.[0]);
      const end = at(entity.endPoint || entity.vertices?.[1]);
      const d = samplePath([start, end]);
      return d ? { d, points: [start, end] } : null;
    }
    case 'LWPOLYLINE':
    case 'POLYLINE': {
      const closed = Boolean(entity.closed || entity.shape);
      const points = polylineSamplePoints(entity.vertices || [], closed).map(at);
      const d = samplePath(points, closed);
      return d ? { d, points } : null;
    }
    case 'CIRCLE': {
      const center = { x: Number(entity.center?.x) || 0, y: Number(entity.center?.y) || 0 };
      const radius = Number(entity.radius) || 0;
      if (!radius) return null;
      const points = arcSamplePoints(center, radius, 0, TAU);
      const placed = points.map(at);
      if (isIdentity(transform)) {
        const c = at(center);
        return {
          d: `M ${c.x + radius} ${-c.y} A ${radius} ${radius} 0 1 0 ${c.x - radius} ${-c.y} A ${radius} ${radius} 0 1 0 ${c.x + radius} ${-c.y}`,
          points: placed
        };
      }
      return { d: samplePath(placed, true), points: placed };
    }
    case 'ARC': {
      const center = { x: Number(entity.center?.x) || 0, y: Number(entity.center?.y) || 0 };
      const radius = Number(entity.radius) || 0;
      const startAngle = Number(entity.startAngle) || 0;
      const endAngle = Number(entity.endAngle);
      if (!radius || !Number.isFinite(endAngle)) return null;
      const points = arcSamplePoints(center, radius, startAngle, endAngle);
      const placed = points.map(at);
      if (isIdentity(transform)) {
        const c = at(center);
        const x1 = c.x + radius * Math.cos(startAngle);
        const y1 = c.y + radius * Math.sin(startAngle);
        const x2 = c.x + radius * Math.cos(endAngle);
        const y2 = c.y + radius * Math.sin(endAngle);
        const largeArc = Math.abs(endAngle - startAngle) > Math.PI ? 1 : 0;
        const sweep = endAngle > startAngle ? 0 : 1; // DXF angles are CCW
        return {
          d: `M ${x1} ${-y1} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${x2} ${-y2}`,
          points: placed
        };
      }
      return { d: samplePath(placed), points: placed };
    }
    case 'SPLINE': {
      const points = splineSamplePoints(entity).map(at);
      const d = samplePath(points);
      return d ? { d, points } : null;
    }
    case 'ELLIPSE': {
      const points = ellipseSamplePoints(entity).map(at);
      const closed = (Number(entity.endAngle) || 0) - (Number(entity.startAngle) || 0) >= TAU - 1e-6;
      const d = samplePath(points, closed);
      return d ? { d, points } : null;
    }
    case 'TEXT':
    case 'MTEXT': {
      const entry = textEntry(entity, transform);
      return entry ? { d: entry, points: [{ x: entry.x, y: -entry.y }] } : null;
    }
    default:
      return null;
  }
};

/**
 * Generate drawing-contract SVG data from a DXF document: `{ viewBox,
 * layers }` where each layer carries path strings and text primitives,
 * styled from the file's own LAYER table. INSERT block references
 * flatten through their placement (nested blocks included, layer 0
 * inheriting the insert's layer); off layers stay out.
 * @param {File|string} source - DXF file object or DXF text
 * @param {Object} layerMapping - Optional layer to pen mapping { layerName: penTemplate }
 * @param {Object} defaultPen - Default pen for unmapped layers
 * @returns {Promise<Object|null>} - Object with viewBox and layers, null when unparseable
 */
export async function generateSvgData(source, layerMapping = {}, defaultPen = null) {
  const getDxfText = async () => {
    if (typeof source === 'string') return source;
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(source);
    });
  };

  try {
    const dxfText = await getDxfText();
    const parser = new DxfParser();
    const dxf = parser.parseSync(dxfText);

    if (!dxf || !dxf.entities) {
      throw new Error('Invalid DXF file');
    }
    const layerStyles = parseDxfLayerStyles(dxfText);

    const defaultPenSettings = defaultPen || {
      stroke: { color: 'currentColor', weight: 0.5, pattern: 'SOLID' }
    };

    const layers = new Map();
    const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

    const penStroke = (pen) => pen?.data?.stroke || pen?.stroke || {};

    const layerOf = (name) => {
      const key = name || '0';
      if (!layers.has(key)) {
        const declared = layerStyles.get(key) || null;
        const pen = layerMapping[key] || defaultPenSettings;
        const stroke = penStroke(pen);
        layers.set(key, {
          name: key,
          color: stroke.color && stroke.color !== 'currentColor'
            ? stroke.color
            : (declared?.color || stroke.color || 'currentColor'),
          weight: stroke.weight || declared?.weight || 0.5,
          dasharray: stroke.pattern
            ? (stroke.pattern === 'DASHED' ? '5,5' : stroke.pattern === 'DOTTED' ? '1,3' : 'none')
            : (declared?.dasharray || 'none'),
          paths: []
        });
      }
      return layers.get(key);
    };

    const trackPoints = (points = []) => {
      for (const point of points) {
        const x = Number(point?.x);
        const y = Number(point?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        bounds.minX = Math.min(bounds.minX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.maxY = Math.max(bounds.maxY, y);
      }
    };

    const walkEntity = (entity, transform, depth) => {
      if (!entity) return;
      if (entity.type === 'INSERT') {
        if (depth >= INSERT_DEPTH_LIMIT) return;
        const block = dxf.blocks?.[entity.name];
        if (!block?.entities?.length) return;
        const childTransform = composeTransform(transform, entity);
        const insertLayer = entity.layer || '0';
        for (const child of block.entities) {
          walkEntity(
            child.layer === '0' || !child.layer ? { ...child, layer: insertLayer } : child,
            childTransform,
            depth + 1
          );
        }
        return;
      }
      if (layerStyles.get(entity.layer || '0')?.off) return;
      const entry = entityEntry(entity, transform);
      if (!entry) return;
      trackPoints(entry.points);
      layerOf(entity.layer).paths.push(entry.d);
    };

    for (const entity of dxf.entities) {
      walkEntity(entity, IDENTITY_TRANSFORM, 0);
    }

    if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.maxX)) {
      return null;
    }

    const width = Math.max(bounds.maxX - bounds.minX, 1);
    const height = Math.max(bounds.maxY - bounds.minY, 1);

    return {
      viewBox: `${bounds.minX} ${-bounds.maxY} ${width} ${height}`,
      layers: [...layers.values()].filter(layer => layer.paths.length)
    };
  } catch {
    return null;
  }
}
