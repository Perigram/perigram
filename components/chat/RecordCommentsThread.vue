<template>
  <!-- The pinned thread for the record page's comments band: the shared
       thread stage (messages, composer, attachment flow) over the same
       useChatThread core every chat host uses; the record's own header
       names the record (SPEC §22.3), so the band carries the stage
       alone. -->
  <ChatThreadStage :thread="thread" />
</template>

<script setup>
import { computed, reactive } from 'vue';
import { useAuthStore } from '~/stores/auth';
import { instanceThreadKey } from '~/utils/instance-chat.js';
import { useChatThread } from './useChatThread.js';
import ChatThreadStage from './ChatThreadStage.vue';

const props = defineProps({
  typeId: { type: String, required: true },
  instanceId: { type: String, required: true },
  name: { type: String, default: '' }
});

const authStore = useAuthStore();
const currentUserId = computed(() => authStore.userData?.id || authStore.userData?.userId || null);
const conversationKey = computed(() => instanceThreadKey({
  type: props.typeId,
  id: props.instanceId,
  currentUserId: currentUserId.value || ''
}));
// useChatThread reads a reactive props shape; the reactive proxy unwraps
// the computed keys so the pin tracks the record it mounts for.
const chatProps = reactive({
  embedded: true,
  threadOnly: true,
  conversationKey,
  instanceName: computed(() => props.name)
});
const emit = () => {};
const thread = useChatThread(chatProps, emit);
</script>
