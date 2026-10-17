<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Fieldset from 'primevue/fieldset';
import Message from 'primevue/message';
import Skeleton from 'primevue/skeleton';

// An agent run's visible work as one chronology of bordered Fieldset
// surfaces: per-round reasoning in collapsible disclosures, one
// non-toggleable surface per tool invocation (status icon + technical
// name in the legend, the failure Message as content), and a skeleton
// pulse while the run has produced nothing yet. The same component
// renders the live run and the provenance persisted on the bot's reply
// — the answer itself is not rendered here, it is the message body at
// both sites.
const props = defineProps({
    activity: { type: Object, required: true },
    live: { type: Boolean, default: false }
});

const { t } = useI18n();

const steps = computed(() => props.activity.steps || []);
const pending = computed(() => props.live && !steps.value.length && !props.activity.answer);
const toolIcon = (status) => ({
    done: 'pi pi-check',
    error: 'pi pi-exclamation-triangle'
}[status] || 'pi pi-spin pi-spinner');

// Compact disclosures on the elements that carry Aura's sizing. The
// toggleable thinking box pads its toggle BUTTON (the legend itself is
// zeroed); the non-toggleable tool surfaces pad the legend, which owns
// the padding in that shape.
const thinkingPt = {
    root: { style: { padding: '0 0.5rem 0.25rem 0.5rem' } },
    toggleButton: { style: { padding: '0.25rem 0.5rem', gap: '0.375rem' } },
    legendLabel: { class: 'text-supporting' },
    toggleIcon: { style: { width: '0.75rem', height: '0.75rem' } }
};
const stepPt = {
    root: { style: { padding: '0 0.5rem 0.25rem 0.5rem' } },
    legend: { style: { padding: '0.25rem 0.5rem' } }
};
</script>

<template>
    <div class="flex min-w-0 flex-col gap-1 text-muted text-supporting" data-testid="agent-activity">
        <Fieldset v-if="pending" :pt="stepPt" class="min-w-0" data-testid="agent-pending">
            <template #legend>{{ t('support.thinking') }}</template>
            <div class="flex items-center gap-1 py-1 pl-0.5">
                <Skeleton v-for="dot in 3" :key="dot" shape="circle" size="0.375rem" />
            </div>
        </Fieldset>
        <template v-for="(step, index) in steps" :key="step.kind === 'tool' ? step.id : `thinking-${index}`">
            <!-- Reasoning starts open at both sites so the chronology
                 stays visible with the answer; `collapsed` only seeds
                 the initial state, so the user's own toggling
                 survives. -->
            <Fieldset
                v-if="step.kind === 'thinking'"
                :legend="t('support.thinking')"
                toggleable
                :collapsed="false"
                :pt="thinkingPt"
                class="min-w-0"
                data-testid="agent-thinking"
            >
                <p class="m-0 text-muted text-supporting whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{{ step.text }}</p>
            </Fieldset>
            <Fieldset v-else :pt="stepPt" class="min-w-0" data-testid="agent-tool">
                <template #legend>
                    <span class="flex min-w-0 items-center gap-2 text-muted">
                        <i :class="toolIcon(step.status)" class="shrink-0 scale-75" aria-hidden="true" />
                        <span class="min-w-0 truncate text-technical">{{ step.name }}</span>
                    </span>
                </template>
                <Message v-if="step.error" severity="error" size="small" :closable="false">
                    {{ step.error }}
                </Message>
            </Fieldset>
        </template>
    </div>
</template>
