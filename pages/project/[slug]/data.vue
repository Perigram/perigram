<template>
    <div class="project-data">
        <Message severity="info">
            Project data management coming soon
        </Message>
    </div>
</template>

<script setup>
import Message from 'primevue/message';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});
</script>

<style scoped>
.project-data {
    padding: 1rem;
}
</style>
