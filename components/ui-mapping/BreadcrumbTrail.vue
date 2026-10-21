<template>
  <Breadcrumb v-if="crumbs.length > 1" :model="crumbs" class="w-full">
    <template #item="{ item, props: breadcrumbProps }">
      <!-- Ancestors are navigation: each crumb opens its instance through
           the screen's identity-open channel. The last crumb is the
           opened record itself — plain text, never a self-link. -->
      <Button
        v-if="!item.current"
        v-bind="breadcrumbProps"
        link
        size="small"
        :class="LAYOUT.linkClamp"
        @click="$emit('open', item.instance)"
      >
        {{ item.label }}
      </Button>
      <span v-else class="text-supporting text-muted block max-w-44 truncate" :title="item.label">{{ item.label }}</span>
    </template>
  </Breadcrumb>
</template>

<script setup>
import { computed } from 'vue';
import Breadcrumb from 'primevue/breadcrumb';
import Button from 'primevue/button';
import { useI18n } from 'vue-i18n';
import { titleFor, LAYOUT } from '#shared/ui-mapping/index.js';

const props = defineProps({
  instance: { type: Object, required: true },
  bundle: { type: Object, default: null },
  pool: { type: Object, default: () => ({}) }
});

defineEmits(['open']);

const { t } = useI18n();
const typesById = computed(() => Object.fromEntries((props.bundle?.types || []).map(type => [type.id, type])));

const crumbs = computed(() => {
  const chain = [];
  let cursor = props.instance;
  const seen = new Set([cursor.id]);
  while (cursor) {
    chain.unshift({
      label: titleFor(cursor, typesById.value[cursor.type], { unnamedLabel: t('common.unnamed') }),
      instance: cursor
    });
    const parentRef = Object.values(cursor.lineage || {})[0];
    const parent = parentRef ? props.pool[parentRef.type]?.[parentRef.id] : null;
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    cursor = parent;
  }
  if (chain.length) chain[chain.length - 1].current = true;
  return chain;
});
</script>
