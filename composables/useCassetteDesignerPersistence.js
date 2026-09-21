import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';
import { instancePayloadFileUrl } from '~/components/generated/file-preview.js';
import { isGeneratedSurfaceAction } from '~/components/generated/action-visibility.js';

// Cassette designer persistence over the unified instance contract: the
// OCCS document is the file payload (revisioned through the payload
// transport), blank-instance creation runs the compiled create action,
// and the designer template list reads the generic instance transport.
// The designer component stays transport-agnostic (`persist: false`);
// these adapters are the app-side binding, mirroring the sketch/text
// editor persistence adapters in file-surfaces.js.
export function useCassetteDesignerPersistence() {
  const instances = useInstancesStore();
  const authStore = useAuthStore();

  const CASSETTE_TYPE = 'cassette';
  const OCCS_MIME = 'application/perigram+occs';

  // Designer template shape: the wire DTO plus the parsed OCCS payload
  // document as `definition` (the shape CassetteDesignerV2's templateTree
  // reads). Payload-less instances pass through untouched — the designer
  // starts its blank graph tree for them.
  async function hydrateDefinition(entity = null) {
    if (!entity || entity.data?.definition || entity.definition) return entity;
    const url = instancePayloadFileUrl(entity.attachments?.primary);
    if (!url) return entity;
    try {
      const document = await $fetch(url, { responseType: 'json' });
      return document ? { ...entity, definition: document } : entity;
    } catch {
      return entity;
    }
  }

  async function listTemplates() {
    return await instances.listInstances(CASSETTE_TYPE, {}, { silent: true });
  }

  async function loadTemplate(id) {
    const dto = await instances.fetchInstance(CASSETTE_TYPE, String(id), { force: true });
    return dto ? await hydrateDefinition(dto) : null;
  }

  function createAction() {
    return authStore.actionManifest
      .filter(isGeneratedSurfaceAction)
      .find(action => action.actionKind === 'createInstance' && action.typeId === CASSETTE_TYPE)
      || null;
  }

  // Save: an existing target swaps its payload; a Save As (or unpersisted
  // blank) runs the compiled create action with the designer name, then
  // writes the payload onto the created instance.
  async function save({ id = '', saveAs = false, name = '', definition = {} } = {}) {
    let targetId = !saveAs && id ? String(id) : '';
    if (!targetId) {
      const action = createAction();
      if (!action) {
        throw new Error('No compiled create action for cassette');
      }
      const result = await instances.runAction({ actionId: action.id, data: { name } });
      const created = result?.entity || result?.created || result;
      targetId = String(created?._id || created?.id || '');
      if (!targetId) {
        throw new Error('Cassette creation returned no instance');
      }
    }
    const form = new FormData();
    form.append('file', new File([JSON.stringify(definition)], `${name || 'cassette'}.occs`, { type: OCCS_MIME }));
    const updated = await $fetch(
      `/api/instances/${CASSETTE_TYPE}/${encodeURIComponent(targetId)}/payload`,
      { method: 'PUT', body: form }
    );
    return { ...updated, _id: targetId };
  }

  return { hydrateDefinition, listTemplates, loadTemplate, save };
}
