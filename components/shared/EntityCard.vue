<template>
    <!-- Inline: pill chip with popup -->
    <template v-if="variant === 'inline'">
        <div class="inline-flex items-center gap-2 cursor-pointer" @click="togglePopup">
            <IdentityBlock :entity="entity" variant="inline" :icon="entityConfig.icon" />
            <slot name="inline-extra" />
        </div>
        
        <Popover ref="op" class="shadow-lg border border-surface-border">
            <div class="flex flex-col gap-4 p-4 min-w-[300px]">
                <div class="flex flex-col gap-1">
                    <small class="text-muted-color">Traceability</small>
                    <TraceChain :entity="entity" />
                </div>
                <Divider class="m-0" />
                <div class="flex flex-col gap-1">
                    <small class="text-muted-color">Status & Actions</small>
                    <EntityStatus 
                        :entity="entity" 
                        :entity-type="entityType" 
                        variant="full" 
                        @transitioned="$emit('refresh')"
                    />
                </div>
            </div>
        </Popover>
    </template>

    <!-- Compact: identity + status in a card row -->
    <template v-else-if="variant === 'compact'">
        <StandardCard>
            <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-2">
                    <slot name="before-identity" />
                    <IdentityBlock :entity="entity" variant="compact" />
                </div>
                <EntityStatus :entity="entity" :entity-type="entityType" variant="inline" />
            </div>
            <slot name="compact-content" />
        </StandardCard>
    </template>

    <!-- Card: full chrome — tracechain / identity+status / body / footer -->
    <template v-else>
        <StandardCard>
            <template #title>
                <TraceChain :entity="entity" />
                <div class="flex justify-between items-start gap-4">
                    <div class="flex flex-col">
                        <slot name="before-identity" />
                        <IdentityBlock :entity="entity" />
                    </div>
                    <EntityStatus :entity="entity" :entity-type="entityType" variant="inline" />
                </div>
            </template>
            <slot />
            <template #footer>
                <slot name="footer" />
            </template>
        </StandardCard>
    </template>
</template>

<script setup>
import { computed, ref } from 'vue';
/**
 * EntityCard - v24 Standardized
...
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import Popover from 'primevue/popover';
import Divider from 'primevue/divider';
import { ENTITY_UI } from '~/utils/status-engine';

const props = defineProps({
    entity: { type: Object, required: true },
    entityType: { type: String, required: true },
    variant: { type: String, default: 'card' }
});

const emit = defineEmits(['refresh']);

const entityConfig = computed(() => ENTITY_UI[props.entityType] || { icon: 'pi pi-box' });

const op = ref();
const togglePopup = (event) => {
    op.value.toggle(event);
};
</script>
