<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Fieldset from 'primevue/fieldset';
import Message from 'primevue/message';
import Timeline from 'primevue/timeline';

// An agent run's visible work as one chronology: a Timeline whose events
// are the run's steps — per-round reasoning in collapsible Fieldsets and
// one tool invocation per event, in the order they happened. The same
// component renders the live run and the provenance persisted on the
// bot's reply — the answer itself is not rendered here, it is the
// message body at both sites.
const props = defineProps({
    activity: { type: Object, required: true },
    live: { type: Boolean, default: false }
});

const { t } = useI18n();

const steps = computed(() => props.activity.steps || []);
const pending = computed(() => props.live && !steps.value.length && !props.activity.answer);
const toolIcon = (status) => ({
    done: 'pi pi-check text-status-success',
    error: 'pi pi-exclamation-triangle text-status-danger'
}[status] || 'pi pi-spin pi-spinner');

// Compact disclosure: Aura zeroes the legend itself for toggleable
// fieldsets and pads the toggle BUTTON, so the pt targets that element —
// overriding the legend section would shrink only the label text and
// leave the control oversized.
const thinkingPt = {
    root: { style: { padding: '0 0.5rem 0.375rem 0.5rem' } },
    toggleButton: { style: { padding: '0.25rem 0.5rem' } },
    legendLabel: { class: 'text-supporting' }
};

// Chronology density: Timeline defaults to tall events with a wide
// opposite column; the run's steps sit tight on the marker rail.
const chronologyPt = {
    event: { style: { minHeight: 0 } },
    eventOpposite: { style: { display: 'none' } },
    eventContent: { style: { padding: '0 0 0.5rem 0.5rem' } }
};
</script>

<template>
    <div class="flex min-w-0 flex-col text-muted text-supporting" data-testid="agent-activity">
        <div v-if="pending" class="flex items-center gap-2 px-1">
            <i class="pi pi-spin pi-spinner" aria-hidden="true" />
        </div>
        <Timeline v-else :value="steps" :pt="chronologyPt">
            <template #marker="{ item }">
                <i v-if="item.kind === 'tool'" :class="toolIcon(item.status)" aria-hidden="true" />
                <i v-else class="pi pi-circle-fill scale-50" aria-hidden="true" />
            </template>
            <template #content="{ item }">
                <!-- Reasoning starts open at both sites so the chronology
                     stays visible with the answer; `collapsed` only seeds
                     the initial state, so the user's own toggling
                     survives. -->
                <Fieldset
                    v-if="item.kind === 'thinking'"
                    :legend="t('support.thinking')"
                    toggleable
                    :collapsed="false"
                    :pt="thinkingPt"
                    class="min-w-0"
                    data-testid="agent-thinking"
                >
                    <p class="m-0 text-muted text-supporting whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{{ item.text }}</p>
                </Fieldset>
                <div v-else class="flex min-w-0 flex-col gap-1" data-testid="agent-tool">
                    <span class="min-w-0 truncate text-technical">{{ item.name }}</span>
                    <Message v-if="item.error" severity="error" size="small" :closable="false">
                        {{ item.error }}
                    </Message>
                </div>
            </template>
        </Timeline>
    </div>
</template>
