<template>
  <div :class="[`variant-${variant}`]">
    <template v-if="variant === 'inline'">
      <Chip>
        <div class="w-3 h-3 rounded-full shrink-0" :style="{ backgroundColor: standard.metadata?.color || '#ccc' }" />
        <span>{{ standard.identity?.serial || standard.code }}</span>
      </Chip>
    </template>

    <template v-else-if="variant === 'compact'">
      <StandardCard>
        <template #title>
            <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-2">
                    <i class="pi pi-palette" :style="{ color: standard.metadata?.color || '#ccc' }"></i>
                    <IdentityBlock :entity="standard" variant="compact" />
                </div>
                <Badge v-if="standard.category" :value="standard.category" severity="secondary" size="small" />
            </div>
        </template>
      </StandardCard>
    </template>

    <template v-else-if="variant === 'card'">
      <StandardCard>
        <template #title>
            <div class="flex justify-between items-center gap-4">
                <IdentityBlock :entity="standard" />
                <Badge v-if="standard.category" :value="standard.category" severity="secondary" size="small" />
            </div>
        </template>
        <Divider />
        <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between gap-2">
                <small>{{ $t('layerStandard.defaultPen') }}</small>
                <Badge v-if="standard.orgPenId" value="overridden" severity="warn" size="small" />
            </div>
            <TraceLink v-if="activePenId" type="penTemplate" :id="activePenId" />
            <p v-else class="italic opacity-50">{{ $t('layerStandard.noDefaultPen') }}</p>
        </div>
        <template #footer>
            <div v-if="canEdit" class="flex justify-end gap-2" @click.stop>
                <Button
                    v-if="standard.orgPenId"
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
      </StandardCard>
    </template>
  </div>
</template>

<script setup>
/**
 * Layer Standard View Component - v24 Standardized
 */
import { computed } from 'vue';
import Badge from 'primevue/badge';
import Chip from 'primevue/chip';
import Divider from 'primevue/divider';
import Button from 'primevue/button';
import StandardCard from '~/components/shared/StandardCard.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import TraceLink from '~/components/shared/links/TraceLink.vue';
import { useAuthStore } from '~/stores/auth';

const props = defineProps({
  standard: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

defineEmits(['set-pen', 'revert']);

const authStore = useAuthStore();
const canEdit = computed(() => authStore.can('layer_standards', 'setPen'));
const activePenId = computed(() => props.standard.orgPenId || props.standard.defaultPenId);
</script>
