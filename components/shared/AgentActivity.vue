<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// An agent run's visible work: the model's reasoning in a collapsible
// disclosure and one row per tool invocation as it starts and settles.
// The same component renders the live run (open, with a pending state
// before the first token) and the provenance persisted on the bot's reply
// (collapsed). The answer itself is not rendered here — it is the message
// body at both sites.
const props = defineProps({
    activity: { type: Object, required: true },
    live: { type: Boolean, default: false }
});

const { t } = useI18n();

const tools = computed(() => props.activity.tools || []);
const pending = computed(() => props.live && !props.activity.thinking && !tools.value.length && !props.activity.answer);
const toolIcon = (status) => (status === 'done' ? 'pi pi-check' : status === 'error' ? 'pi pi-exclamation-triangle' : 'pi pi-spin pi-spinner');
</script>

<template>
    <div class="flex min-w-0 flex-col gap-1 text-muted text-supporting" data-testid="agent-activity">
        <div v-if="pending" class="flex items-center gap-2 px-1">
            <i class="pi pi-spin pi-spinner" aria-hidden="true" />
        </div>
        <!-- The bound `open` only sets the initial state per instance (the
             value never changes), so the user's own toggling survives. -->
        <details v-if="activity.thinking" :open="live" class="min-w-0" data-testid="agent-thinking">
            <summary class="cursor-pointer select-none">{{ t('support.thinking') }}</summary>
            <p class="m-0 mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{{ activity.thinking }}</p>
        </details>
        <div
            v-for="tool in tools"
            :key="tool.id"
            class="flex min-w-0 items-center gap-2 px-1"
            data-testid="agent-tool"
        >
            <i :class="toolIcon(tool.status)" aria-hidden="true" />
            <span class="min-w-0 truncate">{{ tool.name }}</span>
        </div>
    </div>
</template>
