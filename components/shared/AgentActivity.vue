<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Fieldset from 'primevue/fieldset';
import Message from 'primevue/message';
import Tag from 'primevue/tag';

// An agent run's visible work as one chronology: per-round reasoning in
// collapsible Fieldset disclosures and one bordered Tag per tool
// invocation (icon + technical name; a failed tool's error Message
// beneath it), in the order they happened. The same component renders
// the live run and the provenance persisted on the bot's reply — the
// answer itself is not rendered here, it is the message body at both
// sites. The pre-step presence is not this block's: the assistant rides
// the chat's typing line until there is anything to show (the host
// owns that indicator).
const props = defineProps({
    activity: { type: Object, required: true },
    live: { type: Boolean, default: false }
});

const { t } = useI18n();

const steps = computed(() => props.activity.steps || []);
const toolIcon = (status) => ({
    done: 'pi pi-check',
    error: 'pi pi-exclamation-triangle'
}[status] || 'pi pi-spin pi-spinner');

// The thinking disclosure's collapsed state, tracked beside Fieldset's
// internal one through the toggle event — pt is reactive, so the
// collapsed state can restyle the root.
const collapsedThinking = ref(new Set());
const onThinkingToggle = (index) => {
    const next = new Set(collapsedThinking.value);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    collapsedThinking.value = next;
};

// Compact geometry (legend padding/gap, root insets) lives in the
// PrimeVue tokens (assets/tokens) and applies to every Fieldset; this
// pt owns only what tokens cannot express — the caption-size label,
// the +/− svg (`.p-icon` pins 1rem), the chronology's tighter root,
// and the collapsed state: a collapsed disclosure is a quiet caption
// line, so the box strips entirely.
const thinkingPtFor = (index) => {
    const caption = {
        legendLabel: { class: 'text-supporting' },
        toggleIcon: { style: { width: '0.75rem', height: '0.75rem' } }
    };
    return collapsedThinking.value.has(index)
        ? {
            ...caption,
            root: { style: { padding: '0', borderWidth: '0', background: 'transparent' } },
            legend: { style: { background: 'transparent' } }
        }
        : {
            ...caption,
            root: { style: { padding: '0 0.5rem 0.25rem 0.5rem' } }
        };
};
// Aura's Tag is a centered, bold badge; the chronology wants a
// left-aligned, regular-weight pill at its content width — the flex
// column would otherwise stretch it full-width and center its label.
const tagPt = {
    root: { style: { fontWeight: '400', justifyContent: 'flex-start' } },
    label: { class: 'truncate' }
};
</script>

<template>
    <div class="flex min-w-0 flex-col gap-1 text-muted text-supporting" data-testid="agent-activity">
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
                :pt="thinkingPtFor(index)"
                class="min-w-0"
                data-testid="agent-thinking"
                @toggle="onThinkingToggle(index)"
            >
                <p class="m-0 text-muted text-supporting whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{{ step.text }}</p>
            </Fieldset>
            <div v-else class="flex min-w-0 flex-col gap-0.5 px-1" data-testid="agent-tool">
                <Tag
                    :value="step.name"
                    :icon="toolIcon(step.status)"
                    severity="secondary"
                    :pt="tagPt"
                    class="self-start min-w-0 max-w-full"
                />
                <Message v-if="step.error" severity="error" size="small" :closable="false">
                    {{ step.error }}
                </Message>
            </div>
        </template>
    </div>
</template>
