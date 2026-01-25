<script setup>
/**
 * Universal Status Component - v24 Standardized
 */
import Tag from 'primevue/tag';
import OverlayPanel from 'primevue/overlaypanel';
import UserView from '../User/UserView.vue';
import { ref } from 'vue';

const props = defineProps({
  entity: { type: Object, required: true },
  variant: { type: String, default: 'inline' }
});

const { state, timestamp, metadata, statusColor } = useStatus(props.entity);
const op = ref();

const toggle = (event) => {
    op.value.toggle(event);
};

// Mock user object for UserView since we only have userId
const statusUser = computed(() => ({
    _id: props.entity.status?.userId || 'system',
    identity: { name: props.entity.status?.userId || 'System' }
}));
</script>

<template>
  <div class="flex items-center gap-2">
    <template v-if="variant === 'inline' || variant === 'compact'">
      <Tag 
        :value="state" 
        :severity="statusColor" 
        @click="toggle"
      />
    </template>

    <template v-else>
      <div class="flex flex-col items-end gap-2 text-right">
        <Tag :value="state" :severity="statusColor" />
        <UserView v-if="entity.status?.userId" :user="statusUser" variant="inline" />
        <div v-if="timestamp" class="flex flex-col text-[10px] opacity-50">
            <span>{{ timestamp.toLocaleDateString() }}</span>
            <span>{{ timestamp.toLocaleTimeString() }}</span>
        </div>
        <small v-if="metadata?.note" class="italic opacity-60">"{{ metadata.note }}"</small>
      </div>
    </template>

    <OverlayPanel ref="op">
        <div class="flex flex-col gap-2">
            <div class="flex flex-col">
                <small class="font-bold">Last Updated</small>
                <span>{{ timestamp?.toLocaleString() }}</span>
            </div>
            <div class="flex flex-col">
                <small class="font-bold">Performed By</small>
                <UserView :user="statusUser" variant="compact" />
            </div>
            <div v-if="metadata?.note" class="flex flex-col">
                <small class="font-bold">Note</small>
                <span class="italic">"{{ metadata.note }}"</span>
            </div>
        </div>
    </OverlayPanel>
  </div>
</template>