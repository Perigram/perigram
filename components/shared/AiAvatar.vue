<template>
    <!-- The AI identity face, shared by every surface that shows the
         assistant (see the shared README): the sparkles glyph in the
         brand accent on the subtle surface — the same shape as every
         other glyph avatar. Sizing rides class fallthrough onto the
         Avatar; chip-size sites also shrink the glyph
         (`[&_.p-avatar-icon]:text-supporting`) because Aura pins it at a
         fixed size. -->
    <Avatar
        icon="pi pi-sparkles"
        shape="circle"
        class="bg-subtle text-accent"
    />
</template>

<script setup>
import Avatar from 'primevue/avatar';
</script>
