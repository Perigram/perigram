// Pack composition (SPEC §21 requirements): the ordered list of mounted
// packs' declaration data and their requirements. Declaration-only by
// design — service bindings live in the pack mount modules
// (`server/packs/<id>/index.js`), and this module stays importable from
// anywhere (including the browser-safe cts-types composition) without
// pulling server feature graphs.
//
// `tech-drawing` has no service bindings: its types and system instances
// are served entirely by the generic instance machinery, so appearing in
// this list is its whole mount.
import { techDrawingPack } from '~/packages/tech-drawing/src/index.js';
import { cncPackContent } from '~/packages/domain-cnc/src/index.js';

export const mountedPackDeclarations = [
  techDrawingPack,
  {
    id: 'cnc',
    requires: ['tech-drawing'],
    types: cncPackContent.types
  }
];

// Framework-first, dependency order, one system id each. A missing
// requirement or an inter-pack id collision is a composition error —
// packs never shadow each other.
export function composeSystemDeclarations() {
  const byId = new Map(mountedPackDeclarations.map(pack => [pack.id, pack]));
  const ordered = [];
  const visiting = new Set();
  const visited = new Set();
  const visit = pack => {
    if (visited.has(pack.id)) return;
    if (visiting.has(pack.id)) {
      throw new Error(`pack requirement cycle at ${pack.id}`);
    }
    visiting.add(pack.id);
    for (const requirement of pack.requires || []) {
      if (!byId.has(requirement)) {
        throw new Error(`pack ${pack.id} requires unmounted pack ${requirement}`);
      }
      visit(byId.get(requirement));
    }
    visiting.delete(pack.id);
    visited.add(pack.id);
    ordered.push(pack);
  };
  for (const pack of mountedPackDeclarations) visit(pack);

  const declarations = [];
  const seen = new Set();
  for (const pack of ordered) {
    for (const declaration of pack.types || []) {
      if (seen.has(declaration.id)) {
        throw new Error(`duplicate system type id ${declaration.id} across packs (last: ${pack.id})`);
      }
      seen.add(declaration.id);
      declarations.push(declaration);
    }
  }
  return declarations;
}
