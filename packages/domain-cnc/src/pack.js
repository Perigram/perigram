// The CNC pack's declaration content (SPEC §21): browser-safe data only —
// file types with editors, the nesting service registration, attachment
// kinds. `server/packs/cnc` binds these declarations to services; the
// framework registry and the client type system consume the data.
//
// This is the whole of what the CNC domain means in the type system:
// cassette (OCCS file edited by the cassette designer), sheet design,
// facade design, and the nesting solver. Everything else that once was
// `domain-cnc` is either framework machinery or legacy app surface pending
// deletion.

export const cncFileTypes = [
  {
    id: 'cassette',
    class: 'file',
    scope: 'system',
    version: 1,
    payload: {
      mime: 'application/perigram+occs',
      accept: ['.occs'],
      byteLimit: 10 * 1024 * 1024
    },
    fields: {
      name: { base: 'string' }
    },
    revisions: 'geometry',
    render: { label: 'Cassette', icon: 'pi pi-box' },
    operators: {
      edit: { id: 'edit', species: 'mutate', input: { base: 'ref', accepts: ['cassette'] } }
    }
  },
  {
    id: 'sheet-design',
    class: 'file',
    scope: 'system',
    version: 1,
    fields: {
      geometry: { base: 'json' },
      parts: { base: 'list', itemType: { base: 'ref', accepts: ['cassette'] }, nullable: true }
    },
    revisions: 'geometry',
    render: { label: 'Sheet design', icon: 'pi pi-th-large' }
  },
  {
    id: 'facade-design',
    class: 'file',
    scope: 'system',
    version: 1,
    payload: {
      mime: 'model/gltf-binary',
      accept: ['.glb', '.gltf'],
      byteLimit: 100 * 1024 * 1024
    },
    fields: {
      name: { base: 'string' }
    },
    render: { label: 'Facade design', icon: 'pi pi-building' }
  }
];

// Editors bound to file types: which authoring surface opens for a type's
// payload. The surfaces themselves are existing designer components; the
// binding is pack data.
export const cncEditors = [
  { type: 'cassette', surface: 'cassette-designer', modes: ['create', 'edit'] },
  { type: 'facade-design', surface: 'facade-designer', modes: ['create', 'edit'] },
  { type: 'sheet-design', surface: 'sheet-design-preview', modes: ['view'] }
];

// Registered services (SPEC §8 s species): the nesting solver is a pure
// V -> V service executed by the task runtime under 'nesting.solve'.
export const cncServices = [
  {
    id: 'nesting.solve',
    species: 'service',
    task: 'nesting.solve',
    signature: {
      input: { base: 'record', fields: {
        polygons: { base: 'list', itemType: { base: 'json' } },
        sheet: { base: 'record', fields: {
          width: { base: 'quantity', unit: 'mm' },
          length: { base: 'quantity', unit: 'mm' }
        } }
      } },
      output: { base: 'json' }
    },
    render: { label: 'Nesting solver', icon: 'pi pi-compass' }
  }
];

// Payload upload kinds for the pack's file types.
export const cncAttachmentKinds = {
  OCCS_SOURCE: {
    kind: 'OCCS_SOURCE',
    bucket: 'cassettes',
    mimeType: 'application/perigram+occs',
    preview: { mode: 'download' },
    creation: { mode: 'upload', accept: '.occs,application/perigram+occs' },
    editor: { mode: 'cassette-designer' },
    file: { extensions: ['.occs'], mimeTypes: ['application/perigram+occs'], maxBytes: 10 * 1024 * 1024 }
  }
};

export const cncPackContent = {
  id: 'cnc',
  label: 'CNC fabrication',
  types: cncFileTypes,
  editors: cncEditors,
  services: cncServices,
  attachmentKinds: cncAttachmentKinds
};
