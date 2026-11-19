<template>
  <div :class="[`variant-${variant}`]">
    <InstanceCard :instance="standard" type-id="layer_standard" :variant="variant" :show-trace="false" :show-status="false">
      <template #before-identity v-if="variant !== 'inline'">
        <i class="pi pi-palette"></i>
      </template>
      <template #subtitle v-if="variant === 'compact'">
        <div class="flex flex-wrap gap-2">
          <Badge v-if="category" :value="category" severity="secondary" size="small" />
          <Badge v-if="standardCode" :value="standardCode" severity="info" size="small" />
        </div>
      </template>
      <template #compact-content v-if="variant === 'compact'">
        <div v-if="activePen" class="mt-3">
          <PenTemplateCard :pen="activePen" variant="inline" />
        </div>
      </template>
      <template #default v-if="variant === 'card'">
        <Divider />
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between gap-2">
            <small class="text-muted">{{ standardCode || $t('layerStandard.defaultPen') }}</small>
            <Badge v-if="standard.data?.orgPenId" :value="$t('layerStandard.overridden')" severity="warn" size="small" />
          </div>
          <PenTemplateCard v-if="activePen" :pen="activePen" variant="inline" />
          <p v-else class="italic opacity-50">{{ $t('layerStandard.noDefaultPen') }}</p>
        </div>
      </template>
      <template #footer v-if="variant === 'card'">
        <div v-if="canEdit" class="flex justify-end gap-2" @click.stop>
          <Button
            v-if="standard.data?.orgPenId"
            icon="pi pi-refresh"
            :label="$t('common.revert')"
            text size="small" severity="secondary"
            @click="$emit('revert', standard)"
          />
          <Button
            icon="pi pi-pencil"
            :label="$t('layerStandard.setPen')"
            text size="small"
            @click="$emit('set-pen', standard)"
          />
        </div>
      </template>
    </InstanceCard>
  </div>
</template>

<script setup>
/**
 * Layer Standard View Component - v24 Standardized
 */
import { computed } from 'vue';
import Badge from 'primevue/badge';
import Divider from 'primevue/divider';
import Button from 'primevue/button';
import PenTemplateCard from '~/components/entities/PenTemplate/PenTemplateCard.vue';
import InstanceCard from '~/components/shared/InstanceCard.vue';
import { useAuthStore } from '~/stores/auth';
import { usePenTemplatesStore } from '~/stores/penTemplates';

const props = defineProps({
  standard: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

defineEmits(['set-pen', 'revert']);

const authStore = useAuthStore();
const penStore = usePenTemplatesStore();

const canEdit = computed(() => authStore.can('layer_standards', 'setPen'));
const category = computed(() => props.standard.data?.category || '');
const standardCode = computed(() => props.standard.data?.code || '');
const activePen = computed(() => {
    const id = props.standard.data?.orgPenId || props.standard.data?.defaultPenId;
    if (!id) return null;
    return penStore.pens.find(p => p._id?.toString() === id.toString()) || null;
});
</script>
