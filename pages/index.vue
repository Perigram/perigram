<template>
    <div></div>
</template>

<script setup>
definePageMeta({
    middleware: 'auth'
});

// Redirect to appropriate page
const { data: user } = await useFetch('/api/user');
if (user.value) {
    navigateTo('/projects');
} else {
    navigateTo('/landing');
}
</script>
