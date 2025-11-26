<template>
    <div class="container mx-auto px-4 py-8">
        <PartLibrary />
    </div>
</template>

<script setup>
import PartLibrary from '~/components/PartLibrary.vue';

definePageMeta({
    layout: "app",
    middleware: "auth",
});
</script>


<style scoped>
/* Add any specific styles for the parts page here */
</style>

