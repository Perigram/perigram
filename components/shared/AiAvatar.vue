<template>
    <!-- Typography utilities set font-family; icon glyphs shrink by
         font-size alone. -->
    <Avatar
        icon="pi pi-microchip-ai"
        shape="circle"
        class="bg-subtle text-accent"
    />
</template>

<script setup>
import Avatar from 'primevue/avatar';
</script>

<style scoped>
/* Site font-size shrinks ride a fixed-size .p-avatar-icon box; flex
   centers the glyph inside it. */
.p-avatar-icon {
    display: flex;
    align-items: center;
    justify-content: center;
}
</style>
