<template>
  <TypeDeclarationEditor :type-id="typeId" :definition-id="definitionId" />
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRoute, onBeforeRouteLeave } from 'vue-router';
import TypeDeclarationEditor from '~/components/type-designer/TypeDeclarationEditor.vue';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const route = useRoute();
const typeId = computed(() => String(route.query.type || ''));
const definitionId = computed(() => String(route.query.definition || ''));

const editor = ref(null);
onBeforeRouteLeave(async () => {
  if (!editor.value?.confirmLeave) return true;
  return await editor.value.confirmLeave();
});
</script>
