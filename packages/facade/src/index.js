// Facade domain plug-in (SPEC §21): the browser-safe declaration data of
// the facade production domain — cassettes (OCCS files with the cassette
// designer), sheet designs, facade designs, the nesting solver service,
// and the pack's command/event contracts. `server/packs/facade` binds
// these declarations to server services.
//
// This package was mislabeled "domain-cnc" by an earlier agent session;
// its legacy entity/workflow tables were deleted with that misnaming.
// What remains here is the whole of the facade domain in the type system.
import { facadeCommands } from './commands.js';
import { facadeEvents } from './events.js';

export {
  facadePackContent,
  facadeFileTypes,
  facadeEditors,
  facadeServices,
  facadeAttachmentKinds
} from './pack.js';
export { facadeArtifactConversions } from './artifact-conversions.js';
export { getArtifactConversion } from './artifact-conversions.js';
export { facadeCommands } from './commands.js';
export { facadeEvents } from './events.js';

// The pack's server-side domain slice: command definitions (the effect
// runtime resolves them by id), trigger events, and the service identity
// table billing/gating reads. Never an entity catalog — the CTS registry
// view is the catalog.
export const facadeDomain = {
  id: 'facade',
  label: 'Facade fabrication',
  commands: facadeCommands,
  events: facadeEvents,
  // Construction contracts (SPEC §21): the executable construction modes
  // the registry capability binding verifies against registered handlers.
  // cassette-design constructs three ways — uploaded DXF (the payload
  // protocol with extraction), baked from an OCCS template, converted
  // from a dxf-source instance. A bare generic create would produce a
  // design with no geometry, so it is not offered.
  construction: {
    'cassette-design': { modes: ['upload', 'bake', 'convertDxf'] }
  },
  serviceContracts: {
    nesting: {
      service: 'nesting',
      label: 'Nesting service',
      inputs: [],
      outputs: [],
      actions: [],
      triggers: []
    },
    artifacts: {
      service: 'artifacts',
      label: 'Attachments service',
      inputs: [],
      outputs: [],
      actions: ['convertArtifact'],
      triggers: []
    },
    cassettes: {
      service: 'cassettes',
      label: 'Cassette template service',
      inputs: [],
      outputs: [],
      actions: ['saveCassetteTemplate'],
      triggers: []
    }
  }
};
