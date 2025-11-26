<template>
    <BatchManagement :project-slug="slug" />
</template>

<script setup>
import { useRoute } from 'vue-router';
import BatchManagement from '~/components/BatchManagement.vue';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const route = useRoute();
const slug = route.params.slug;
</script>