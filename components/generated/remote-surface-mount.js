import { h, ref, shallowRef, computed, reactive, watch, onMounted, onBeforeUnmount, nextTick, defineComponent } from 'vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import { useInstancesStore } from '~/stores/instances';
import { useAuthStore } from '~/stores/auth';
import { isGeneratedSurfaceAction } from '~/components/generated/action-visibility.js';
import { createdEntity } from '~/components/generated/created-instance-open.js';
import { instancePayloadPersistence, instancePayloadFileUrl } from './file-surfaces.js';
import { isSupportedSurfaceContract } from '#shared/plugin-surfaces.js';

// The remote-surface mount (SPEC §Plugin marketplace, owner decision
// 2026-10-11 + the consistency law): everything a plugin-delivered editor
// module receives. The module's default export is a factory
// `createSurface(ctx) -> component`; the component's props are the
// data-only mount — `{ record, persistence }`. The module never imports
// vue or the component library (the SDK harness enforces the import
// graph): the host injects its own runtime and its vetted primitives, so
// every plugin editor runs on the app's Vue, components, tokens, and
// locale.

// The vetted primitive pack: the component vocabulary a surface may
// compose from. Grows only by accepted need — each entry is a design
// system commitment to plugin authors.
const SURFACE_COMPONENT_PACK = Object.freeze({ Button, Dialog, InputText, Message, Select });

const SURFACE_VUE = Object.freeze({ h, ref, shallowRef, computed, reactive, watch, onMounted, onBeforeUnmount, nextTick, defineComponent });

export function surfaceHostContext({ t, te, locale }) {
  return Object.freeze({
    vue: SURFACE_VUE,
    components: SURFACE_COMPONENT_PACK,
    locale: Object.freeze({ t, te, locale: () => locale.value })
  });
}

// The persistence callbacks every surface mount receives — the generic
// instance transports over the plugin type (SPEC §4 editor protocol):
// blank-create runs the type's compiled construct, documents ride the
// payload channel, identity renames ride the update transport. This is
// the one home of that binding; editor modules never touch the API.
export function editorSurfacePersistence(typeId) {
  const instances = useInstancesStore();
  const authStore = useAuthStore();

  function basePersistence(record, mimeType = 'application/json') {
    return instancePayloadPersistence(record, typeId, mimeType);
  }

  return {
    async createBlank({ name = '' } = {}) {
      const action = authStore.actionManifest
        .filter(isGeneratedSurfaceAction)
        .find(candidate => candidate.actionKind === 'createInstance' && candidate.typeId === typeId);
      if (!action) throw new Error(`No compiled create action for ${typeId}`);
      const result = await instances.runAction({ actionId: action.id, data: { name } });
      const entity = createdEntity(action, result);
      const id = String(entity?._id || entity?.id || '');
      if (!id) throw new Error(`${typeId} creation returned no instance`);
      return entity;
    },
    async loadDocument(record, { mimeType = 'application/json' } = {}) {
      const url = instancePayloadFileUrl(record?.attachments?.primary);
      if (!url) return null;
      return await basePersistence(record, mimeType).load().then(text => (text ? JSON.parse(text) : null));
    },
    async saveDocument(record, document, { fileName, mimeType = 'application/json' } = {}) {
      const text = typeof document === 'string' ? document : JSON.stringify(document ?? {});
      return await basePersistence(record, mimeType).save(text, fileName || `${typeId}.json`);
    },
    rename(record, name) {
      return basePersistence(record).rename(name);
    }
  };
}

export { isSupportedSurfaceContract };
