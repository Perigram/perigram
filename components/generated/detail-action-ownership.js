import { resolveFileSurface } from './file-surfaces.js';

// A type owns its detail action surface when an operational editor hosts
// it: the queue editor is entity-local, every file type resolves through
// the editor-bindings registry (see file-surfaces in the component
// README).
export function generatedInstanceDetailOwnsActionSurface(typeId = '') {
  return typeId === 'queue' || Boolean(resolveFileSurface(undefined, typeId));
}

export function generatedInstanceDetailConsumesAction(typeId = '', action = {}) {
  if (action?.relationMutation) return false;
  return generatedInstanceDetailOwnsActionSurface(typeId);
}
