<template>
  <section class="flex min-w-0 flex-col gap-2 lg:sticky lg:top-0" data-testid="instance-chat-panel">
    <!-- Disclosure toggle: a PrimeVue text Button so Aura owns the focus,
         hover, and press states like every other control on the page. The
         icon is stable across states — aria-expanded carries the state. -->
    <Button
      :label="$t('support.instanceChat')"
      icon="pi pi-comments"
      text
      severity="secondary"
      size="small"
      class="self-start"
      :aria-expanded="!collapsed"
      :aria-controls="threadId"
      @click="collapsed = !collapsed"
    />
    <!-- The rail body. The thread owns its scrolling; the host only bounds it
         to the chat dimension token so an expanded thread never outgrows the
         viewport, and never paints container chrome — the thread's own
         surface is the surface. -->
    <div
      v-if="!collapsed"
      :id="threadId"
      class="flex h-support-chat min-h-0 flex-col overflow-hidden"
    >
      <ChatSupport
        :key="entityKey"
        embedded
        thread-only
        :conversation-key="entityKey"
        :entity-name="name"
      />
    </div>
  </section>
</template>

<script setup>
/**
 * The instance detail page's conversation rail: the one place a thread
 * renders in place instead of opening the shared popup.
 *
 * It occupies `InstancePage`'s sidebar slot, so from the two-track breakpoint
 * up it is a sticky rail beside the body — visible, bounded, and in the
 * page's own reading order. Below that breakpoint the slot stacks, so the
 * rail follows the body as an ordinary full-width section.
 *
 * A PrimeVue text Button (Aura owns its focus/hover/press states; the icon is
 * stable across states and `aria-expanded` carries the state) toggles a
 * bounded `ChatSupport` in `embedded thread-only` mode pinned to
 * `entity:<type>:<id>`, giving the composed conversation without the inbox or
 * back navigation. It starts collapsed so detail pages stay quiet until the
 * operator opens the thread.
 *
 * Bounded hosts must NOT mount it. Their `flush` frame is `h-full` and
 * non-scrolling, where an in-flow rail has no track and collapses to nothing.
 * Those hosts expose the same thread through the shared chat popup
 * (`utils/instance-chat.js`) from their own chrome, exactly like
 * `InstanceCard` and `InstanceInlineRef`.
 */
import { computed, ref, useId } from 'vue'
import Button from 'primevue/button'
import ChatSupport from '~/components/ChatSupport.vue'

const props = defineProps({
  type: { type: String, required: true },
  id: { type: String, required: true },
  name: { type: String, default: '' }
})

const collapsed = ref(true)
const entityKey = computed(() => `entity:${props.type}:${props.id}`)
const threadId = useId()
</script>
