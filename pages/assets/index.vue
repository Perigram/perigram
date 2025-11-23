<template>
    <div class="assets-page">
        <TabView>
            <TabPanel :header="$t('cassette.title')">
                <CassetteManager />
            </TabPanel>
            <TabPanel :header="$t('templates.title')">
                <TemplatesManager />
            </TabPanel>
        </TabView>
    </div>
</template>

<script setup>
import TabView from 'primevue/tabview';
import TabPanel from 'primevue/tabpanel';
import CassetteManager from '~/components/CassetteManager.vue';
import TemplatesManager from '~/components/TemplatesManager.vue';

definePageMeta({
    layout: 'app',
    middleware: 'auth'
});
</script>

<style scoped lang="scss">
.assets-page {
    width: 100%;
    max-width: 1400px;
    margin: 0 auto;
}
</style>
