<template>
  <span
    v-if="attachments.length || refs.length"
    :class="singleLine
      ? 'inline-flex max-w-full min-w-0 flex-nowrap items-center gap-1 overflow-hidden align-middle'
      : ['flex max-w-full flex-col gap-1', ownMessage ? 'items-end' : 'items-start']"
    :data-testid="singleLine ? 'chat-attachment-summary' : 'chat-attachments'"
  >
    <template v-if="singleLine">
      <i :class="summaryIcon" class="shrink-0 scale-90 text-muted" aria-hidden="true" />
      <span v-if="summaryLabel" class="min-w-0 truncate text-inherit">{{ summaryLabel }}</span>
      <span v-if="summaryOverflow > 0" class="shrink-0 text-muted">+{{ summaryOverflow }}</span>
    </template>
    <template v-else>
      <span
        v-if="mediaItems.length > 1"
        :class="['flex w-full max-w-80 gap-1', ownMessage ? 'flex-row-reverse' : '']"
        data-testid="chat-attachment-gallery"
      >
        <span
          v-for="(column, columnIndex) in masonryColumns"
          :key="columnIndex"
          class="flex min-w-0 flex-1 flex-col justify-end gap-1"
          data-testid="chat-masonry-column"
        >
          <template v-for="item in column" :key="item.kind === 'instance' ? `${item.ref.type}-${item.ref.id}` : item.attachment.fileId">
            <span
              v-if="item.kind === 'instance'"
              class="block w-full overflow-hidden rounded-ui border border-content-border"
            >
              <InstanceInlineRef v-bind="previewRefProps(item.ref)" />
            </span>
            <span v-else class="block w-full overflow-hidden rounded-ui">
              <button
                type="button"
                class="block w-full cursor-zoom-in bg-transparent"
                :aria-label="$t('support.attachmentPreview', { name: item.attachment.name || '' })"
                @click="previewAttachment = item.attachment"
              >
                <img class="w-full rounded-ui" :src="url(item.attachment)" :alt="item.attachment.name || ''">
              </button>
            </span>
          </template>
        </span>
      </span>
      <span
        v-else-if="mediaItems.length === 1 && mediaItems[0].kind === 'instance'"
        class="block w-full max-w-80 overflow-hidden rounded-ui border border-content-border"
      >
        <InstanceInlineRef v-bind="previewRefProps(mediaItems[0].ref)" />
      </span>
      <button
        v-else-if="mediaItems.length === 1 && mediaItems[0].kind === 'image'"
        type="button"
        class="block max-w-full cursor-zoom-in rounded-ui bg-transparent p-0"
        :aria-label="$t('support.attachmentPreview', { name: mediaItems[0].attachment.name || '' })"
        @click="previewAttachment = mediaItems[0].attachment"
      >
        <img class="h-auto max-h-64 max-w-full rounded-ui" :src="url(mediaItems[0].attachment)" :alt="mediaItems[0].attachment.name || ''">
      </button>
      <span
        v-if="chipRefs.length"
        :class="['flex max-w-80 flex-wrap gap-1', ownMessage ? 'justify-end' : 'justify-start']"
        data-testid="chat-instance-refs"
      >
        <InstanceInlineRef
          v-for="ref in chipRefs"
          :key="`${ref.type}-${ref.id}`"
          v-bind="chipRefProps(ref)"
        />
      </span>
      <video
        v-for="attachment in videos"
        :key="attachment.fileId"
        :src="url(attachment)"
        controls
        preload="metadata"
        playsinline
        class="min-w-0 max-h-64 max-w-full w-72 rounded-ui"
        @play="onMediaPlay($event, attachment)"
      />
      <audio
        v-for="attachment in audio"
        :key="attachment.fileId"
        :src="url(attachment)"
        controls
        class="min-w-0 max-w-full"
        @play="onMediaPlay($event, attachment)"
      />
      <span
        v-if="documents.length"
        :class="['flex max-w-80 flex-wrap gap-1', ownMessage ? 'justify-end' : 'justify-start']"
        data-testid="chat-attachment-files"
      >
        <Chip
          v-for="attachment in documents"
          :key="attachment.fileId"
          :label="attachment.name || attachment.mimeType"
          :icon="fileIcon(attachment)"
          :pt="chipPt"
          :class="fileChipClass"
          :title="chipTitle(attachment)"
          @click="openAttachment(attachment)"
        />
      </span>
    </template>
  </span>
  <StandardDialog
    :visible="Boolean(previewAttachment)"
    size="full"
    fill
    :show-default-footer="false"
    :title="previewAttachment?.name || previewAttachment?.mimeType || ''"
    :subtitle="previewMeta"
    @update:visible="value => { if (!value) previewAttachment = null }"
  >
    <template #header-actions>
      <span v-if="previewQueue.length > 1" class="text-muted text-supporting" data-testid="chat-attachment-position">
        {{ previewIndex + 1 }} / {{ previewQueue.length }}
      </span>
      <Button
        icon="pi pi-download"
        severity="secondary"
        text
        rounded
        size="small"
        class="shrink-0"
        :aria-label="$t('support.download', { name: previewAttachment?.name || previewAttachment?.mimeType || '' })"
        data-testid="chat-attachment-download"
        @click="download(previewAttachment)"
      />
    </template>
    <div v-if="previewAttachment" class="relative flex min-h-0 w-full flex-1 flex-col">
      <div v-if="previewKind === 'image'" class="flex min-h-0 flex-1 items-center justify-center">
        <img
          class="max-h-full max-w-full object-contain"
          :src="url(previewAttachment)"
          :alt="previewAttachment.name || ''"
        >
      </div>
      <iframe
        v-else-if="previewKind === 'pdf'"
        :src="url(previewAttachment)"
        :title="previewAttachment.name || previewAttachment.mimeType"
        class="min-h-0 w-full flex-1 border-0"
      />
      <div v-else class="min-h-0 flex-1 overflow-auto">
        <SupportMessageContent
          v-if="previewIsMarkdown"
          :message="{ message: previewText }"
          markdown
          class="m-3 block max-w-3xl"
        />
        <pre v-else class="m-3 whitespace-pre-wrap break-words rounded-ui bg-subtle p-3 text-technical [overflow-wrap:anywhere]">{{ previewText }}</pre>
      </div>
      <template v-if="previewQueue.length > 1">
        <Button
          icon="pi pi-chevron-left"
          severity="secondary"
          text
          rounded
          class="absolute left-2 top-1/2 z-10 -translate-y-1/2 bg-content shadow-overlay"
          :aria-label="$t('common.previous')"
          data-testid="chat-attachment-prev"
          @click="goPreview(-1)"
        />
        <Button
          icon="pi pi-chevron-right"
          severity="secondary"
          text
          rounded
          class="absolute right-2 top-1/2 z-10 -translate-y-1/2 bg-content shadow-overlay"
          :aria-label="$t('common.next')"
          data-testid="chat-attachment-next"
          @click="goPreview(1)"
        />
      </template>
    </div>
  </StandardDialog>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Chip from 'primevue/chip';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import SupportMessageContent from '~/components/shared/SupportMessageContent.vue';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';
import { chatAttachmentUrl } from '~/utils/chat-file-targets.js';
import { useMediaStore } from '~/stores/media';
import { useInstancesStore } from '~/stores/instances';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { instanceRecordTitle, previewSourceValue } from '~/utils/instance-shape.js';
import { generatedEntityLabel } from '~/utils/generated-labels.js';
import { resolveFilePreview } from '~/components/generated/file-preview-contract.js';
import { resolvePluginPreview } from '~/components/generated/plugin-preview-bindings.js';

const props = defineProps({
  attachments: { type: Array, default: () => [] },
  refs: { type: Array, default: () => [] },
  viewerUserId: { type: String, default: '' },
  senderUserId: { type: String, default: '' },
  ownMessage: { type: Boolean, default: false },
  singleLine: { type: Boolean, default: false }
});

const { t, te } = useI18n();
const media = useMediaStore();
const instances = useInstancesStore();
const { typeById } = useFileTypeView();

const fileChipClass = 'min-w-0 max-w-full cursor-pointer border border-content-border bg-subtle text-supporting';
const instanceChipClass = 'min-w-0 max-w-full cursor-pointer border border-content-border bg-transparent text-supporting';
const chipPt = { label: { class: 'truncate' } };

const restrictedView = computed(() => Boolean(
  props.viewerUserId && props.senderUserId && props.senderUserId !== props.viewerUserId
));
const canFetch = (ref = {}) => !restrictedView.value || !ref.chatOnlyForRecipient;

const refHasPreview = (ref = {}) => {
  const typeRecord = ref.type ? typeById(ref.type) : null;
  const dto = ref.instance;
  if (!ref.type || !dto) return false;
  if (resolvePluginPreview(ref.type)) return true;
  if (!typeRecord) return false;
  const file = resolveFilePreview(dto, typeRecord);
  if (file.hasPayload && file.renderable) return true;
  return typeRecord.previewSource?.display === 'geometry'
    && Boolean(previewSourceValue(dto, typeRecord));
};

const chipRefs = computed(() => (props.refs || []).filter(ref => !refHasPreview(ref)));

// The media flow: preview cards and image tiles in send order.
const mediaItems = computed(() => [
  ...(props.refs || []).map(ref => refHasPreview(ref) ? { kind: 'instance', ref } : null).filter(Boolean),
  ...images.value.map(attachment => ({ kind: 'image', attachment }))
]);

const masonryColumns = computed(() => {
  const total = mediaItems.value.length;
  const columnCount = total >= 5 ? 3 : 2;
  const baseCount = Math.floor(total / columnCount);
  const extra = total % columnCount;
  const columns = [];
  let cursor = 0;
  for (let column = 0; column < columnCount; column++) {
    const size = baseCount + (column < extra ? 1 : 0);
    columns.push(mediaItems.value.slice(cursor, cursor + size).reverse());
    cursor += size;
  }
  return columns;
});

const previewRefProps = (ref = {}) => ({
  type: ref.type,
  id: ref.id,
  entity: ref.instance || null,
  fetch: canFetch(ref),
  variant: 'compact',
  compactLayout: 'stacked'
});

const chipRefProps = (ref = {}) => ({
  type: ref.type,
  id: ref.id,
  entity: ref.instance || null,
  fetch: canFetch(ref),
  chipClass: instanceChipClass
});

// Naming law: the support README — empty names localize the type label.
const firstRefLabel = computed(() => {
  const ref = (props.refs || [])[0] || {};
  const typeView = ref.type ? typeById(ref.type) : null;
  const title = instanceRecordTitle(ref.instance || null, typeView);
  if (title) return title;
  const storedName = ref.label && ref.label !== String(ref.id) ? ref.label : '';
  return storedName || generatedEntityLabel(ref.type, { t, te });
});

const summaryUsesAttachments = computed(() => (props.attachments || []).length > 0);
const summaryItems = computed(() => (summaryUsesAttachments.value ? props.attachments : props.refs));
const summaryKind = computed(() => {
  for (const kind of ['image', 'video', 'audio', 'file']) {
    if ((props.attachments || []).some(attachment => attachment?.kind === kind)) return kind;
  }
  return 'instance';
});
const summaryIcon = computed(() => ({
  image: 'pi pi-image',
  video: 'pi pi-video',
  audio: 'pi pi-microphone',
  file: 'pi pi-file',
  instance: instances.iconFor((props.refs || [])[0]?.type || '')
}[summaryKind.value]));
const summaryLabel = computed(() => {
  if (summaryUsesAttachments.value) {
    const kind = {
      image: t('support.attachmentPhoto'),
      video: t('support.attachmentVideo'),
      audio: t('support.attachmentVoice'),
      file: t('support.attachmentFile')
    }[summaryKind.value];
    return props.attachments.find(attachment => attachment.name?.trim())?.name?.trim() || kind;
  }
  return firstRefLabel.value;
});
const summaryOverflow = computed(() => Math.max(0, (summaryItems.value || []).length - 1));

// The descriptor is held so the dialog serves the same URL as the inline render.
const previewAttachment = ref(null);
// Header meta for the preview dialog: the file's kind facts, not just its name.
const previewMeta = computed(() => {
    const attachment = previewAttachment.value || {};
    return [attachment.mimeType, formatBytes(attachment.size)].filter(Boolean).join(' · ');
});
// The dialog previews the whole message's openable set in send order:
// gallery navigation (arrows, keyboard) walks it with wrap-around.
const previewQueue = computed(() => (props.attachments || [])
    .filter(attachment => attachment?.kind === 'image' || isPdf(attachment) || isText(attachment)));
const previewIndex = computed(() => previewQueue.value.indexOf(previewAttachment.value));
const goPreview = (step) => {
    const queue = previewQueue.value;
    if (queue.length < 2) return;
    const next = (previewIndex.value + step + queue.length) % queue.length;
    previewAttachment.value = queue[next];
};
const onPreviewKeydown = (event) => {
    if (event.key === 'ArrowLeft') goPreview(-1);
    else if (event.key === 'ArrowRight') goPreview(1);
};
watch(previewAttachment, (attachment) => {
    if (attachment) window.addEventListener('keydown', onPreviewKeydown);
    else window.removeEventListener('keydown', onPreviewKeydown);
});
onBeforeUnmount(() => window.removeEventListener('keydown', onPreviewKeydown));

// Office mimes embed "xml" (openxmlformats): only mime-exact text kinds
// preview; extensions sniff solely octet-stream uploads.
const isPdf = (attachment = {}) => String(attachment.mimeType || '').includes('pdf')
  || /\.pdf$/i.test(attachment.name || '');
const isMarkdown = (attachment = {}) => /^text\/markdown/i.test(String(attachment.mimeType || ''))
  || /\.md$/i.test(attachment.name || '');
const isText = (attachment = {}) => {
  const mime = String(attachment.mimeType || '');
  if (/^text\//i.test(mime)) return true;
  if (/^application\/(json|xml|yaml|x-yaml)(;|$)/i.test(mime)) return true;
  if (mime && !/^application\/octet-stream$/i.test(mime)) return false;
  return /\.(md|txt|csv|json|ya?ml|log)$/i.test(attachment.name || '');
};
const previewKind = computed(() => {
  const attachment = previewAttachment.value;
  if (!attachment) return '';
  if (attachment.kind === 'image' || /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(attachment.name || '')) return 'image';
  if (isPdf(attachment)) return 'pdf';
  return isText(attachment) ? 'text' : '';
});

const previewText = ref('');
const previewIsMarkdown = computed(() => Boolean(previewAttachment.value) && isMarkdown(previewAttachment.value));
watch(previewAttachment, async (attachment) => {
  previewText.value = '';
  if (!attachment || previewKind.value !== 'text') return;
  previewText.value = await $fetch(url(attachment), { responseType: 'text' }).catch(() => t('common.error'));
}, { immediate: true });

const openAttachment = (attachment) => {
  if (attachment?.kind === 'image' || isPdf(attachment) || isText(attachment)) {
    previewAttachment.value = attachment;
    return;
  }
  download(attachment);
};

const chipTitle = (attachment = {}) => {
  const name = attachment.name || attachment.mimeType || '';
  const size = formatBytes(attachment.size);
  return size ? `${name} · ${size}` : name;
};

// Now-playing handoff (components/media README): a media element that
// starts playback claims the app's single-play channel; when this surface
// unmounts while it is still playing, its descriptor and position go to
// the dock, which resumes it in its own element.
const playingMedia = new Map();
const onMediaPlay = (event, attachment) => {
  const el = event.target;
  playingMedia.set(el, {
    kind: el.tagName.toLowerCase() === 'video' ? 'video' : 'audio',
    url: url(attachment),
    title: attachment.name || t(`support.attachment${el.tagName.toLowerCase() === 'video' ? 'Video' : 'Voice'}`)
  });
  media.claim(el);
};
onBeforeUnmount(() => {
  for (const [el, meta] of playingMedia) {
    if (!el.paused && !el.ended) media.adopt({ ...meta, time: el.currentTime });
  }
  playingMedia.clear();
});

const ofKind = (kind) => (props.attachments || []).filter(attachment => attachment?.kind === kind);
const images = computed(() => ofKind('image'));
const videos = computed(() => ofKind('video'));
const audio = computed(() => ofKind('audio'));
const documents = computed(() => ofKind('file'));

const url = (attachment) => chatAttachmentUrl(attachment);

const download = (attachment) => {
  const href = chatAttachmentUrl(attachment, { download: true });
  if (href && typeof window !== 'undefined') window.open(href, '_blank');
};

const fileIcon = (attachment = {}) => {
  const mime = String(attachment.mimeType || '');
  if (mime.includes('pdf')) return 'pi pi-file-pdf';
  if (mime.includes('sheet') || mime.includes('excel')) return 'pi pi-file-excel';
  if (mime.includes('word')) return 'pi pi-file-word';
  return 'pi pi-file';
};

function formatBytes(size = 0) {
  if (!Number.isFinite(size) || size <= 0) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
</script>
