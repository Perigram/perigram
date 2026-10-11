// Test/E2E seam for plugin-delivered editor surfaces (SPEC §Plugin
// marketplace, owner decision 2026-10-11): a fixture plugin whose trivial
// editor surface exercises the whole mount path — publish, install,
// endpoint-resolved module URL, loader, host context, persistence
// callbacks — with zero app-side code for its surface.
export const FIXTURE_SURFACE_PLUGIN_ID = 'fx-surface';

const FIXTURE_TYPE_ID = 'fx-surface-note';
const FIXTURE_SURFACE_ID = 'fx-surface-editor';

export function fixtureSurfacePluginListing() {
  return {
    pluginId: FIXTURE_SURFACE_PLUGIN_ID,
    name: 'Fixture Surface Plugin',
    description: 'E2E fixture: a plugin-delivered editor surface',
    version: '1',
    declarations: {
      types: [{
        id: FIXTURE_TYPE_ID,
        class: 'file',
        name: 'Fixture Surface Note',
        fields: { name: { base: 'string', identifier: true } },
        payload: { mime: 'application/json', creation: ['editor'] },
        revisions: 'document'
      }],
      services: [{
        id: 'noop',
        label: 'No-op',
        signature: { input: { ok: 'boolean' }, output: { ok: 'boolean' } },
        mode: 'endpoint'
      }],
      editors: [{ type: FIXTURE_TYPE_ID, surface: FIXTURE_SURFACE_ID, modes: ['create', 'edit'] }],
      surfaces: [{ id: FIXTURE_SURFACE_ID, module: `/surfaces/${FIXTURE_SURFACE_ID}.mjs`, surfaceContract: 1 }]
    }
  };
}

export const FIXTURE_SURFACE_TYPE_ID = FIXTURE_TYPE_ID;
export const FIXTURE_SURFACE_MODULE_PATH = `/surfaces/${FIXTURE_SURFACE_ID}.mjs`;

// The surface module the fixture serves: a factory over the host context
// (no vue/primevue imports — the mount injects them), rendering the
// opened record and saving a document through the persistence callbacks.
// E2E serves this source by intercepting the module URL.
export const FIXTURE_SURFACE_MODULE_SOURCE = `
export default function createSurface({ vue, components, locale }) {
  const { h, ref } = vue;
  const t = locale.t;
  return {
    name: 'FxSurfaceEditor',
    props: {
      record: { type: Object, default: null },
      persistence: { type: Object, default: null }
    },
    setup(props) {
      const status = ref('');
      async function save() {
        await props.persistence.saveDocument(props.record, { note: 'fixture' }, { fileName: 'fixture.json' });
        status.value = t('common.save');
      }
      return () => h('div', { class: 'fx-surface-editor' }, [
        h('span', { class: 'fx-surface-record' }, props.record?.identity?.name || ''),
        h(components.Button, { label: t('common.save'), onClick: save }),
        status.value ? h('span', { class: 'fx-surface-status' }, status.value) : null
      ]);
    }
  };
}
`;
