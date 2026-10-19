<template>
    <button
        type="button"
        class="flex min-w-0 max-w-full items-center gap-1.5 text-left transition-opacity hover:opacity-80"
        :aria-label="displayName"
        @click.stop="open"
    >
        <AiAvatar v-if="isBot" :class="avatarClass" />
        <Avatar
            v-else
            :image="avatarUrl"
            :label="avatarUrl ? null : displayName.charAt(0).toUpperCase()"
            shape="circle"
            :class="avatarClass"
        />
        <span v-if="!avatarOnly" class="min-w-0 truncate text-supporting">{{ displayName }}</span>
    </button>
</template>

<script setup>
import Avatar from 'primevue/avatar';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import AiAvatar from '~/components/shared/AiAvatar.vue';
import { useEntityPopup } from '~/composables/useEntityPopup';
import { useInstancesStore } from '~/stores/instances';

// The user identity chip. Resolution rides the readable-reference seam:
// the users feature DTO for org-mates (identity.name, data.avatarUrl,
// data.bot), the directory card otherwise. A click opens the shared
// entity popup. The Avatar label stays null while an image is set —
// PrimeVue renders label over image.
const props = defineProps({
    userId: { type: [String, Number], required: true },
    // Optional display-name hint while (or instead of) the record resolves.
    name: { type: String, default: '' },
    // The avatar-gutter variant: avatar at message scale, no name text.
    avatarOnly: { type: Boolean, default: false }
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

const displayName = computed(() => resolved.value?.name
    || resolved.value?.identity?.name
    || props.name
    || t('common.user'));
const avatarUrl = computed(() => resolved.value?.fields?.avatarUrl
    || resolved.value?.data?.avatarUrl
    || '');
const avatarClass = computed(() => props.avatarOnly
    ? 'h-9 w-9 shrink-0 bg-subtle text-supporting [&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover [&_.p-avatar-icon]:text-[0.875rem]'
    : 'h-5 w-5 shrink-0 bg-subtle text-supporting [&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover [&_.p-avatar-icon]:text-[0.75rem]');
// The bot marker drives the shared AI glyph.
const isBot = computed(() => Boolean(resolved.value?.fields?.bot || resolved.value?.data?.bot));

const open = () => {
    openEntityPopup({ typeId: 'user', instanceId: String(props.userId) });
};
</script>
