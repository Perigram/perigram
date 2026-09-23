<template>
  <Breadcrumb :model="crumbs" class="w-full">
    <template #item="{ item, props: breadcrumbProps }">
      <span class="text-supporting text-muted block max-w-44 truncate">{{ item.label }}</span>
    </template>
  </Breadcrumb>
</template>

<script setup>
import { computed } from 'vue';
import Breadcrumb from 'primevue/breadcrumb';
import { useI18n } from 'vue-i18n';
import { titleFor } from '#shared/ui-mapping/index.js';

const props = defineProps({
  instance: { type: Object, required: true },
  bundle: { type: Object, default: null },
  pool: { type: Object, default: () => ({}) }
});

const { t } = useI18n();
const typesById = computed(() => Object.fromEntries((props.bundle?.types || []).map(type => [type.id, type])));

const crumbs = computed(() => {
  const chain = [];
  let cursor = props.instance;
  const seen = new Set([cursor.id]);
  while (cursor) {
    chain.unshift({
      label: titleFor(cursor, typesById.value[cursor.type], { unnamedLabel: t('common.unnamed') }),
      instanceId: cursor.id
    });
    const parentRef = Object.values(cursor.lineage || {})[0];
    const parent = parentRef ? props.pool[parentRef.type]?.[parentRef.id] : null;
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    cursor = parent;
  }
  return chain;
});
</script>
