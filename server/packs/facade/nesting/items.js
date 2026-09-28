// The `nesting.items` service handler: cassette-design references →
// nesting job items. The baked geometry (`data.geometry.nestingPolygons`)
// is read once here, server-side — the graph never authors paths into
// stored json. Output items carry the exact item shape the
// `nesting.solve` signature declares.
import { createError } from 'h3';
import { instanceServiceResolver } from '../../../features/instances/service.js';
import { toInstanceRefs } from '../refs.js';

export async function buildNestingItems({ parameters = {} } = {}) {
  const designRefs = toInstanceRefs(parameters.designs, ['cassette-design']);
  if (!designRefs.length) {
    throw createError({ statusCode: 400, message: 'Nesting items require cassette-design references' });
  }

  const service = instanceServiceResolver('cassette-design');
  const items = [];
  for (const ref of designRefs) {
    const design = await service.getById(ref.id);
    if (!design) {
      throw createError({ statusCode: 400, message: `Cassette design ${ref.id} not found` });
    }
    const polygons = design.data?.geometry?.nestingPolygons || design.data?.geometry?.polygons || [];
    if (!polygons.length) {
      throw createError({ statusCode: 400, message: `Cassette design ${ref.id} carries no baked geometry` });
    }
    const polygonParts = polygons
      .filter(part => Array.isArray(part?.coordinates) && part.coordinates.length >= 3)
      .map(part => ({ coordinates: part.coordinates }));
    if (!polygonParts.length) {
      throw createError({ statusCode: 400, message: `Cassette design ${ref.id} bakes no closed nesting contour` });
    }
    items.push({
      cassetteId: String(design._id),
      polygonParts,
      count: 1
    });
  }
  return items;
}
