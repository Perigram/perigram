import { h, ref, shallowRef, computed, reactive, watch, onMounted, onBeforeUnmount, nextTick, defineComponent } from 'vue';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Popover from 'primevue/popover';
import ScrollPanel from 'primevue/scrollpanel';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import Textarea from 'primevue/textarea';
import DesignerSurface from '~/components/shared/DesignerSurface.vue';
import DesignerWorkspace from '~/components/shared/DesignerWorkspace.vue';
import DrawingCanvas from '~/components/shared/DrawingCanvas.vue';
import InstanceSelect from '~/components/shared/InstanceSelect.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import InputNumber from 'primevue/inputnumber';
import { useInstancesStore } from '~/stores/instances';
import { useAuthStore } from '~/stores/auth';
import { hasPermissionGrant } from '#shared/access-control.js';
import { resolveTypeFeature } from '#shared/field-access-policies.js';
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
// compose from — the PrimeVue primitives plus the host designer chrome
// (surface frame, dock workspace, drawing canvas, instance select,
// standard dialog). Grows only by accepted need — each entry is a design
// system commitment to plugin authors.
//
// The pack resolves lazily: pack members' graphs cycle back through this
// module (DrawingCanvas → entity cards → instance-editor-action →
// file-surfaces → RemoteEditorSurface → here), and an eager object
// literal would read an unfinished module binding at eval time — the
// vite-node TDZ 500 (or an undefined frozen into the pack under the SSR
// transform). By mount time every module has finished evaluating.
let surfacePack = null;
function surfaceComponentPack() {
  surfacePack ||= Object.freeze({
    Button, Checkbox, Dialog, InputText, InputNumber, Message, Popover, ScrollPanel, Select, Tag, Textarea,
    DesignerSurface, DesignerWorkspace, DrawingCanvas, InstanceSelect, StandardDialog
  });
  return surfacePack;
}

const SURFACE_VUE = Object.freeze({ h, ref, shallowRef, computed, reactive, watch, onMounted, onBeforeUnmount, nextTick, defineComponent });

// Contract 1 mounts the base context; contract 2 (the editor-grade
// mount) adds queries, notify, and access beside it.
export function surfaceHostContext({ t, te, locale }, surfaceContract = 1, io = {}) {
  const base = Object.freeze({
    vue: SURFACE_VUE,
    components: surfaceComponentPack(),
    locale: Object.freeze({ t, te, locale: () => locale.value })
  });
  if (Number(surfaceContract) < 2) return base;
  return Object.freeze({
    ...base,
    queries: io.queries || null,
    records: io.records || null,
    notify: io.notify || (() => {}),
    access: io.access || { canWrite: () => false }
  });
}

// Cross-type instance reads over the generic transport (contract 2):
// the surface lists and loads records of any type the actor can read —
// the data-only replacement for editor-owned store access.
export function editorSurfaceQueries() {
  const instances = useInstancesStore();
  return Object.freeze({
    list: (typeId, params = {}) => instances.listInstances(instances.canonicalTypeKey(typeId), params, { silent: true }),
    get: (typeId, id) => instances.fetchInstance(instances.canonicalTypeKey(typeId), String(id), { force: true })
  });
}

// Cross-type record writes over the generic transport (contract 2): an
// editor that composes OTHER types' records (the cassette designer's
// profile templates) creates and updates them through the same instance
// transports — never a bespoke route.
export function editorSurfaceRecords() {
  const instances = useInstancesStore();
  return Object.freeze({
    create: (typeId, payload) => instances.createInstance(instances.canonicalTypeKey(typeId), payload),
    update: (typeId, id, payload) => instances.updateInstance(instances.canonicalTypeKey(typeId), id, payload)
  });
}

// Host notifications (contract 2): surfaces report save outcomes through
// the app's toast instead of inventing their own chrome.
export function surfaceNotify() {
  const toast = useToast();
  return notification => toast.add({
    severity: notification?.severity || 'info',
    summary: notification?.summary || '',
    detail: notification?.detail || '',
    life: notification?.life || 4000
  });
}

// Write-grant resolution (contract 2): the host owns permissions, so the
// surface asks instead of resolving grants itself. Without a grant the
// surface degrades to view-only.
export function editorSurfaceAccess(typeId) {
  const authStore = useAuthStore();
  const feature = resolveTypeFeature(typeId);
  return Object.freeze({
    canWrite: record => hasPermissionGrant({
      permissions: authStore.activePermissions,
      feature,
      level: 'write',
      entity: record,
      typeId
    })
  });
}

// The persistence callbacks every surface mount receives — the generic
// instance transports over the plugin type (SPEC §4 editor protocol):
// blank-create runs the type's compiled construct, documents ride the
// payload channel, identity renames ride the update transport, and
// (contract 2) `patch` writes record data through the generic update
// transport. This is the one home of that binding; editor modules never
// touch the API.
export function editorSurfacePersistence(typeId) {
  const instances = useInstancesStore();
  const authStore = useAuthStore();

  function basePersistence(record, mimeType = 'application/json') {
    return instancePayloadPersistence(record, typeId, mimeType);
  }

  return {
    async createBlank() {
      const action = authStore.actionManifest
        .filter(isGeneratedSurfaceAction)
        .find(candidate => candidate.actionKind === 'createInstance' && candidate.typeId === typeId);
      if (!action) throw new Error(`No compiled create action for ${typeId}`);
      // Blank means blank (SPEC §4 editor protocol): the instance enters
      // unnamed — naming is the type's identifier row or the rename
      // channel, never a create-time side channel.
      const result = await instances.runAction({ actionId: action.id, data: {} });
      const entity = createdEntity(action, result);
      const id = String(entity?._id || entity?.id || '');
      if (!id) throw new Error(`${typeId} creation returned no instance`);
      return entity;
    },
    async loadDocument(record, { mimeType = 'application/json' } = {}) {
      const url = instancePayloadFileUrl(record?.payload);
      if (!url) return null;
      return await basePersistence(record, mimeType).load().then(text => (text ? JSON.parse(text) : null));
    },
    async saveDocument(record, document, { fileName, mimeType = 'application/json' } = {}) {
      const text = typeof document === 'string' ? document : JSON.stringify(document ?? {});
      return await basePersistence(record, mimeType).save(text, fileName || `${typeId}.json`);
    },
    patch(record, body) {
      return instances.mutateDirect(instances.canonicalTypeKey(typeId), 'PATCH', {
        id: String(record?._id || ''),
        body,
        meta: { change: 'updated', reason: 'editor-update' }
      });
    },
    rename(record, name) {
      return basePersistence(record).rename(name);
    }
  };
}

export { isSupportedSurfaceContract };
