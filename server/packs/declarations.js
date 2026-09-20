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
    types: cncPackContent.types,
    editors: cncPackContent.editors
  }
];

// Framework-first, dependency order, each pack once. A missing requirement
// or a requirement cycle is a composition error — packs never shadow each
// other.
export function orderedMountedPacks() {
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
  return ordered;
}

// System type declarations: every mounted pack's types in dependency order,
// one system id each.
export function composeSystemDeclarations() {
  const declarations = [];
  const seen = new Set();
  for (const pack of orderedMountedPacks()) {
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

// Editor bindings (SPEC §21): `{ type, surface, modes }` records binding a
// file type to its authoring surface. Composed in the same dependency
// order as the type declarations; a malformed binding is a mount error,
// not a silently dropped editor.
export function composePackEditors() {
  const editors = [];
  for (const pack of orderedMountedPacks()) {
    for (const editor of pack.editors || []) {
      if (!editor?.type || !editor?.surface || !(editor.modes || []).length) {
        throw new Error(`pack ${pack.id} declares a malformed editor binding: ${JSON.stringify(editor)}`);
      }
      editors.push(Object.freeze({ type: editor.type, surface: editor.surface, modes: Object.freeze([...editor.modes]) }));
    }
  }
  return editors;
}
