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
import { techDrawingPack } from '#packages/tech-drawing/src/index.js';
import { documentsPack } from '#packages/documents/src/index.js';
import { facadePackContent } from '#packages/facade/src/index.js';

export const mountedPackDeclarations = [
  documentsPack,
  techDrawingPack,
  {
    id: 'facade',
    requires: ['tech-drawing', 'documents'],
    types: facadePackContent.types,
    editors: facadePackContent.editors,
    services: facadePackContent.services
  }
];

// Registered pack services (SPEC §8/§21), composed in mount order: the
// one service list every `packServices` consumer — the process runtime's
// projected domain, the admin domain route, the designer — resolves
// through, so a pack registration reaches every surface without a
// per-surface import.
export function composePackServices(packs = orderedMountedPacks()) {
  const services = [];
  for (const pack of packs) {
    for (const service of pack.services || []) {
      if (service?.id && service.command) services.push(service);
    }
  }
  return services;
}

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
// not a silently dropped editor. Editor bindings are file-type contracts:
// the bound type must be declared by a mounted pack and carry the `file`
// class (payload-bearing) — a binding for a party/group/process type is a
// mount error, enforced here at the serving seam before the editor list
// reaches the organization type view. The pack list is a parameter so the
// guard is testable without mutating the frozen mount.
export function composePackEditors(packs = orderedMountedPacks()) {
  const declarations = new Map(packs.flatMap(pack => (pack.types || []).map(declaration => [declaration.id, declaration])));
  const editors = [];
  for (const pack of packs) {
    for (const editor of pack.editors || []) {
      if (!editor?.type || !editor?.surface || !(editor.modes || []).length) {
        throw new Error(`pack ${pack.id} declares a malformed editor binding: ${JSON.stringify(editor)}`);
      }
      const declaration = declarations.get(editor.type);
      if (!declaration) {
        throw new Error(`pack ${pack.id} binds an editor for type ${editor.type}, which no mounted pack declares`);
      }
      if (declaration.class !== 'file') {
        throw new Error(`pack ${pack.id} binds an editor for type ${editor.type} of class ${declaration.class} — editor bindings require file types`);
      }
      editors.push(Object.freeze({ type: editor.type, surface: editor.surface, modes: Object.freeze([...editor.modes]) }));
    }
  }
  return editors;
}
