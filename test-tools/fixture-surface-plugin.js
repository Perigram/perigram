// Test/E2E seam for plugin-delivered surfaces (SPEC §Plugin marketplace,
// owner decision 2026-10-11 + M7): a fixture plugin whose editor and
// preview surfaces exercise the whole mount path — publish, install,
// endpoint-resolved module URL, loader, host context, persistence
// callbacks, and the read-only preview mount — with zero app-side code
// for its surfaces.
export const FIXTURE_SURFACE_PLUGIN_ID = 'fx-surface';

const FIXTURE_TYPE_ID = 'fx-surface-note';
const FIXTURE_SURFACE_ID = 'fx-surface-editor';
const FIXTURE_PREVIEW_ID = 'fx-surface-preview';

export function fixtureSurfacePluginListing() {
  return {
    pluginId: FIXTURE_SURFACE_PLUGIN_ID,
    name: 'Fixture Surface Plugin',
    description: 'E2E fixture: plugin-delivered editor and preview surfaces',
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
      surfaces: [
        { id: FIXTURE_SURFACE_ID, module: `/surfaces/${FIXTURE_SURFACE_ID}.mjs`, surfaceContract: 1 },
        { id: FIXTURE_PREVIEW_ID, module: `/surfaces/${FIXTURE_PREVIEW_ID}.mjs`, surfaceContract: 1, kind: 'preview' }
      ],
      previews: [{ type: FIXTURE_TYPE_ID, surface: FIXTURE_PREVIEW_ID }]
    }
  };
}

export const FIXTURE_SURFACE_TYPE_ID = FIXTURE_TYPE_ID;
export const FIXTURE_SURFACE_MODULE_PATH = `/surfaces/${FIXTURE_SURFACE_ID}.mjs`;
export const FIXTURE_PREVIEW_MODULE_PATH = `/surfaces/${FIXTURE_PREVIEW_ID}.mjs`;

// The surface module the fixture serves: a factory over the host context
// (no vue/primevue imports — the mount injects them), rendering the
// opened record and saving a document through the persistence callbacks.
// E2E serves this source by intercepting the module's same-origin proxy
// URL browser-side.
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
        h('span', { class: 'fx-surface-record' }, props.record?.name || ''),
        h(components.Button, { label: t('common.save'), onClick: save }),
        status.value ? h('span', { class: 'fx-surface-status' }, status.value) : null
      ]);
    }
  };
}
`;

// The preview module (M7): read-only over `{ record, payload }` — the
// host resolves the payload document; the module renders it and never
// receives persistence or queries.
export const FIXTURE_PREVIEW_MODULE_SOURCE = `
export default function createSurface({ vue }) {
  const { h } = vue;
  return {
    name: 'FxSurfacePreview',
    props: {
      record: { type: Object, default: null },
      payload: { type: Object, default: null }
    },
    setup(props) {
      return () => h('div', { class: 'fx-surface-preview' }, [
        h('span', { class: 'fx-surface-preview-record' }, props.record?.name || ''),
        h('span', { class: 'fx-surface-preview-payload' }, props.payload?.note || '')
      ]);
    }
  };
}
`;
