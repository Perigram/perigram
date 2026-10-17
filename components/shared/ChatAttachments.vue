<template>
  <!-- Pure presentation over a message's attachment descriptors (the
       support feature README owns the contract): image galleries, video
       players, audio players, and file chip rows with download. The host
       composer owns uploading, materialization, and transcription. The
       root hugs its content so sender-side columns can right-align it;
       every name crops through the min-w-0/truncate chain. -->
  <span
    :class="singleLine
      ? 'inline-flex max-w-full min-w-0 flex-nowrap items-center gap-1 overflow-hidden align-middle'
      : 'flex max-w-full min-w-0 flex-col items-start gap-1'"
    :data-testid="singleLine ? 'chat-attachment-summary' : 'chat-attachments'"
  >
    <template v-if="singleLine">
      <i :class="summaryIcon" class="shrink-0 text-muted" aria-hidden="true" />
      <span class="min-w-0 truncate text-inherit">{{ summaryLabel }}</span>
      <span v-if="attachments.length > 1" class="shrink-0 text-muted">+{{ attachments.length - 1 }}</span>
    </template>
    <template v-else>
      <!-- One image renders at natural aspect inside fixed bounds; a set
           renders as fixed-size gallery tiles. Either opens the standard
           full dialog on click — no ad-hoc lightbox chrome. -->
      <button
        v-if="images.length === 1"
        type="button"
        class="block max-w-full cursor-zoom-in rounded-ui bg-transparent p-0"
        :aria-label="$t('support.attachmentPreview', { name: images[0].name || '' })"
        @click="previewAttachment = images[0]"
      >
        <img class="h-auto max-h-64 max-w-full rounded-ui" :src="url(images[0])" :alt="images[0].name || ''">
      </button>
      <span v-else-if="images.length" :class="galleryClass" data-testid="chat-attachment-gallery">
        <span v-for="attachment in images" :key="attachment.fileId" class="h-28 w-28 overflow-hidden rounded-ui">
          <button
            type="button"
            class="block h-full w-full cursor-zoom-in rounded-ui bg-transparent p-0"
            :aria-label="$t('support.attachmentPreview', { name: attachment.name || '' })"
            @click="previewAttachment = attachment"
          >
            <img class="h-full w-full object-cover" :src="url(attachment)" :alt="attachment.name || ''">
          </button>
        </span>
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
        preload="metadata"
        class="min-w-0 max-w-full"
        @play="onMediaPlay($event, attachment)"
      />
      <span v-if="documents.length" class="flex max-w-full flex-wrap items-center gap-1" data-testid="chat-attachment-files">
        <!-- The same chip anatomy instance refs use (raw PrimeVue Chip,
             type icon, cropped name). A click opens the file in the app
             when a viewer exists, else downloads. -->
        <Chip
          v-for="attachment in documents"
          :key="attachment.fileId"
          :label="attachment.name || attachment.mimeType"
          :icon="fileIcon(attachment)"
          :pt="chipPt"
          class="min-w-0 max-w-full cursor-pointer"
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
    @update:visible="value => { if (!value) previewAttachment = null }"
  >
    <template #header>
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <span class="min-w-0 flex-1 truncate text-label">{{ previewAttachment?.name || previewAttachment?.mimeType }}</span>
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
      </div>
    </template>
    <div v-if="previewAttachment" class="flex min-h-0 w-full flex-1 flex-col">
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
        <!-- Markdown files render through the shared sanitized pipeline
             (the prose voice); other text kinds read preformatted in the
             technical voice. -->
        <SupportMessageContent
          v-if="previewIsMarkdown"
          :message="{ message: previewText }"
          markdown
          class="m-3 block max-w-3xl"
        />
        <pre v-else class="m-3 whitespace-pre-wrap break-words rounded-ui bg-subtle p-3 text-technical [overflow-wrap:anywhere]">{{ previewText }}</pre>
      </div>
    </div>
  </StandardDialog>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import Button from 'primevue/button';
import Chip from 'primevue/chip';
import { useI18n } from 'vue-i18n';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import SupportMessageContent from '~/components/shared/SupportMessageContent.vue';
import { chatAttachmentUrl } from '~/utils/chat-file-targets.js';
import { useMediaStore } from '~/stores/media';

const props = defineProps({
  attachments: { type: Array, default: () => [] },
  // Inbox preview mode: one icon + label line, cropping like the text
  // preview beside it.
  singleLine: { type: Boolean, default: false }
});

const { t } = useI18n();
const media = useMediaStore();

// Full-dialog expansion for any previewable attachment (image tiles,
// file chips): the descriptor is held, not a precomputed URL, so the
// dialog serves the same bucket-honoring URL as the inline render.
const previewAttachment = ref(null);

// The in-app viewer set: images (their own tiles), PDFs (the browser's
// native engine in an iframe), and text — markdown rendered formatted
// through the shared pipeline, everything else preformatted. A concrete
// non-text mime is authoritative: the office containers (xlsx/docx —
// "openxmlformats" embeds "xml") must never ride the text branch;
// extension sniffing only answers for octet-stream uploads.
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

const chipPt = { label: { class: 'truncate' } };
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

// Fixed-size tiles for sets: 2 columns up to four images, 3 beyond.
const galleryClass = computed(() => ['grid gap-1', images.value.length >= 5 ? 'grid-cols-3' : 'grid-cols-2']);

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
