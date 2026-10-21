<template>
  <!-- The containment cross-cut's context token: quiet, non-interactive.
       The parent type's icon + the parent's resolved label name which
       containment a row rides in — the declaration the tree projection
       nests through, stated where nesting cannot happen. -->
  <span v-if="parent" class="inline-flex min-w-0 items-center gap-1 text-supporting text-muted" :title="parentLabel">
    <i :class="parentIcon" class="shrink-0 text-supporting" aria-hidden="true" />
    <span class="truncate">{{ parentLabel }}</span>
  </span>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { incomingChildrenEdges, parentRefOf, iconFor, titleFor } from '#shared/ui-mapping/index.js';

const props = defineProps({
  instance: { type: Object, required: true },
  bundle: { type: Object, default: null },
  pool: { type: Object, default: () => ({}) }
});

const { t } = useI18n();

const typesById = computed(() => Object.fromEntries((props.bundle?.types || []).map(type => [type.id, type])));
const edges = computed(() => incomingChildrenEdges(props.bundle, props.instance?.type));
const parent = computed(() => parentRefOf(props.instance, edges.value));
const parentType = computed(() => (parent.value ? typesById.value[parent.value.parentTypeId] || null : null));
// The parent record may sit in the pool (the region host overlays loaded
// parent types); an unloaded parent still names its TYPE — the context
// never depends on the parent being loaded.
const parentRecord = computed(() => (parent.value ? props.pool[parent.value.parentTypeId]?.[parent.value.parentId] || null : null));
const parentIcon = computed(() => iconFor(parentType.value) || 'pi pi-folder');
const parentLabel = computed(() => {
  if (parentRecord.value) {
    return titleFor(parentRecord.value, parentType.value, { unnamedLabel: t('common.unnamed') });
  }
  return parentType.value?.name || '';
});
</script>
