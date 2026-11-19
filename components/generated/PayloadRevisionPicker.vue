<template>
  <Button
    v-if="shown"
    :label="versionLabel"
    :icon="currentNumber == null ? 'pi pi-history' : undefined"
    text
    rounded
    size="small"
    severity="secondary"
    class="text-supporting"
    :aria-label="$t('revision.pickerLabel')"
    @click="event => revisionsPopover?.toggle(event)"
  />
  <Popover ref="revisionsPopover" @show="load">
    <div class="flex w-80 flex-col gap-1" data-revision-list>
      <ProgressSpinner v-if="loading" style="width: 1.5rem; height: 1.5rem" class="mx-auto my-2" />
      <small v-else-if="!revisions.length" class="m-0 py-2 text-center text-muted">{{ $t('revision.none') }}</small>
      <div
        v-for="(revision, index) in revisions"
        :key="String(revision._id)"
        class="flex flex-col gap-2 py-2"
        :class="index > 0 ? 'border-t border-solid border-[var(--p-content-border-color)]' : ''"
        :data-revision-number="revision.data?.number"
      >
        <div
          v-if="previewable(revision)"
          class="instance-preview-slot h-32 w-full overflow-hidden rounded-ui bg-subtle"
          data-revision-preview
        >
          <InstancePreviewMedia :entity="{ payload: frozenPayloadOf(revision) }" :type-id="type.id" />
        </div>
        <div class="flex min-w-0 items-center gap-2">
          <Tag :value="`v${revision.data?.number ?? '?'}`" class="shrink-0" />
          <div class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-body" :title="nameOf(revision)">{{ nameOf(revision) }}</span>
            <small class="truncate text-muted">
              <time v-if="revisionTime(revision)" :datetime="revision.data?.createdAt">{{ revisionTime(revision) }}</time>
              <span v-if="revisionActor(revision)"> · {{ revisionActor(revision) }}</span>
              <span v-if="restoredFromOf(revision) != null"> · {{ $t('revision.restoredFrom', { n: restoredFromOf(revision) }) }}</span>
            </small>
          </div>
          <Tag v-if="index === 0" :value="$t('revision.current')" severity="info" class="shrink-0" />
          <Button
            icon="pi pi-eye"
            text
            rounded
            size="small"
            severity="secondary"
            :aria-label="$t('revision.view')"
            :data-revision-view="revision.data?.number"
            @click="view(revision)"
          />
          <Button
            v-if="index > 0 && canRestore"
            icon="pi pi-undo"
            text
            rounded
            size="small"
            severity="secondary"
            :loading="restoring === String(revision._id)"
            :aria-label="$t('revision.restore')"
            :data-revision-restore="revision.data?.number"
            @click="restore(revision)"
          />
        </div>
      </div>
      <ReplacePayloadAction
        class="mt-1"
        :entity="entity"
        :type="type"
        @refresh="onReplaced"
      />
    </div>
  </Popover>
  <StandardDialog
    :visible="viewing"
    size="full"
    fill
    :show-default-footer="false"
    :title="nameOf(viewed)"
    :subtitle="viewed ? `v${viewed.data?.number ?? ''}` : ''"
    data-revision-dialog
    @update:visible="value => { viewing = value; if (!value) viewed = null; }"
  >
    <div class="flex h-[60vh] min-h-0 flex-col">
      <FilePayloadViewer v-if="viewSource?.renderable" :source="viewSource" variant="pane" class="min-h-0 flex-1" />
      <div v-else class="flex flex-1 items-center justify-center">
        <a :href="viewDownloadUrl" target="_blank" rel="noopener">
          <Button icon="pi pi-download" :label="$t('revision.download')" severity="secondary" outlined />
        </a>
      </div>
    </div>
  </StandardDialog>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import Popover from 'primevue/popover';
import ProgressSpinner from 'primevue/progressspinner';
import Tag from 'primevue/tag';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import FilePayloadViewer from '~/components/shared/FilePayloadViewer.vue';
import InstancePreviewMedia from '~/components/shared/InstancePreviewMedia.vue';
import ReplacePayloadAction from './ReplacePayloadAction.vue';
import { RENDERABLE_PREVIEW_MODES } from '#shared/ui-mapping/index.js';
import { instancePayloadFileUrl } from './file-preview-contract.js';
import { editorWriteGranted } from './file-surfaces.js';
import { useInstancesStore } from '~/stores/instances';

// The record's version surface (SPEC §24): lists the payload revisions
// of a revision-scoped file type, opens any revision read-only through
// its frozen bytes, and restores a prior revision — the frozen bytes
// re-enter through the revisioned payload channel as a new revision,
// behind the same write grant and authored-content law the replace
// affordance takes. The trigger states the current version and rides the
// payload preview corner; the popover carries the replace affordance for
// authored payloads.
const props = defineProps({
  entity: { type: Object, default: null },
  type: { type: Object, default: null }
});

const emit = defineEmits(['refresh']);

const { t, locale } = useI18n();
const toast = useToast();
const instances = useInstancesStore();

const revisionsPopover = ref(null);
const loading = ref(false);
const revisions = ref([]);
const restoring = ref('');
const viewing = ref(false);
const viewed = ref(null);

const instanceId = computed(() => String(props.entity?._id || props.entity?.id || ''));
const shown = computed(() => Boolean(props.type?.id && props.type?.payload && props.type?.revisions && instanceId.value));
// The trigger states the record's current version once the revision
// list resolves it; a record with no minted revisions keeps the neutral
// history glyph — no invented number.
const currentNumber = computed(() => revisions.value[0]?.data?.number ?? null);
const versionLabel = computed(() => (currentNumber.value != null ? `v${currentNumber.value}` : ''));
onMounted(() => { if (shown.value) load(); });

// The frozen payload reference (the wire payload block the revision
// minted) — the row's preview band and name resolve through it.
function frozenPayloadOf(revision) {
  return revision?.data?.snapshot?.payload || null;
}

function nameOf(revision) {
  return frozenPayloadOf(revision)?.name
    || revision?.identity?.name
    || `v${revision?.data?.number ?? ''}`;
}

function restoredFromOf(revision) {
  return revision?.data?.restoredFrom?.number ?? null;
}

function previewable(revision) {
  const payload = frozenPayloadOf(revision);
  const mode = props.type?.payload?.preview || 'attachment';
  return Boolean(payload?.fileId) && RENDERABLE_PREVIEW_MODES.includes(mode);
}

// The mint's acting principal (SPEC §24 stamp); the system principal
// renders by its label alone.
function revisionActor(revision) {
  const actor = revision.data?.actor || null;
  if (!actor) return '';
  if (actor.principalType === 'SYSTEM') return t('status.systemActor');
  return actor.label || '';
}

function revisionTime(revision) {
  const date = new Date(revision?.data?.createdAt || '');
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(locale.value, { dateStyle: 'short', timeStyle: 'short' });
}

const canWrite = computed(() => editorWriteGranted(props.type?.id, props.entity));

const canRestore = computed(() => canWrite.value && !(props.entity?.provenance?.sources || []).length);

async function load() {
  loading.value = true;
  try {
    const rows = await instances.listInstances('entity_revision', {
      typeId: props.type?.id,
      instanceId: instanceId.value,
      scope: props.type?.revisions
    }, { force: true });
    revisions.value = [...(rows || [])].sort((a, b) => (b.data?.number || 0) - (a.data?.number || 0));
  } catch {
    revisions.value = [];
  } finally {
    loading.value = false;
  }
}

// The frozen bytes preview through the same URL contract the record's
// own payload preview uses (the revision's primary attachment).
const viewSource = computed(() => {
  const revision = viewed.value;
  if (!revision) return null;
  const attachment = revision.attachments?.primary || null;
  const mode = props.type?.payload?.preview || 'attachment';
  return {
    mode,
    fileUrl: attachment?.fileId ? instancePayloadFileUrl(attachment) : '',
    attachment: {
      name: nameOf(revision),
      mime: attachment?.metadata?.mimeType || frozenPayloadOf(revision)?.mime || ''
    },
    renderable: Boolean(attachment?.fileId) && RENDERABLE_PREVIEW_MODES.includes(mode)
  };
});

const viewDownloadUrl = computed(() => (viewSource.value?.fileUrl ? `${viewSource.value.fileUrl}&download=1` : ''));

function view(revision) {
  viewed.value = revision;
  viewing.value = true;
}

// A replacement mints the next revision; the trigger and the list both
// refresh against the record's new version.
function onReplaced() {
  emit('refresh');
  load();
}

async function restore(revision) {
  const revisionId = String(revision._id);
  restoring.value = revisionId;
  try {
    // The payload transport stays online-only (PWA law), same as the
    // replace affordance.
    const updated = await $fetch(`/api/instances/${encodeURIComponent(props.type.id)}/${encodeURIComponent(instanceId.value)}/restore-revision`, {
      method: 'POST',
      body: { revisionId }
    });
    instances.notifyMutated(instances.canonicalTypeKey(props.type.id), instanceId.value, { snapshot: updated, reason: 'payload-restored' });
    toast.add({ severity: 'success', summary: t('common.success'), detail: `v${revision.data?.number ?? ''}`, life: 2500 });
    emit('refresh');
    await load();
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.statusMessage || '', life: 5000 });
  } finally {
    restoring.value = '';
  }
}
</script>
