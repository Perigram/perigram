<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Fieldset from 'primevue/fieldset';
import Message from 'primevue/message';
import { useRegistryStore } from '~/stores/registry';

// An agent run's visible work as one chronology: per-round reasoning in
// collapsible Fieldset disclosures and one small typed Message per tool
// invocation — localized tool name with the call's detail, severity by
// outcome, a failed tool's error inside the same message — in the order
// they happened. The same component renders the live run and the
// provenance persisted on the bot's reply — the answer itself is not
// rendered here, it is the message body at both sites. The pre-step
// presence is not this block's: the assistant rides the chat's typing
// line until there is anything to show (the host owns that indicator).
const props = defineProps({
    activity: { type: Object, required: true },
    live: { type: Boolean, default: false }
});

const { t } = useI18n();
const registry = useRegistryStore();

const steps = computed(() => props.activity.steps || []);
const toolSeverity = (status) => ({
    done: 'secondary',
    error: 'error'
}[status] || 'info');
const toolIcon = (status) => ({
    done: 'pi pi-check',
    error: 'pi pi-exclamation-triangle'
}[status] || 'pi pi-spin pi-spinner');
// Tool names localize off the catalog's fixed vocabulary; a tool the
// catalog never served renders its raw name rather than a blank line
// (the t-versus-key miss idiom, not te — te is locale-strict).
const toolLabel = (step) => {
    const key = `support.agentTools.${step.name}`;
    const translated = t(key);
    return translated === key ? String(step.name || '') : translated;
};
// Detail parts that name a type resolve through the served registry
// when it is loaded; authored names and action slugs render as stored.
const toolText = (step) => {
    const detail = String(step.detail || '')
        .split(' · ')
        .map(part => registry.typeRecord(part)?.name || part)
        .join(' · ');
    return toolLabel(step)
        + (detail ? ` — ${detail}` : '')
        + (step.error ? `: ${step.error}` : '');
};

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
// pt owns only what tokens cannot express — the caption-size,
// regular-weight label, the +/− svg (`.p-icon` pins 1rem), the
// chronology's tighter root, and the collapsed state: the box's border
// goes, but the legend strip keeps its filled surface and its exact
// horizontal position, so a collapsed disclosure reads as kin to the
// tool messages and nothing shifts.
const thinkingPtFor = (index) => {
    const caption = {
        legendLabel: { class: 'text-supporting', style: { fontWeight: '400' } },
        toggleIcon: { style: { width: '0.75rem', height: '0.75rem' } }
    };
    return collapsedThinking.value.has(index)
        ? {
            ...caption,
            root: { style: { padding: '0 0.5rem 0 0.5rem', borderWidth: '0', background: 'transparent' } }
        }
        : {
            ...caption,
            root: { style: { padding: '0 0.5rem 0.25rem 0.5rem' } }
        };
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
            <Message
                v-else
                :severity="toolSeverity(step.status)"
                :icon="toolIcon(step.status)"
                size="small"
                :closable="false"
                class="mx-1 self-start min-w-0 max-w-full"
                data-testid="agent-tool"
            >
                <span class="min-w-0 break-words [overflow-wrap:anywhere]">{{ toolText(step) }}</span>
            </Message>
        </template>
    </div>
</template>
