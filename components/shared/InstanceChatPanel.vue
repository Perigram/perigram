<template>
  <section class="flex min-w-0 flex-col gap-2" data-testid="instance-chat-panel">
    <!-- A section disclosure, not a container: this paints no chrome of its
         own. The header row is the toggle, and the thread (ChatSupport's own
         chrome) is the content. -->
    <button
      type="button"
      class="flex min-w-0 items-center gap-2 self-start text-supporting"
      :aria-expanded="!collapsed"
      :aria-controls="threadId"
      @click="collapsed = !collapsed"
    >
      <i
        class="pi shrink-0"
        :class="collapsed ? 'pi-comments' : 'pi-chevron-down'"
        aria-hidden="true"
      />
      <span class="truncate">{{ $t('support.instanceChat') }}</span>
    </button>
    <!-- Bounded host: the embedded thread owns its scrolling, never the
         detail page height. The bound is the shared chat dimension token, so
         this surface matches every other chat host in the app. -->
    <div
      v-if="!collapsed"
      :id="threadId"
      class="flex h-support-chat max-h-[calc(100dvh-6rem)] min-h-0 flex-col overflow-hidden"
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
 * The instance detail page's conversation section: a collapsed-by-default
 * disclosure that expands a `ChatSupport` thread pinned to
 * `entity:<type>:<id>` in thread-only mode, so the detail page carries the
 * composed conversation without the inbox or back navigation.
 *
 * It is a SECTION, deliberately not a Panel: the detail page's column already
 * owns section rhythm, and the thread supplies its own chrome. A host box here
 * would add a second surface frame around it.
 *
 * The expanded host is bounded by the shared `h-support-chat` dimension so the
 * thread scrolls itself; in bounded (flush) detail hosts this section is part
 * of the scrolling column, so the thread never fights the host for height.
 */
import { computed, ref, useId } from 'vue'

const props = defineProps({
  type: { type: String, required: true },
  id: { type: String, required: true },
  name: { type: String, default: '' }
})

const collapsed = ref(true)
const entityKey = computed(() => `entity:${props.type}:${props.id}`)
const threadId = useId()
</script>
