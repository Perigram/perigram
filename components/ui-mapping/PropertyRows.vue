<template>
  <div v-for="field in fields" :key="field.name" :class="grouped ? [d.specRow, 'group/ck-field'] : d.specRow">
    <span :class="LAYOUT.labelCell">{{ field.label }}</span>
    <div :class="LAYOUT.factCell">
      <InlineField
        :field="field"
        :editable="editable"
        :quantitative="quantitative"
        :pool="pool"
        :bundle="bundle"
        @inline-change="change => $emit('inline-change', change)"
      />
      <DeclarationFieldMenu
        v-if="authoring && authoring.fieldByName.has(field.name)"
        :authoring="authoring.session"
        :field="authoring.fieldByName.get(field.name)"
        :type-options="authoring.typeOptions"
      />
    </div>
  </div>
  <div v-if="hiddenCount > 0" class="py-1">
    <Button
      :label="expanded
        ? $t('uiMapping.showLess')
        : $t('uiMapping.showMore', { count: hiddenCount })"
      size="small"
      text
      @click="$emit('toggle')"
    />
  </div>
</template>

<script setup>
import { inject } from 'vue';
import Button from 'primevue/button';
import { LAYOUT } from '#shared/ui-mapping/index.js';
import InlineField from './InlineField.vue';
import DeclarationFieldMenu from '../type-designer/DeclarationFieldMenu.vue';

defineProps({
  // The shown rows (already budgeted) and the collapsed remainder count.
  fields: { type: Array, default: () => [] },
  hiddenCount: { type: Number, default: 0 },
  expanded: { type: Boolean, default: false },
  editable: { type: Boolean, default: false },
  quantitative: { type: Boolean, default: false },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  // The holder's session projection — `{ session, fieldByName,
  // typeOptions }` — or null for the compiled block.
  authoring: { type: Object, default: null },
  // Rows carry the `ck-field` hover group (the authoring menu's reveal).
  grouped: { type: Boolean, default: false }
});

defineEmits(['toggle', 'inline-change']);

const d = inject('uiMappingSpacing');
</script>
