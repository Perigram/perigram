<template>
  <!-- Pure presentation over a message's attachment descriptors (the
       support feature README owns the contract): image galleries, video
       players, audio players, and file chip rows with download. The host
       composer owns uploading, materialization, and transcription. -->
  <span
    :class="singleLine
      ? 'inline-flex max-w-full min-w-0 flex-nowrap items-center gap-1 overflow-hidden align-middle'
      : 'flex max-w-full min-w-0 flex-col gap-1'"
    :data-testid="singleLine ? 'chat-attachment-summary' : 'chat-attachments'"
  >
    <template v-if="singleLine">
      <i :class="summaryIcon" class="shrink-0 text-muted" aria-hidden="true" />
      <span class="min-w-0 truncate text-inherit">{{ summaryLabel }}</span>
      <span v-if="attachments.length > 1" class="shrink-0 text-muted">+{{ attachments.length - 1 }}</span>
    </template>
    <template v-else>
      <span v-if="images.length" :class="galleryClass" data-testid="chat-attachment-gallery">
        <span v-for="attachment in images" :key="attachment.fileId" :class="cellClass">
          <Image class="h-full w-full [&_img]:h-full [&_img]:w-full [&_img]:object-cover" :src="url(attachment)" :alt="attachment.name || ''" preview />
        </span>
      </span>
      <video
        v-for="attachment in videos"
        :key="attachment.fileId"
        :src="url(attachment)"
        controls
        preload="metadata"
        playsinline
        class="min-w-0 max-w-full w-72 rounded-ui"
      />
      <audio
        v-for="attachment in audio"
        :key="attachment.fileId"
        :src="url(attachment)"
        controls
        preload="metadata"
        class="min-w-0 max-w-full"
      />
      <span v-if="documents.length" class="flex max-w-full flex-col gap-1">
        <span
          v-for="attachment in documents"
          :key="attachment.fileId"
          class="inline-flex max-w-full min-w-0 items-center gap-2 rounded-ui bg-subtle px-2 py-1"
        >
          <i :class="fileIcon(attachment)" class="shrink-0 text-muted" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate text-supporting">{{ attachment.name || attachment.mimeType }}</span>
          <small v-if="attachment.size" class="shrink-0 text-muted text-supporting">{{ formatBytes(attachment.size) }}</small>
          <Button
            icon="pi pi-download"
            severity="secondary"
            text
            rounded
            size="small"
            class="shrink-0"
            :aria-label="$t('support.download', { name: attachment.name || '' })"
            @click="download(attachment)"
          />
        </span>
      </span>
    </template>
  </span>
</template>

<script setup>
import { computed } from 'vue';
import Button from 'primevue/button';
import Image from 'primevue/image';
import { useI18n } from 'vue-i18n';
import { chatAttachmentUrl } from '~/utils/chat-file-targets.js';

const props = defineProps({
  attachments: { type: Array, default: () => [] },
  // Inbox preview mode: one icon + label line, cropping like the text
  // preview beside it.
  singleLine: { type: Boolean, default: false }
});

const { t } = useI18n();

const ofKind = (kind) => (props.attachments || []).filter(attachment => attachment?.kind === kind);
const images = computed(() => ofKind('image'));
const videos = computed(() => ofKind('video'));
const audio = computed(() => ofKind('audio'));
const documents = computed(() => ofKind('file'));

const galleryClass = computed(() => ['grid gap-1', images.value.length >= 3 ? 'grid-cols-3' : 'grid-cols-2']);
const cellClass = 'aspect-square overflow-hidden rounded-ui';

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

const summaryKind = computed(() => {
  for (const kind of ['image', 'video', 'audio', 'file']) {
    if (ofKind(kind).length) return kind;
  }
  return 'file';
});

const summaryIcon = computed(() => ({
  image: 'pi pi-image',
  video: 'pi pi-video',
  audio: 'pi pi-microphone',
  file: 'pi pi-file'
}[summaryKind.value]));

const summaryLabel = computed(() => ({
  image: t('support.attachmentPhoto'),
  video: t('support.attachmentVideo'),
  audio: t('support.attachmentVoice'),
  file: t('support.attachmentFile')
}[summaryKind.value]));

function formatBytes(size = 0) {
  if (!Number.isFinite(size) || size <= 0) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
</script>
