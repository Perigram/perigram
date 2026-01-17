<template>
    <div class="p-4">
        <Message severity="info">
            {{ $t('profile.projectDataComingSoon') }}
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
