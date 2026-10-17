<template>
    <button
        type="button"
        class="flex min-w-0 max-w-full items-center gap-1.5 text-left transition-opacity hover:opacity-80"
        :aria-label="displayName"
        @click.stop="open"
    >
        <AiAvatar
            v-if="isBot"
            class="h-5 w-5 shrink-0 [&_.p-avatar-icon]:text-supporting"
        />
        <Avatar
            v-else
            :image="avatarUrl"
            :label="avatarUrl ? null : displayName.charAt(0).toUpperCase()"
            shape="circle"
            class="h-5 w-5 shrink-0 bg-subtle text-supporting [&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover"
        />
        <span class="min-w-0 truncate text-supporting">{{ displayName }}</span>
    </button>
</template>

<script setup>
import Avatar from 'primevue/avatar';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import AiAvatar from '~/components/shared/AiAvatar.vue';
import { useEntityPopup } from '~/composables/useEntityPopup';
import { useInstancesStore } from '~/stores/instances';

// The user identity chip: avatar plus display name, never the generic
// instance-ref face (type glyph plus identifier field — which renders the
// users icon and the email for the served user type). Resolution rides the
// instances store's readable-reference seam, so org-mates resolve through
// the users list and everyone else through the directory card — both carry
// `data.avatarUrl`. A left click opens the shared entity popup (the user's
// directory profile), the same surface the direct-thread title opens.
// The avatar's letter label must be null whenever the image is set:
// PrimeVue's Avatar renders label over image, so a constant label would
// hide every avatar (the bug that made avatars look private to their own
// user).
const props = defineProps({
    userId: { type: [String, Number], required: true },
    // Optional display-name hint while (or instead of) the record resolves.
    name: { type: String, default: '' }
});

const { t } = useI18n();
const instances = useInstancesStore();
const { open: openEntityPopup } = useEntityPopup();
const resolved = ref(null);

watch(() => props.userId, async (id) => {
    resolved.value = null;
    if (!id) return;
    resolved.value = await instances.resolveReadableReference('user', String(id), { silent: true });
}, { immediate: true });

const displayName = computed(() => resolved.value?.identity?.name
    || props.name
    || t('common.user'));
const avatarUrl = computed(() => resolved.value?.data?.avatarUrl || '');
// The org assistant carries the bot marker (users feature): its chip
// face is the shared AI glyph, never an image or letter.
const isBot = computed(() => Boolean(resolved.value?.data?.bot));

const open = () => {
    openEntityPopup({ typeId: 'user', instanceId: String(props.userId) });
};
</script>
