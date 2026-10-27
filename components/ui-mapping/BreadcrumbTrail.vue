<template>
  <Breadcrumb v-if="ancestors.length" :model="ancestors" class="w-full">
    <template #item="{ item, props: breadcrumbProps }">
      <!-- Ancestors are navigation: each crumb opens its instance through
           the screen's identity-open channel. The opened record's own
           title is the header identity line below the trail. -->
      <Button
        v-bind="breadcrumbProps"
        link
        size="small"
        :class="LAYOUT.linkClamp"
        @click="$emit('open', item.instance)"
      >
        {{ item.label }}
      </Button>
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

const ancestors = computed(() => {
  const chain = [];
  let cursor = props.instance;
  const seen = new Set([cursor.id]);
  for (;;) {
    const parentRef = Object.values(cursor.lineage || {})[0];
    const parent = parentRef ? props.pool[parentRef.type]?.[parentRef.id] : null;
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    chain.unshift({
      label: titleFor(parent, typesById.value[parent.type], { unnamedLabel: t('common.unnamed') }),
      instance: parent
    });
    cursor = parent;
  }
  return chain;
});
</script>
