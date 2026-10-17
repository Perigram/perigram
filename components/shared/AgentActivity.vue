<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Fieldset from 'primevue/fieldset';
import Message from 'primevue/message';

// An agent run's visible work as one quiet chronology: per-round
// reasoning in collapsible Fieldsets and one caption row per tool
// invocation, in the order they happened. The same component renders
// the live run and the provenance persisted on the bot's reply — the
// answer itself is not rendered here, it is the message body at both
// sites.
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

// Compact disclosure on the elements that carry Aura's sizing: the
// toggle button tightens (it owns the real padding on toggleable
// fieldsets), the label drops to the caption voice, and the +/− svg
// scales with it (.p-icon pins 1rem, so it needs explicit size).
const thinkingPt = {
    root: { style: { padding: '0 0.5rem 0.25rem 0.5rem' } },
    toggleButton: { style: { padding: '0.25rem 0.5rem', gap: '0.375rem' } },
    legendLabel: { class: 'text-supporting' },
    toggleIcon: { style: { width: '0.75rem', height: '0.75rem' } }
};
</script>

<template>
    <div class="flex min-w-0 flex-col gap-1 text-muted text-supporting" data-testid="agent-activity">
        <div v-if="pending" class="flex items-center gap-2 px-1">
            <i class="pi pi-spin pi-spinner" aria-hidden="true" />
        </div>
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
            <div v-else class="flex min-w-0 flex-col gap-0.5 px-1" data-testid="agent-tool">
                <span class="flex min-w-0 items-center gap-2">
                    <i :class="toolIcon(step.status)" class="shrink-0 scale-75" aria-hidden="true" />
                    <span class="min-w-0 flex-1 truncate text-technical">{{ step.name }}</span>
                </span>
                <Message v-if="step.error" severity="error" size="small" :closable="false">
                    {{ step.error }}
                </Message>
            </div>
        </template>
    </div>
</template>
