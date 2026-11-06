<template>
  <div
    v-if="stationId"
    :class="[
      'flex h-9 shrink-0 items-center border-b border-chrome-border px-2',
      chrome === 'bare' ? 'border-none p-0' : 'justify-end'
    ]"
  >
    <Button
      icon="pi pi-list-check"
      text
      rounded
      size="small"
      :aria-label="$t('uiMapping.declareType')"
      :title="$t('uiMapping.declareType')"
      data-testid="type-declare-entry"
      @click="open"
    />
  </div>
</template>

<script setup>
// The author affordance (SPEC §1, owner direction 2026-11-06): opens the
// type's declaration editor as a workspace page. It renders only while
// the same grant that admits the process designer (the organization
// system screen's `organizations:admin`) is held AND the active
// definition's draft declares the type — pack and plugin types with no
// authored declaration render nothing. Host chrome (`bar`, the pane
// stripe) or bare (the routed page's action space) is the host's choice;
// the app host owns it, never generated region content.
import { onMounted, ref } from 'vue';
import Button from 'primevue/button';
import { useAuthStore } from '~/stores/auth';
import { useDeclarationStation } from '~/composables/useDeclarationStation.js';
import { openWorkspacePageFromChrome } from '~/utils/workspace-page-open.js';

const props = defineProps({
  typeId: { type: String, default: '' },
  chrome: { type: String, default: 'bar' }
});

const authStore = useAuthStore();
const stationId = ref(null);
const { declaringDefinitionFor } = useDeclarationStation();

onMounted(() => {
  if (!props.typeId || !authStore.hasPermission('organizations', 'admin')) return;
  declaringDefinitionFor(props.typeId).then(id => {
    stationId.value = id;
  });
});

function open() {
  openWorkspacePageFromChrome({
    pageId: 'typeDeclaration',
    typeId: props.typeId,
    params: { type: props.typeId, definition: stationId.value || '' }
  });
}
</script>
