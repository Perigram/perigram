<template>
  <div class="flex flex-col items-center justify-center min-h-screen bg-surface-950 text-surface-0 p-8 text-center">
    <div class="flex flex-col gap-4 mb-12">
        <div class="opacity-10 select-none text-metric">
            {{ error?.statusCode || 500 }}
        </div>
        <p class="m-0 opacity-90 text-metric">
            {{ error?.message || 'Unexpected system error' }}
        </p>
    </div>
    
    <div class="flex gap-4">
        <Button 
            label="Go Back" 
            icon="pi pi-arrow-left" 
            severity="secondary" 
            text
            @click="handleError" 
        />
        <Button 
            label="Dashboard" 
            icon="pi pi-home" 
            @click="navigateTo('/')" 
        />
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  error: Object
});

const handleError = () => clearError({ redirect: '/' });
</script>