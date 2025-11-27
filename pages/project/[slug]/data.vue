<template>
    <div class="p-4">
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
