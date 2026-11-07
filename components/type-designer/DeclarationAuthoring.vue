<template>
  <slot />
</template>

<script setup>
// The surface-authoring provider (SPEC §1, owner direction 2026-11-07):
// declaration authoring happens on the generated surfaces — fields in the
// record page's property block, states in the state surface — gated by the
// process-design capability and the declaration station. It creates the one
// authoring session over the stationing definition draft
// (useDeclarationAuthoring) and provides it to the surface affordances;
// it renders no chrome of its own.
import { onMounted, provide } from 'vue';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import { useI18n } from 'vue-i18n';
import { useDeclarationAuthoring } from './useDeclarationAuthoring.js';

const props = defineProps({
  typeId: { type: String, default: '' }
});

const { t } = useI18n();
const toast = useToast();
const confirm = useConfirm();

const authoring = useDeclarationAuthoring({ typeId: props.typeId, t, toast, confirm });
provide('declarationAuthoring', authoring);

onMounted(() => {
  authoring.resolve();
});
</script>
