function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  error.statusCode = 400;
  throw error;
}

function normalizeItems(items) {
  if (!Array.isArray(items) || !items.length) badRequest('The nesting run has no parts to place');
  return items.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) badRequest(`Item ${index} is not a source part`);
    const sourceId = String(item.sourceId ?? '').trim();
    if (!sourceId) badRequest(`Item ${index} requires a sourceId`);
    const count = item.count == null || item.count === '' ? 1 : Number(item.count);
    if (typeof item.count === 'boolean' || !Number.isSafeInteger(count) || count < 1) {
      badRequest(`Item ${index} count must be a positive safe integer`);
    }
    if (!Array.isArray(item.parts) || !item.parts.length) badRequest(`Item ${index} requires polygon parts`);
    return { ...item, sourceId, sourceKey: String(item.sourceKey || sourceId), count };
  });
}

function normalizeCoordinates(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(point => Array.isArray(point) && point.length >= 2)
    .map(point => [Number(point[0]), Number(point[1])])
    .filter(point => Number.isFinite(point[0]) && Number.isFinite(point[1]));
}

function polygonArea(points = []) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i], b = points[(i + 1) % points.length];
    area += Number(a[0]) * Number(b[1]) - Number(b[0]) * Number(a[1]);
  }
  return Math.abs(area) / 2;
}

function normalizeSheetPolygon(value, width, height) {
  if (value && !Array.isArray(value) && typeof value === 'object') {
    const outer = normalizeCoordinates(value.outer || []);
    if (outer.length < 3 || polygonArea(outer) <= 0) badRequest('sheetPolygon.outer must be a valid polygon');
    const inner = (Array.isArray(value.inner) ? value.inner : []).map(normalizeCoordinates);
    return { outer, inner: inner.filter(ring => ring.length >= 3 && polygonArea(ring) > 0) };
  }
  const outer = normalizeCoordinates(value || []);
  if (outer.length >= 3 && polygonArea(outer) > 0) return { outer, inner: [] };
  return { outer:[[0,0],[width,0],[width,height],[0,height],[0,0]], inner:[] };
}

function buildRequest(items, input) {
  const width = Number(input.sheetWidth), height = Number(input.sheetHeight);
  const space = Number(input.space ?? 3);
  if (!Number.isFinite(width) || width <= 0) badRequest('sheetWidth must be finite and positive');
  if (!Number.isFinite(height) || height <= 0) badRequest('sheetHeight must be finite and positive');
  if (!Number.isFinite(space) || space < 0) badRequest('space must be finite and non-negative');
  let id = 0;
  const requestItems = [];
  for (const item of items) for (const part of item.parts) {
    const coords = normalizeCoordinates(part.coordinates);
    if (coords.length < 3 || polygonArea(coords) <= 0) continue;
    requestItems.push({
      id:id++,sourceId:item.sourceId,sourceKey:item.sourceKey,coords,
      handles:Array.isArray(part.handles) ? part.handles : [],
      sourceLayers:Array.isArray(part.sourceLayers) ? part.sourceLayers : [],count:item.count
    });
  }
  if (!requestItems.length) badRequest('No valid polygon parts were supplied for nesting');
  // One sheet per physical polygon part is the safe upper bound. A source
  // item can contain several polygons, so count parts rather than designs.
  const sheetCount = requestItems.reduce((sum, item) => sum + item.count, 0);
  if (!Number.isSafeInteger(sheetCount) || sheetCount < 1) badRequest('Nesting sheet count exceeds the safe integer limit');
  return {
    requestItems,
    params:{width,height,space,sheetCount,sheet_polygon:normalizeSheetPolygon(input.sheetPolygon,width,height)}
  };
}

function layoutResults(workerResult, requestItems, params) {
  const itemsById = new Map(requestItems.map(item => [String(item.id), {
    ...item,demand:item.count,shape:{type:'simple_polygon',data:item.coords}
  }]));
  const binsById = new Map((Array.isArray(workerResult.bins) ? workerResult.bins : []).map(bin => [String(bin.id),bin]));
  const layouts = workerResult.solution?.layouts || workerResult.layouts || [];
  return layouts.map(layout => {
    const placements = layout.placed_items || layout.items || [];
    const sourceItems = [...new Map(placements
      .map(placed => itemsById.get(String(placed.item_id ?? placed.itemId ?? placed.id ?? '')))
      .filter(Boolean).map(item => [String(item.id),item])).values()];
    const bin = binsById.get(String(layout.container_id ?? layout.bin_id ?? ''));
    return {...layout,...(sourceItems.length ? {sourceItems} : {}),sheetPolygon:bin?.shape?.data || params.sheet_polygon};
  });
}

function polygonIdentity(polygon) {
  const ring = points => Array.isArray(points) ? points.map(point =>
    point.map(value => Math.round(Number(value) * 1e6) / 1e6)) : [];
  return {outer:ring(polygon?.outer),inner:(polygon?.inner || []).map(ring)};
}

function groupLayouts(layouts) {
  const groups = new Map();
  for (const layout of layouts) {
    const placements = layout.placed_items || layout.items || [];
    const key = JSON.stringify({
      sheet:polygonIdentity(layout.sheetPolygon),
      sources:placements.map(placed => {
        const item = layout.sourceItems?.find(source =>
          String(source.id) === String(placed.item_id ?? placed.itemId ?? placed.id));
        return String(item?.sourceKey || item?.sourceId || '');
      }).sort()
    });
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key,{...layout,count:1,compositionKey:key});
  }
  return [...groups.values()];
}

function summarize(result, layouts, params) {
  const placedCount = layouts.reduce((sum, layout) => sum + (layout.placed_items || layout.items || []).length,0);
  const rawDensity = result.solution?.density ?? layouts.reduce((sum,layout) => sum + (Number(layout.density) || 0),0) / Math.max(layouts.length,1);
  const density = Number(rawDensity);
  const efficiency = Number.isFinite(density) ? Math.round((density <= 1 ? density * 100 : density) * 100) / 100 : 0;
  const area = Math.max(polygonArea(params.sheet_polygon.outer) -
    params.sheet_polygon.inner.reduce((sum,ring) => sum + polygonArea(ring),0),0);
  const remnantArea = area && layouts.length
    ? Math.max(area * layouts.length * (1 - Math.min(Math.max(efficiency / 100,0),1)),0) / 1e6 : 0;
  return {efficiency,sheetCount:layouts.length,remnantArea,placedCount};
}

export function createRuntime() {
  return {
    async execute(operationId, input = {}, {capabilities} = {}) {
      if (operationId !== 'nesting-solve') throw new Error(`Unsupported Nesting operation: ${operationId}`);
      if (!capabilities || typeof capabilities.call !== 'function') {
        throw new Error('Nesting requires the platform nesting.solve capability');
      }
      // The managed graph/construction task wraps its payload in the graph
      // invocation envelope; direct dispatch receives it as-is.
      const graphInvocation = input?.mode === 'preview' && input?.inputs && typeof input.inputs === 'object';
      const args = graphInvocation ? input.inputs : input;
      const items = normalizeItems(args.items);
      const {requestItems,params} = buildRequest(items,args);
      const workerInput = {
        items:requestItems.map(({id,sourceId,coords,handles,count}) => ({id,source_id:sourceId,coords,handles,count})),
        params
      };
      const result = await capabilities.call('nesting.solve',workerInput);
      if (result?.status === 'error') {
        const error = new Error(result.message || 'Nesting worker failed');
        error.status = 502;
        error.statusCode = 502;
        throw error;
      }
      const enriched = {
        ...result,items:requestItems.map(item => ({...item})),
        bins:Array.isArray(result?.bins) && result.bins.length ? result.bins : [{
          id:0,shape:{type:'polygon',data:params.sheet_polygon},stock:params.sheetCount
        }]
      };
      const layouts = layoutResults(enriched,requestItems,params);
      const solved = {layouts:groupLayouts(layouts),summary:summarize(enriched,layouts,params)};
      return graphInvocation ? {value:solved} : solved;
    }
  };
}
