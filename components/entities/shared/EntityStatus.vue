<script setup>
/**
 * Universal Status Component - v24 Standardized
 */
import Tag from 'primevue/tag';
import Popover from 'primevue/popover';
import Divider from 'primevue/divider';
import Button from 'primevue/button';
import { ref, computed } from 'vue';
import { useStatus } from '~/composables/useBlocks';

const props = defineProps({
  entity: { type: Object, required: true },
  variant: { type: String, default: 'inline' },
  actions: { type: Array, default: () => [] } // Array of { label, icon, severity, command, disabled, permission }
});

const { state, timestamp, metadata, statusColor } = useStatus(props.entity);
const op = ref();

const toggle = (event) => {
    if (props.actions.length > 0 || timestamp.value) {
        op.value.toggle(event);
    }
};

const visibleActions = computed(() => {
    return props.actions.filter(a => {
        if (!a.permission) return true;
        return true;
    });
});
</script>

<template>
  <div class="inline-flex items-center gap-2">
    <template v-if="variant === 'inline' || variant === 'compact'">
      <Tag 
        :value="state" 
        :severity="statusColor" 
        class="cursor-pointer"
        @click="toggle"
      />
    </template>

    <template v-else>
      <div class="flex flex-col items-end gap-1 text-right">
        <Tag :value="state" :severity="statusColor" class="cursor-pointer" @click="toggle" />
        <div v-if="timestamp" class="flex flex-col">
            <small>{{ timestamp.toLocaleDateString() }}</small>
            <small>{{ timestamp.toLocaleTimeString() }}</small>
        </div>
        <small v-if="metadata?.note" class="italic">"{{ metadata.note }}"</small>
      </div>
    </template>

    <Popover ref="op">
        <div class="flex flex-col gap-4">
            <!-- Actions Section -->
            <div v-if="visibleActions.length > 0" class="flex flex-col gap-2">
                <small>{{ $t('common.actions.title') }}</small>
                <div class="flex flex-col gap-1">
                    <Button 
                        v-for="(action, idx) in visibleActions" 
                        :key="idx"
                        :label="action.label"
                        :icon="action.icon"
                        :severity="action.severity || 'secondary'"
                        :disabled="action.disabled"
                        size="small"
                        text
                        class="justify-start"
                        @click="() => { action.command(); op.hide(); }"
                    />
                </div>
            </div>

            <!-- Info Section -->
            <div v-if="timestamp" class="flex flex-col gap-3">
                <Divider v-if="visibleActions.length > 0" />
                <div class="flex flex-col gap-1">
                    <small>Last Updated</small>
                    <span>{{ timestamp?.toLocaleString() }}</span>
                </div>
                <div v-if="metadata?.note" class="flex flex-col gap-1">
                    <small>Note</small>
                    <span class="italic">"{{ metadata.note }}"</span>
                </div>
            </div>
        </div>
    </Popover>
  </div>
</template>