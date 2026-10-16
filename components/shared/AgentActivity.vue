<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// An agent run's visible work as one chronology: per-round reasoning in
// collapsible disclosures interleaved with one row per tool invocation,
// in the order they happened. The same component renders the live run
// (open, with a pending state before the first token) and the provenance
// persisted on the bot's reply (collapsed). The answer itself is not
// rendered here — it is the message body at both sites.
const props = defineProps({
    activity: { type: Object, required: true },
    live: { type: Boolean, default: false }
});

const { t } = useI18n();

const steps = computed(() => props.activity.steps || []);
const pending = computed(() => props.live && !steps.value.length && !props.activity.answer);
const toolIcon = (status) => (status === 'done' ? 'pi pi-check' : status === 'error' ? 'pi pi-exclamation-triangle' : 'pi pi-spin pi-spinner');
</script>

<template>
    <div class="flex min-w-0 flex-col gap-1 text-muted text-supporting" data-testid="agent-activity">
        <div v-if="pending" class="flex items-center gap-2 px-1">
            <i class="pi pi-spin pi-spinner" aria-hidden="true" />
        </div>
        <template v-for="(step, index) in steps" :key="step.kind === 'tool' ? step.id : `thinking-${index}`">
            <!-- Reasoning stays open with the answer — the live stream and
                 the persisted message render the same visible chronology.
                 The bound `open` only sets the initial state per instance
                 (the value never changes), so the user's own toggling
                 survives. -->
            <details v-if="step.kind === 'thinking'" open class="min-w-0" data-testid="agent-thinking">
                <summary class="cursor-pointer select-none">{{ t('support.thinking') }}</summary>
                <p class="m-0 mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{{ step.text }}</p>
            </details>
            <div
                v-else
                class="flex min-w-0 items-center gap-2 px-1"
                data-testid="agent-tool"
            >
                <i :class="toolIcon(step.status)" aria-hidden="true" />
                <span class="min-w-0 truncate">{{ step.name }}</span>
            </div>
        </template>
    </div>
</template>
