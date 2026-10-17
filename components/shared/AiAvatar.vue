<template>
    <!-- The AI identity face, shared by every surface that shows the
         assistant (see the shared README): the microchip glyph in the
         brand accent on a whisper accent tint with a hairline accent
         ring. Sizing rides class fallthrough onto the Avatar; chip-size
         sites also shrink the glyph (`[&_.p-avatar-icon]:text-supporting`)
         because Aura pins it at a fixed size. -->
    <Avatar
        icon="pi pi-microchip-ai"
        shape="circle"
        class="border bg-[color-mix(in_srgb,var(--p-accent-color)_8%,transparent)] text-accent [border-color:color-mix(in_srgb,var(--p-accent-color)_30%,transparent)]"
    />
</template>

<script setup>
import Avatar from 'primevue/avatar';
</script>
