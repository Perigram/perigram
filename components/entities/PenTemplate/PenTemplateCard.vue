<template>
  <div :class="[`variant-${variant}`]">
    <InstanceCard :instance="pen" type-id="pen_template" :variant="variant" :show-trace="false" :show-status="false">
      <template #before-identity v-if="variant !== 'inline'">
        <div class="h-8 w-16 shrink-0 rounded-ui border border-content-border flex items-center px-2">
          <span class="block w-full" :style="lineStyle" />
        </div>
      </template>
      <template #subtitle v-if="variant === 'compact'">
        <div class="flex flex-wrap gap-2">
          <Tag v-if="isSystemPen" :value="$t('assets.system')" severity="info" size="small" />
          <Tag v-if="strokeWeight" :value="`${strokeWeight}px`" severity="secondary" size="small" />
          <Tag v-if="strokePattern" :value="strokePattern" severity="secondary" size="small" />
        </div>
      </template>
      <template #compact-content v-if="variant === 'compact'">
        <FactRows :rows="penRows" variant="compact" />
      </template>
      <template #default v-if="variant === 'card'">
        <Divider />
        <FactRows :rows="penRows" />
      </template>
      <template #footer v-if="variant === 'card'">
        <slot name="footer" />
      </template>
    </InstanceCard>
  </div>
</template>

<script setup>
/**
 * Pen Template View Component - v24 Standardized
 */
import { computed } from 'vue';
import Tag from 'primevue/tag';
import Divider from 'primevue/divider';
import InstanceCard from '~/components/shared/InstanceCard.vue';
import { useAuthStore } from '~/stores/auth';
import { useI18n } from 'vue-i18n';
import FactRows from '~/components/shared/FactRows.vue';
import { instanceFactRows } from '~/utils/fact-rows.js';
import { useFileTypeView } from '~/composables/useFileTypeView.js';

const { t, te, locale } = useI18n();
const { typeById } = useFileTypeView();
const penRows = computed(() => instanceFactRows({
  typeId: 'pen-template',
  typeRecord: typeById('pen-template'),
  entity: props.pen,
  auth: {
    permissions: authStore.activePermissions,
    fieldPolicies: authStore.fieldPolicies,
    stateFieldPolicies: authStore.stateFieldPolicies
  },
  translator: { t, te, locale }
}));

const props = defineProps({
  pen: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const authStore = useAuthStore();

const strokeColor = computed(() => props.pen.data?.stroke?.color || props.pen.stroke?.color || 'var(--p-content-border-color)');
const strokeWeight = computed(() => props.pen.data?.stroke?.weight || props.pen.stroke?.weight || null);
const strokePattern = computed(() => props.pen.data?.stroke?.pattern || props.pen.stroke?.pattern || '');
const isSystemPen = computed(() => !props.pen.lineage?.userId && !props.pen.ownerId);
const lineStyle = computed(() => ({
  borderTop: `${strokeWeight.value || 2}px solid ${strokeColor.value}`,
  borderStyle: strokePattern.value === 'DASHED' ? 'dashed' : 'solid'
}));
</script>
