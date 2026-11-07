<template>
  <span :class="crossCut ? 'inline-flex min-w-0 flex-col items-start gap-1' : 'inline-flex min-w-0 items-center gap-2'">
    <TraceChain
      v-if="crossCut"
      :entity="instance"
      :type-id="type?.id || ''"
      variant="compact"
      expandable
      class="min-w-0"
    />
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
  </span>
</template>

<script setup>
import { computed, inject, unref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import { LAYOUT, titleFor, iconFor } from '#shared/ui-mapping/index.js';
import TraceChain from '../shared/links/TraceChain.vue';

// The instance identifier (SPEC §22.8): a record's identity line carries
// its icon — the authored glyph, a record's declared thumb winning — and
// opens the record under the screen's onOpen contract. Every projection
// renders collection identities through this one surface, and an
// identity rendered outside its parent's surface (the containment
// cross-cut's injected flag) carries the lineage chain at its top — the
// same TraceChain the record header and the entity cards render, crumbs
// routing to compiled detail routes. The link's
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

const collectionCrossCut = inject('instanceCollectionCrossCut', null);
const crossCut = computed(() => unref(collectionCrossCut) === true);
const { t } = useI18n();
const identity = computed(() => titleFor(props.instance, props.type, { unnamedLabel: t('common.unnamed') }));
const glyph = computed(() => iconFor(props.type, props.instance));
</script>
