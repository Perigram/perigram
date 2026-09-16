<template>
  <section class="flex flex-col gap-2" data-testid="entity-chat-panel">
    <Button
      :label="$t('support.entityChat')"
      icon="pi pi-comments"
      text
      severity="secondary"
      size="small"
      class="self-start"
      :aria-expanded="!collapsed"
      @click="collapsed = !collapsed"
    />
    <!-- Bounded host: embedded threads own their scrolling, never the detail
         page height. -->
    <div v-if="!collapsed" class="flex h-96 min-h-0 flex-col overflow-hidden rounded-ui border border-chrome-border">
      <ChatSupport :key="entityKey" embedded thread-only :conversation-key="entityKey" />
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import ChatSupport from '~/components/ChatSupport.vue'

/**
 * Entity-thread surface for generated detail pages: pins the shared chat
 * component to `entity:<type>:<id>` in thread-only mode so the detail page
 * gets the composed entity conversation without the inbox or back
 * navigation. The collapsed default keeps detail pages chat-free until the
 * operator opens the thread.
 */
const props = defineProps({
  type: { type: String, required: true },
  id: { type: String, required: true }
})

const collapsed = ref(true)
const entityKey = computed(() => `entity:${props.type}:${props.id}`)
</script>
