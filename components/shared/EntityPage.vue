<script setup>
/**
 * EntityPage - v24 Absolute Final
 * Standardized layout for entity detail pages.
 */
import IdentityBlock from './blocks/IdentityBlock.vue';
import EntityStatus from './status/EntityStatus.vue';
import TraceChain from './links/TraceChain.vue';
import StandardCard from './StandardCard.vue';
import Divider from 'primevue/divider';

const props = defineProps({
  entity: { type: Object, required: true },
  entityType: { type: String, required: true },
  title: { type: String, default: null },
  loading: { type: Boolean, default: false }
});

const emit = defineEmits(['refresh']);
</script>

<template>
  <div class="entity-page flex flex-col gap-6">
    <!-- Top Nav & Meta -->
    <div class="flex flex-col md:flex-row justify-between items-start gap-4">
        <div class="flex flex-col gap-2">
            <TraceChain :entity="entity" />
            <IdentityBlock :entity="entity" variant="header" />
        </div>
        <div class="flex items-center gap-4">
            <EntityStatus 
                :entity="entity" 
                :entity-type="entityType" 
                variant="full" 
                @transitioned="$emit('refresh')"
            />
            <div class="flex gap-2">
                <slot name="actions"></slot>
            </div>
        </div>
    </div>

    <Divider class="m-0" />

    <!-- Main Content Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <!-- Left: Primary Content -->
        <div class="lg:col-span-8 flex flex-col gap-6">
            <slot></slot>
        </div>

        <!-- Right: Secondary Info / Sidebar -->
        <div class="lg:col-span-4 flex flex-col gap-6">
            <StandardCard title="Information">
                <div class="flex flex-col gap-4">
                    <slot name="info"></slot>
                    <Divider />
                    <div class="flex flex-col gap-2">
                        <small>Created</small>
                        <span v-if="entity.origin">{{ new Date(entity.origin.timestamp).toLocaleString() }}</span>
                    </div>
                </div>
            </StandardCard>
            
            <slot name="sidebar"></slot>
        </div>
    </div>
  </div>
</template>