import { h, ref, shallowRef, computed, reactive, watch, onMounted, onBeforeUnmount, nextTick, defineComponent, Teleport } from 'vue';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import ColorPicker from 'primevue/colorpicker';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';
import Popover from 'primevue/popover';
import ScrollPanel from 'primevue/scrollpanel';
import Select from 'primevue/select';
import SelectButton from 'primevue/selectbutton';
import SpeedDial from 'primevue/speeddial';
import Tag from 'primevue/tag';
import Textarea from 'primevue/textarea';
import Toolbar from 'primevue/toolbar';
import Tree from 'primevue/tree';
import DesignerSurface from '~/components/shared/DesignerSurface.vue';
import DesignerWorkspace from '~/components/shared/DesignerWorkspace.vue';
import DrawingCanvas from '~/components/shared/DrawingCanvas.vue';
import Scene3DViewer from '~/components/shared/Scene3DViewer.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';
import InstanceSelect from '~/components/shared/InstanceSelect.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import InputNumber from 'primevue/inputnumber';
import IftaLabel from 'primevue/iftalabel';
import Divider from 'primevue/divider';
import { useInstancesStore } from '~/stores/instances';
import { onInstanceChanged } from '#utils/instance-events.js';
import { openInstanceInWorkspace } from '#utils/instance-workspace-open.js';
import { instancePayloadPersistence, instancePayloadFileUrl, runBlankFileConstruct, editorWriteGranted } from './file-surfaces.js';
import { renderMarkdown } from '#shared/markdown.js';
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
// module (DrawingCanvas → entity cards → InstanceSelect → RefRowActions →
// file-surfaces → RemoteEditorSurface → here), and an eager object
// literal would read an unfinished module binding at eval time — the
// vite-node TDZ 500 (or an undefined frozen into the pack under the SSR
// transform). By mount time every module has finished evaluating.
let surfacePack = null;
function surfaceComponentPack() {
  surfacePack ||= Object.freeze({
    Button, Checkbox, ColorPicker, Column, DataTable, Dialog, Divider, InputText, InputNumber, IftaLabel, Message, Popover, ProgressSpinner, ScrollPanel, Select, SelectButton, SpeedDial, Tag, Textarea, Toolbar, Tree,
    DesignerSurface, DesignerWorkspace, DrawingCanvas, Scene3DViewer, TraceChain, InstanceInlineRef, InstanceSelect, StandardDialog
  });
  return surfacePack;
}

const SURFACE_VUE = Object.freeze({ h, ref, shallowRef, computed, reactive, watch, onMounted, onBeforeUnmount, nextTick, defineComponent, Teleport });

// Contract 1 mounts the base context; contract 2 (the editor-grade
// mount) adds queries, notify, and access beside it; contract 3 (the
// capability mount, owner decision 2026-10-17) adds sync and upload;
// contract 4 (the navigation mount, owner decision 2026-10-19) adds
// open. The base context carries the host's markdown read pipeline
// (`renderMarkdown`, the single marked+DOMPurify+pele home — mermaid
// fences render as diagrams): surfaces receive it instead of vendoring
// marked/dompurify/pele (the never-vendor law).
export function surfaceHostContext({ t, te, locale }, surfaceContract = 1, io = {}) {
  const base = Object.freeze({
    vue: SURFACE_VUE,
    components: surfaceComponentPack(),
    locale: Object.freeze({ t, te, locale: () => locale.value }),
    renderMarkdown
  });
  if (Number(surfaceContract) < 2) return base;
  const editorGrade = Object.freeze({
    ...base,
    queries: io.queries || null,
    records: io.records || null,
    notify: io.notify || (() => {}),
    access: io.access || { canWrite: () => false }
  });
  if (Number(surfaceContract) < 3) return editorGrade;
  const capability = Object.freeze({
    ...editorGrade,
    sync: io.sync || null,
    upload: io.upload || null
  });
  if (Number(surfaceContract) < 4) return capability;
  return Object.freeze({
    ...capability,
    open: io.open || { instance: () => false }
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
// editor that composes OTHER types' records creates, updates, and deletes
// them through the same instance transports.
export function editorSurfaceRecords() {
  const instances = useInstancesStore();
  return Object.freeze({
    create: (typeId, payload) => instances.createInstance(instances.canonicalTypeKey(typeId), payload),
    update: (typeId, id, payload) => instances.updateInstance(instances.canonicalTypeKey(typeId), id, payload),
    delete: (typeId, id) => {
      const typeKey = instances.canonicalTypeKey(typeId);
      return instances.removeInstance(typeKey, String(id), { typeId: typeKey });
    }
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
  return Object.freeze({
    canWrite: record => editorWriteGranted(typeId, record)
  });
}

// Workspace navigation (contract 4, owner decision 2026-10-19): the
// workspace owns tabs, so a surface that needs another record opened
// asks the host instead of navigating. Same seam the generated screens
// ride — a mounted home workspace opens the pane tab immediately,
// otherwise the app navigates home and the request lands on mount.
export function editorSurfaceOpen() {
  return Object.freeze({
    instance: ({ typeId = '', instanceId = '' } = {}) =>
      openInstanceInWorkspace({ typeId, instanceId })
  });
}

// Record-change reconciliation (contract 3, owner decision 2026-10-17):
// the same instance-change bridge the in-app editors ride (SPEC UI
// client sync), scoped to the mounted record. Remote saves and renames
// arrive as callbacks — a clean editor reloads, a dirty one raises its
// refresh affordance. The surface's own publications are skipped
// host-side (the persistence origin token): a surface never sees its own
// echoes.
export function editorSurfaceSync(typeId, recordGetter = () => null) {
  const ownOriginOf = id => `persistence:${typeId}:${id}`;
  return Object.freeze({
    onRecordChanged: callback => onInstanceChanged(detail => {
      const record = recordGetter();
      const id = String(record?._id || record?.id || '');
      if (!id || String(detail.id || '') !== id) return;
      const type = String(detail.type || '').replace(/_/g, '-');
      if (type && type !== String(typeId).replace(/_/g, '-')) return;
      if (detail.origin && detail.origin === ownOriginOf(id)) return;
      callback(detail);
    })
  });
}

// Asset upload through the host file channel (contract 3): the surface
// hands the host a Blob (or File), the host stores it with the actor's
// tenancy metadata and returns the stored ref — the module never touches
// the API. Documents belong to `persistence.saveDocument`; this channel
// is for assets the document references.
export function editorSurfaceUpload() {
  return Object.freeze({
    file: async (input, { fileName } = {}) => {
      const name = String(fileName || input?.name || 'asset');
      const blob = input instanceof Blob ? input : new Blob([input]);
      const form = new FormData();
      form.append('file', input instanceof File ? input : new File([blob], name), name);
      return await $fetch('/api/files/upload', { method: 'POST', body: form });
    }
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

  function basePersistence(record, mimeType = 'application/json') {
    return instancePayloadPersistence(record, typeId, mimeType);
  }

  return {
    async createBlank() {
      // Blank means blank (SPEC §4 editor protocol): the instance enters
      // unnamed — naming is the type's identifier row or the rename
      // channel, never a create-time side channel. The construct core
      // single-homes in file-surfaces.
      return await runBlankFileConstruct(typeId);
    },
    async loadDocument(record, { mimeType = 'application/json', raw = false } = {}) {
      const url = instancePayloadFileUrl(record?.payload);
      if (!url) return null;
      const text = await basePersistence(record, mimeType).load();
      if (!text) return null;
      // Text payloads (markdown documents, CSV tables) are the document
      // itself — `raw` hands the text back unparsed.
      if (raw || mimeType.startsWith('text/')) return text;
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
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
