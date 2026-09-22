<template>
  <iframe
    :src="editorSrc"
    :title="t('knowledge.title')"
    class="h-full w-full border-0"
    data-knowledge-editor
  />
</template>

<script setup>
import { useI18n } from 'vue-i18n';
import { useRuntimeConfig } from '#imports';

/**
 * The org-wide OpenKnowledge editor hosted in a home-workspace tab. The
 * iframe targets the editor's own published origin
 * (`runtimeConfig.public.openknowledgeEditorUrl`), never the app origin:
 * OpenKnowledge's /collab websocket dials the origin it is served from,
 * and the Nuxt dev server cannot survive that reconnect storm. Admission
 * gates the menu entry server-side; the editor port itself is trusted to
 * the deployment network in dev.
 */
const { t } = useI18n();
const { public: publicConfig } = useRuntimeConfig();

// Trailing slash matters: OpenKnowledge emits relative asset paths.
const editorSrc = `${publicConfig.openknowledgeEditorUrl.replace(/\/+$/, '')}/`;
</script>
