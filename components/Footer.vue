<template>
    <footer class="mt-auto">
        <Divider />
        <div class="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6 py-8">
            <div class="flex items-center gap-8">
                <NuxtLink 
                    to="/terms-and-conditions" 
                    class="no-underline"
                >
                    <small>{{ $t('common.terms') }}</small>
                </NuxtLink>
                <a 
                    href="mailto:support@cutkit.io" 
                    class="no-underline"
                >
                    <small>{{ $t('support.email') }}</small>
                </a>
            </div>
            
            <div class="flex items-center gap-4">
                <small>
                    &copy; {{ new Date().getFullYear() }} CutKit. All rights reserved.
                </small>
            </div>
        </div>
    </footer>
</template>

<script setup>
import Divider from 'primevue/divider';
</script>