<template>
  <iframe
    :src="src"
    :title="t('knowledge.title')"
    class="h-full w-full border-0"
    data-knowledge-editor
  />
</template>

<script setup>
import { useI18n } from 'vue-i18n';

/**
 * The org-wide OpenKnowledge editor hosted in a home-workspace tab.
 * Served same-origin through the authenticated proxy
 * (`/api/knowledge/proxy/`), so the session cookie carries admission on
 * every request the editor makes and its relative asset paths resolve
 * against the proxy prefix.
 */
defineProps({
  src: { type: String, default: '/api/knowledge/proxy/' }
});

const { t } = useI18n();
</script>
