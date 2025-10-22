<template>
    <div v-if="user.name" class="profile">
        <MainTitle :label="user.name" class="profile__title" />
        <div class="profile__content">
            <Avatar />
            <MainButton :theme="themeType.primary" @click="logoutHandler" label="Logout" class="profile__btn" />
        </div>
        <UserBalance class="profile__balance" />
        <MainButton :theme="themeType.secondary" @click="addCredits" label="Add 100 coins (dev)" class="profile__add-credits" />
        <BuyCredits />
    </div>
</template>
<script setup>
import { themeType } from '~~/constants/theme.constants';

const router = useRouter();

definePageMeta({
    layout: "profile",
    middleware: "auth",
});

const { getters, actions } = authStore;
const { logout } = actions;
const user = computed(() => getters.user);

const logoutHandler = async () => {
    await logout();
    router.push({ path: '/' })
};

const addCredits = async () => {
    try {
        await $fetch('/api/user/add-credits', {
            method: 'POST',
            body: { amount: 100 }
        });
    } catch (error) {
        console.error('Failed to add credits:', error);
    }
};
</script>
<style lang="scss" scoped>
.profile {
    &__title {
        margin-bottom: 16px;
    }

    &__content {
        display: flex;
        align-items: center;
    }

    &__btn {
        margin-left: 24px;
    }

    &__balance {
        margin-top: 24px;
        margin-bottom: 24px;
    }

    &__add-credits {
        margin-bottom: 24px;
    }
}
</style>
