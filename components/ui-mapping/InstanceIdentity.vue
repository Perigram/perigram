<template>
  <span class="inline-flex min-w-0 items-center gap-2">
    <i :class="glyph" class="shrink-0" aria-hidden="true" />
    <Button
      v-if="openable"
      link
      :size="size"
      :label="identity"
      :class="[LAYOUT.linkClamp, 'px-0']"
      @click="$emit('open', instance)"
    />
    <span v-else :class="['truncate', textClass]">{{ identity }}</span>
  </span>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import { LAYOUT, titleFor, iconFor } from '#shared/ui-mapping/index.js';

// The instance identifier (SPEC §22.8): a record's identity line carries
// its icon — the authored glyph, a record's declared thumb winning — and
// opens the record under the screen's onOpen contract. Every projection
// renders collection identities through this one surface. The link's
// horizontal padding dies here: the identifier owns its spacing (the
// wrapper gap), and the preset's padding is a standalone-target
// affordance.
const props = defineProps({
  instance: { type: Object, required: true },
  type: { type: Object, required: true },
  openable: { type: Boolean, default: false },
  size: { type: String, default: null },
  // The non-link text face (a heading variant names its own).
  textClass: { type: String, default: 'text-body' }
});

defineEmits(['open']);

const { t } = useI18n();
const identity = computed(() => titleFor(props.instance, props.type, { unnamedLabel: t('common.unnamed') }));
const glyph = computed(() => iconFor(props.type, props.instance));
</script>
