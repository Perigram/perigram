// The geometry-base plugin's shared runtime: pure compute over the
// canonical geometry kinds, one runtime for browser and server targets.
// Node definitions derive from the listing's service declarations through
// the SDK's shared derivation — the listing is the one catalog (the
// documents-shared pattern); the package README
// (workers/geometry-base/README.md) owns the value contracts. The SDK
// import is build-time only: the shipped artifact is the self-contained
// bundle the listing names as its entry.
import listing from '../listing.json' with { type: 'json' };
import { nodeDefinitionFromService } from '../../../packages/plugin-sdk/src/node-contract.js';
import {
  makePoint3,
  makeVector3,
  vectorBetween,
  vectorAdd,
  vectorSubtract,
  vectorScale,
  vectorDot,
  vectorCross,
  vectorNorm,
  vectorNormalize,
  vectorAngle,
  pointTranslate,
  pointDistance,
  makePlane,
  planeNormal,
  planeDistance,
  makeFrame,
  frameFromPlane,
  frameOrigin,
  frameAxis,
  pointToLocal,
  pointToWorld,
  pointToVector,
  vectorToPoint
} from './math.mjs';

export const GEOMETRY_PROVIDER = 'plugin.geometry-base';
export const RUNTIME_ID = 'geometry-base';

const OPERATIONS = {
  'make-point3': input => makePoint3(input),
  'make-vector3': input => makeVector3(input),
  'vector-between': input => vectorBetween(input.from, input.to),
  'vector-add': input => vectorAdd(input.a, input.b),
  'vector-subtract': input => vectorSubtract(input.a, input.b),
  'vector-scale': input => vectorScale(input.v, input.factor),
  'vector-dot': input => vectorDot(input.a, input.b),
  'vector-cross': input => vectorCross(input.a, input.b),
  'vector-norm': input => vectorNorm(input.v),
  'vector-normalize': input => vectorNormalize(input.v),
  'vector-angle': input => vectorAngle(input.a, input.b),
  'point-translate': input => pointTranslate(input.point, input.offset),
  'point-distance': input => pointDistance(input.a, input.b),
  'make-plane': input => makePlane(input.origin, input.normal),
  'plane-normal': input => planeNormal(input.plane),
  'plane-distance': input => planeDistance(input.plane, input.point),
  'make-frame': input => makeFrame(input.origin, input.zAxis, input.xAxisHint ?? null),
  'frame-from-plane': input => frameFromPlane(input.plane),
  'frame-origin': input => frameOrigin(input.frame),
  'frame-axis': input => frameAxis(input.frame, input.axis),
  'point-to-local': input => pointToLocal(input.frame, input.point),
  'point-to-world': input => pointToWorld(input.frame, input.point),
  'point-to-vector': input => pointToVector(input.point),
  'vector-to-point': input => vectorToPoint(input.vector)
};

// Exact reinterpretations between the plugin's own kinds; each pairs with
// the operation of the same meaning. Fidelity vocabulary: the plugin-sdk
// port-compatibility contract.
export const CONVERSIONS = [
  {
    id: 'point3-to-vector3',
    from: { base: 'json', kind: 'geometry.point3', unit: 'mm' },
    to: { base: 'json', kind: 'geometry.vector3', unit: 'mm' },
    provider: GEOMETRY_PROVIDER,
    runtime: RUNTIME_ID,
    deterministic: true,
    fidelity: 'lossless'
  },
  {
    id: 'vector3-to-point3',
    from: { base: 'json', kind: 'geometry.vector3', unit: 'mm' },
    to: { base: 'json', kind: 'geometry.point3', unit: 'mm' },
    provider: GEOMETRY_PROVIDER,
    runtime: RUNTIME_ID,
    deterministic: true,
    fidelity: 'lossless'
  }
];

export function nodeDefinitions(source = listing, runtimeId = RUNTIME_ID, provider = GEOMETRY_PROVIDER) {
  const runtime = source.declarations?.runtimes?.find(item => item.id === runtimeId);
  if (!runtime) throw new Error(`Geometry runtime declaration is missing: ${runtimeId}`);
  return source.declarations.services
    .filter(service => service.execution?.runtime === runtimeId
      && service.execution.targets?.includes('browser')
      && service.palette?.visible !== false
      && service.palette?.group)
    .map(service => nodeDefinitionFromService(service, { provider, runtimeId }));
}

export function createRuntime() {
  return {
    execute(operationId, input = {}) {
      const operation = OPERATIONS[operationId];
      if (!operation) throw new Error(`Unsupported geometry-base operation: ${operationId}`);
      const graphInvocation = input?.mode === 'preview' && input?.inputs && typeof input.inputs === 'object';
      const value = operation(graphInvocation ? input.inputs : input);
      return graphInvocation ? { value } : value;
    },
    providers: [{
      provider: GEOMETRY_PROVIDER,
      definitions: nodeDefinitions(),
      conversions: CONVERSIONS
    }]
  };
}
