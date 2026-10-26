<template>
  <Galleria
    :value="instances"
    :num-visible="thumbCount"
    :circular="instances.length > 1"
    :show-item-navigators="instances.length > 1"
    :show-item-navigators-on-hover="true"
    class="ck-gallery w-full"
  >
    <template #item="slotProps">
      <div v-if="slotProps.item" :class="LAYOUT.galleryItem">
        <PreviewBox
          fill
          :type="type"
          :instance="slotProps.item"
          :payload="slotProps.item.payload"
          :preview-source="slotProps.item.previewSource"
          :seed="slotProps.item.id"
        />
      </div>
    </template>
    <template #caption="slotProps">
      <span v-if="slotProps.item" class="min-w-0">
        <Button
          v-if="openable"
          link
          :label="identityOf(slotProps.item)"
          :class="LAYOUT.linkClamp"
          @click="$emit('open', slotProps.item)"
        />
        <span v-else class="truncate text-body">{{ identityOf(slotProps.item) }}</span>
      </span>
    </template>
    <template #thumbnail="slotProps">
      <div v-if="slotProps.item" :class="LAYOUT.galleryThumb">
        <PreviewBox
          fill
          :type="type"
          :instance="slotProps.item"
          :payload="slotProps.item.payload"
          :preview-source="slotProps.item.previewSource"
          :seed="slotProps.item.id"
        />
      </div>
    </template>
  </Galleria>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Galleria from 'primevue/galleria';
import Button from 'primevue/button';
import { LAYOUT, titleFor } from '#shared/ui-mapping/index.js';
import { useHostContainerTraits } from '~/composables/useContainerTraits.js';
import PreviewBox from './PreviewBox.vue';

const props = defineProps({
  instances: { type: Array, default: () => [] },
  type: { type: Object, default: null },
  // Gallery identities render as links when an open handler exists.
  openable: { type: Boolean, default: false },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null }
});

defineEmits(['open']);

const { t } = useI18n();
const identityOf = instance => titleFor(instance, props.type, { unnamedLabel: t('common.unnamed') });

// Thumbnails per strip derive from the container record (the seam), the
// same width steps every surface consumes.
const hostContainer = useHostContainerTraits();
const thumbCount = computed(() => ({ narrow: 3, medium: 4, wide: 6 })[hostContainer.value.width] || 4);
</script>
