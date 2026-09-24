<template>
  <section class="flex min-w-0 flex-col gap-2" data-testid="instance-chat-panel">
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
    <!-- Bounded host: the embedded thread owns its scrolling, never the detail
         page height. The bound is the shared chat dimension token, so this
         surface matches every other chat host in the app. The section paints
         no container chrome of its own — the detail column already owns
         section rhythm, and the thread supplies its own. -->
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
 * The abstract instance detail page's conversation section: a
 * collapsed-by-default disclosure that expands a `ChatSupport` thread pinned
 * to `entity:<type>:<id>` in thread-only mode, so the page carries the composed
 * conversation without the inbox or back navigation.
 *
 * It rides the `InstancePage` column and therefore only ever appears in the
 * abstract branch of `GeneratedInstanceDetail`. Bounded hosts (flush
 * designers/editors) must NOT mount it: their column is an `h-full` no-scroll
 * frame, where an in-flow section collapses to nothing. Those hosts expose the
 * same thread through the shared chat popup (`utils/instance-chat.js`) from
 * their own chrome, exactly like `InstanceCard` and `InstanceInlineRef`.
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
